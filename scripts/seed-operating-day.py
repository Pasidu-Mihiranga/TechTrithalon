#!/usr/bin/env python3
"""Seed an operating day from existing orders through the four-role API flow.

Source orders and fleet come from PostgreSQL; the delivery and dispute actions
are deliberate demo scenarios. Spring validates plans and computes business
values. Only the explicit --reset path writes directly to PostgreSQL.

Phases
  reset   optional, explicit clearing of operational rows and order statuses
  plan    snapshot -> candidate -> propose trips -> defer what will not fit -> publish
  run     drive one vehicle's first trip through loading, delivery and receipt
  verify  print the resulting row counts

The seeded accounts are scoped, so the judge-visible path is narrow: the loader
sees one depot, the driver sees one vehicle, the store manager sees one outlet.
The script therefore puts the store's orders on that driver's vehicle, drives
its first trip to a finished state, and leaves its second trip untouched so a
judge can still run loading, delivery and receipt end to end.

Use --verify-only to check the existing day. Use --reset to clear all existing
operational records and re-seed; this also restores order statuses.
Use --enrich-existing to add an active driver trip, a store receipt awaiting
confirmation and an open loading issue to an already published day.
Use --seed-offline-arrival to replay the driver's next stop arrival through the
sync API. It is safe to repeat after the arrival has been recorded.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from http.cookiejar import CookieJar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Operational rows only. Reference data (outlet, vehicle, district_travel,
# service_allowance, calendar_day, app_user) and the order rows themselves are
# never deleted, because the dataset is not in the repository.
OPERATIONAL_TABLES = [
    "audit_event",
    "deferral_acknowledgement",
    "deferral",
    "delivery_record",
    "delivery_trip",
    "fuel_ledger",
    "load_line",
    "load_task",
    "loading_issue",
    "operational_exception",
    "plan_order_disposition",
    "plan",
    "planning_snapshot",
    "pod_asset",
    "receipt_confirmation",
    "receipt_discrepancy",
    "stop_visit",
    "stop",
    "sync_command",
    "trip",
]


def load_env() -> dict:
    env = dict(os.environ)
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        with open(path) as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                env.setdefault(key.strip(), value.strip())
    return env


class ApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, body: str):
        super().__init__(f"{method} {path} -> {status} {body[:400]}")
        self.status = status
        self.body = body


class Session:
    """One signed-in role. Cookies are kept per session, as the browser does."""

    def __init__(self, base: str, username: str, password: str | None, label: str):
        if not password:
            raise SystemExit(f"Set the seeded password for {label} in .env")
        self.base = base
        self.label = label
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(CookieJar())
        )
        self.call("POST", "/api/v1/auth/login", {"username": username, "password": password})

    def call(self, method: str, path: str, body=None, expect=(200, 201)):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("X-Requested-With", "Waypoint")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(request, timeout=60) as response:
                text = response.read().decode()
                status = response.status
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            status = error.code
        if expect is not None and status not in expect:
            raise ApiError(method, path, status, text)
        return status, (json.loads(text) if text else None)

    def get(self, path):
        return self.call("GET", path)[1]

    def post(self, path, body=None):
        return self.call("POST", path, body)[1]

    def try_post(self, path, body=None):
        return self.call("POST", path, body, expect=None)


def psql(env: dict, sql: str) -> str:
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres", "psql",
         "-U", env.get("POSTGRES_USER", "techtrithalon"),
         "-d", env.get("POSTGRES_DB", "techtrithalon"),
         "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", " | ", "-c", sql],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise SystemExit(f"psql failed: {result.stderr.strip()}")
    return result.stdout.strip()


def reset_operational(env: dict) -> None:
    before = psql(env, "select count(*) from trip")
    psql(env, "begin; truncate " + ", ".join(OPERATIONAL_TABLES)
         + "; update customer_order set status='confirmed', planning_date=order_date, version=0; commit;")
    print(f"reset: cleared operational rows (trips before={before}), orders restored to confirmed")


def num(value) -> Decimal:
    return Decimal(str(value or 0))


def fits(pack: list, order: dict, vehicle: dict) -> bool:
    volume = sum(num(o["volumeM3"]) for o in pack) + num(order["volumeM3"])
    weight = sum(num(o["weightKg"]) for o in pack) + num(order["weightKg"])
    return volume <= num(vehicle["volumeCapM3"]) and weight <= num(vehicle["weightCapKg"])


def vehicle_suits(vehicle: dict, orders: list) -> bool:
    if any(o["temp"] == "chilled" for o in orders) and vehicle["temp"] != "reefer":
        return False
    if any(o["parkingConstraint"] == "van_only" for o in orders) and vehicle["type"] != "van":
        return False
    return True


class Planner:
    """Proposes trips and lets the API validate every one of them."""

    def __init__(self, dispatcher: Session, plan_id: int, version: int):
        self.api = dispatcher
        self.plan = plan_id
        self.version = version
        self.trips_used: dict[str, int] = {}
        self.assigned: set[int] = set()
        self.rejected = 0

    def add_trip(self, vehicle: dict, brand: str, district: str, orders: list) -> bool:
        """Try the pack, shrinking it until the server accepts or nothing is left."""
        pack = list(orders)
        vid = vehicle["vehicleId"]
        while pack:
            index = self.trips_used.get(vid, 0) + 1
            if index > 2:
                return False
            status, body = self.api.try_post(
                f"/api/v1/dispatcher/plans/{self.plan}/trips",
                {"expectedVersion": self.version, "reason": "Seeded operating day",
                 "trip": {"vehicleId": vid, "tripIndex": index, "brand": brand,
                          "district": district, "orderIds": [o["id"] for o in pack]}},
            )
            if status == 200:
                self.version += 1
                self.trips_used[vid] = index
                self.assigned.update(o["id"] for o in pack)
                return True
            if status != 422:
                raise ApiError("POST", "trips", status, json.dumps(body))
            self.rejected += 1
            pack.pop()
        return False

    def defer(self, order: dict) -> None:
        self.api.post(
            f"/api/v1/dispatcher/plans/{self.plan}/orders/{order['id']}/defer",
            {"expectedVersion": self.version, "reasonCode": "OTHER",
             "reason": "No remaining vehicle at this depot could take the order within "
                       "capacity, temperature, outlet access and trip-time limits.",
             "nextDeliveryDate": None},
        )
        self.version += 1


def plan_day(dispatcher: Session, env: dict, store_outlet: str, driver_vehicle: str) -> dict:
    summary = dispatcher.get("/api/v1/reference/summary")
    date = summary["demoOperatingDate"]
    depot = env.get("SEED_DEPOT", "Peliyagoda")

    snapshot = dispatcher.post("/api/v1/dispatcher/planning/snapshots",
                               {"planDate": date, "depot": depot})
    candidate = dispatcher.post("/api/v1/dispatcher/plans",
                                {"snapshotId": snapshot["id"], "reason": "Seeded operating day"})
    plan_id = candidate["plan"]["id"]
    orders = [item["order"] for item in candidate["unassignedOrders"]]
    fleet = [v for v in candidate["fleet"]
             if v["depot"] == depot and v["availabilityStatus"] == "available"]
    by_id = {v["vehicleId"]: v for v in fleet}
    print(f"plan: date={date} depot={depot} orders={len(orders)} available vehicles={len(fleet)}")

    planner = Planner(dispatcher, plan_id, candidate["plan"]["lockVersion"])

    # The store manager only sees one outlet, so its orders must ride on the
    # driver's vehicle: trip 1 is driven to a finish, trip 2 is left for a judge.
    van = by_id.get(driver_vehicle)
    store_orders = [o for o in orders if o["outletId"] == store_outlet]
    if not van:
        raise SystemExit(f"FAILED: {driver_vehicle} is unavailable for the seeded driver")
    if len(store_orders) < 2:
        raise SystemExit(f"FAILED: {store_outlet} needs two orders to leave trip 2 actionable")

    anchors = store_orders[:2]
    reserved = {o["id"] for o in anchors}
    for seat, anchor in enumerate(anchors):
        if not van:
            break
        pack = [anchor]
        for other in orders:
            if other["id"] in planner.assigned or other["id"] in reserved:
                continue
            if (other["brand"], other["district"]) != (anchor["brand"], anchor["district"]):
                continue
            if vehicle_suits(van, pack + [other]) and fits(pack, other, van):
                pack.append(other)
        if planner.add_trip(van, anchor["brand"], anchor["district"], pack):
            reserved.discard(anchor["id"])
            print(f"  trip {seat + 1} on {driver_vehicle}: {len(pack)} orders "
                  f"({anchor['brand']}/{anchor['district']}, anchor {anchor['orderRef']})")
        else:
            print(f"  trip {seat + 1} on {driver_vehicle}: rejected for {anchor['orderRef']}")

    # Everything else: one brand and district per trip, biggest groups first.
    groups: dict[tuple, list] = {}
    for order in orders:
        if order["id"] in planner.assigned:
            continue
        groups.setdefault((order["brand"], order["district"]), []).append(order)

    for key in sorted(groups, key=lambda k: -len(groups[k])):
        brand, district = key
        queue = sorted(groups[key], key=lambda o: -num(o["volumeM3"]))
        while queue:
            placed = False
            for vehicle in fleet:
                if planner.trips_used.get(vehicle["vehicleId"], 0) >= 2:
                    continue
                pack: list = []
                for order in queue:
                    if vehicle_suits(vehicle, pack + [order]) and fits(pack, order, vehicle):
                        pack.append(order)
                if not pack:
                    continue
                if planner.add_trip(vehicle, brand, district, pack):
                    queue = [o for o in queue if o["id"] not in planner.assigned]
                    placed = True
                    break
            if not placed:
                break

    leftover = [o for o in orders if o["id"] not in planner.assigned]
    for order in leftover:
        planner.defer(order)
    print(f"  assigned={len(planner.assigned)} deferred={len(leftover)} "
          f"trips={sum(planner.trips_used.values())} server rejections handled={planner.rejected}")

    published = dispatcher.post(f"/api/v1/dispatcher/plans/{plan_id}/publish",
                                {"expectedVersion": planner.version,
                                 "reason": "Publish the seeded operating day"})
    print(f"  published: status={published['plan']['status']} version={published['plan'].get('version')}")
    return {"planId": plan_id, "date": date, "depot": depot}


def load_trip(loader: Session, vehicle: str, trip_index: int) -> bool:
    board = loader.get("/api/v1/loader/board")
    card = next((t for t in board["trips"]
                 if t["vehicleId"] == vehicle and t["tripIndex"] == trip_index), None)
    if not card:
        print(f"  loader: no task for {vehicle} trip {trip_index}")
        return False
    task_id = card["loadTaskId"]
    detail = loader.get(f"/api/v1/loader/load-tasks/{task_id}")
    if detail["card"]["awaitingAcknowledgement"]:
        detail = loader.post(f"/api/v1/loader/load-tasks/{task_id}/acknowledge",
                             {"expectedVersion": detail["task"]["version"]})
    for stop in detail["stops"]:
        for line in stop["lines"]:
            if line["status"] != "pending":
                continue
            detail = loader.post(
                f"/api/v1/loader/load-tasks/{task_id}/lines/{line['id']}/loaded",
                {"expectedVersion": detail["task"]["version"]})
    blockers = detail.get("handoverBlockers") or []
    if blockers:
        print(f"  loader: cannot hand over: {blockers}")
        return False
    detail = loader.post(f"/api/v1/loader/load-tasks/{task_id}/loaded",
                         {"expectedVersion": detail["task"]["version"]})
    print(f"  loader: {vehicle} trip {trip_index} handed over "
          f"({detail['card']['orders']} orders, {detail['card']['stops']} stops)")
    return True


def drive_trip(driver: Session, trip_index: int) -> list:
    home = driver.get("/api/v1/driver/home")
    card = next((t for t in home["trips"] if t["tripIndex"] == trip_index), None)
    if not card:
        print(f"  driver: no trip {trip_index}")
        return []
    base = f"/api/v1/driver/trips/{trip_index}"
    detail = driver.get(base)
    if detail["card"]["state"] == "READY":
        detail = driver.post(f"{base}/start", {"planVersion": card["planVersion"]})
    delivered = []
    for stop in detail["stops"]:
        outlet = stop["outletId"]
        if stop["status"] == "PENDING":
            detail = driver.post(f"{base}/stops/{outlet}/arrive",
                                 {"expectedVersion": detail["version"]})
        current = next(s for s in detail["stops"] if s["outletId"] == outlet)
        for order in current["orders"]:
            if order.get("outcome"):
                continue
            detail = driver.post(
                f"{base}/orders/{order['orderId']}/outcome",
                {"expectedVersion": detail["version"], "outcome": "DELIVERED",
                 "recipientName": "Shop Counter", "proofIds": []})
            delivered.append(order)
        detail = driver.post(f"{base}/stops/{outlet}/depart",
                             {"expectedVersion": detail["version"]})
    detail = driver.post(f"{base}/complete", {"expectedVersion": detail["version"]})
    print(f"  driver: trip {trip_index} completed, {len(delivered)} orders delivered")
    return delivered


def settle_receipts(store: Session, dispatcher: Session, dispute_units: int = 2) -> None:
    rows = store.get("/api/v1/store/deliveries")
    pending = [r for r in (rows.get("rows") or rows)
               if r.get("outcome") and r.get("receipt") == "NONE"]
    if not pending:
        raise SystemExit("FAILED: store has no delivered order awaiting receipt")
    disputed = pending[0]
    order_id = disputed["orderId"]
    store.post(f"/api/v1/store/deliveries/{order_id}/issue",
               {"kind": "SHORT", "affectedUnits": dispute_units,
                "note": "Two units short against the delivery note"})
    print(f"  store: disputed order {order_id} as SHORT ({dispute_units} units)")
    for row in pending[1:]:
        store.post(f"/api/v1/store/deliveries/{row['orderId']}/receipt")
    if len(pending) > 1:
        print(f"  store: confirmed {len(pending) - 1} further deliveries")

    items = dispatcher.get("/api/v1/dispatcher/receipt-discrepancies")
    target = next((d for d in items if d["orderId"] == order_id and d["status"] == "OPEN"), None)
    if not target:
        raise SystemExit("FAILED: dispatcher cannot see the store dispute")
    dispatcher.post(f"/api/v1/dispatcher/receipt-discrepancies/{target['id']}/resolve",
                    {"expectedVersion": target["version"], "decision": "CREDIT",
                     "note": "Credit the two short units on the next invoice"})
    print(f"  dispatcher: resolved the dispute on order {order_id} as CREDIT")


def verify(env: dict, expect_stages: bool = True) -> None:
    rows = psql(env, """
        select 'trips', count(*)::text from trip
        union all select 'load_tasks', count(*)::text from load_task
        union all select 'stops', count(*)::text from stop
        union all select 'delivery_records', count(*)::text from delivery_record
        union all select 'deferrals', count(*)::text from deferral
        union all select 'receipt_discrepancies', count(*)::text from receipt_discrepancy
        union all select 'order status: '||status, count(*)::text
            from customer_order group by status order by 1;""")
    print("verify:")
    for line in rows.splitlines():
        print("  " + line.strip())

    counts = dict(line.split(" | ", 1) for line in rows.splitlines())
    total_orders = int(psql(env, "select count(*) from customer_order"))
    status_total = sum(int(value) for key, value in counts.items()
                       if key.startswith("order status: "))
    if status_total != total_orders:
        raise SystemExit(f"FAILED: order status accounting {status_total} != {total_orders}")
    if int(counts.get("trips", 0)) != int(counts.get("load_tasks", 0)):
        raise SystemExit("FAILED: published trips and load tasks differ")
    if int(counts.get("delivery_records", 0)) > int(counts.get("stops", 0)):
        raise SystemExit("FAILED: more delivery records than planned stops")

    operational = psql(env, """
        select 'published_plans', count(*) from plan where status='published'
        union all select 'completed_trips', count(*) from delivery_trip where status='completed'
        union all select 'loaded_tasks', count(*) from load_task where status='loaded'
        union all select 'resolved_disputes', count(*) from receipt_discrepancy where status='RESOLVED'
        union all select 'receipt_confirmations', count(*) from receipt_confirmation;""")
    stages = {key: int(value) for key, value in
              (line.split(" | ", 1) for line in operational.splitlines())}
    print("  " + " · ".join(f"{key}={value}" for key, value in stages.items()))
    if stages["published_plans"] != 1 or not int(counts.get("trips", 0)):
        raise SystemExit("FAILED: expected one published plan with trips")
    if stages["resolved_disputes"] > stages["receipt_confirmations"]:
        raise SystemExit("FAILED: resolved disputes exceed receipt records")
    if expect_stages and (stages["completed_trips"] < 1 or stages["loaded_tasks"] < 1
                          or stages["resolved_disputes"] < 1
                          or int(counts.get("order status: receipt_confirmed", 0)) < 1):
        raise SystemExit("FAILED: four-role lifecycle has not reached receipt resolution")
    print("VERIFY OK: order accounting, publication, load tasks and receipt links")


def verify_role_views(env: dict, base: str, vehicle: str, outlet: str) -> None:
    plan_id = psql(env, "select id from plan where status='published' order by id desc limit 1")
    dispatcher = Session(base, env.get("SEED_DISPATCHER_USERNAME", "DSP-001"),
                         env.get("SEED_DISPATCHER_PASSWORD"), "dispatcher")
    loader = Session(base, env.get("SEED_LOADER_USERNAME", "LDR-001"),
                     env.get("SEED_LOADER_PASSWORD"), "loader")
    driver = Session(base, env.get("SEED_DRIVER_USERNAME", "DRV-001"),
                     env.get("SEED_DRIVER_PASSWORD"), "driver")
    store = Session(base, env.get("SEED_STORE_MANAGER_USERNAME", "STM-001"),
                    env.get("SEED_STORE_MANAGER_PASSWORD"), "store manager")
    plan = dispatcher.get(f"/api/v1/dispatcher/plans/{plan_id}")
    tasks = loader.get("/api/v1/loader/board")["trips"]
    trips = driver.get("/api/v1/driver/home")["trips"]
    deliveries = store.get("/api/v1/store/deliveries")["rows"]
    if plan["plan"]["status"] != "published":
        raise SystemExit("FAILED: dispatcher cannot read the published plan")
    if not any(t["vehicleId"] == vehicle and t["tripIndex"] == 2 for t in tasks):
        raise SystemExit("FAILED: loader cannot see the remaining second trip")
    if not any(t["tripIndex"] == 2 for t in trips):
        raise SystemExit("FAILED: driver cannot see the remaining second trip")
    if not any(r["receipt"] == "NONE" for r in deliveries):
        raise SystemExit(f"FAILED: store manager at {outlet} has no actionable delivery")
    print(f"ROLE VIEWS OK: dispatcher plan {plan_id}, loader and driver trip 2, "
          f"store deliveries={len(deliveries)}")


def enrich_existing(env: dict, base: str, vehicle: str, outlet: str) -> None:
    """Add actionable states through role APIs; a repeat run skips completed steps."""
    dispatcher = Session(base, env.get("SEED_DISPATCHER_USERNAME", "DSP-001"),
                         env.get("SEED_DISPATCHER_PASSWORD"), "dispatcher")
    loader = Session(base, env.get("SEED_LOADER_USERNAME", "LDR-001"),
                     env.get("SEED_LOADER_PASSWORD"), "loader")
    driver = Session(base, env.get("SEED_DRIVER_USERNAME", "DRV-001"),
                     env.get("SEED_DRIVER_PASSWORD"), "driver")
    store = Session(base, env.get("SEED_STORE_MANAGER_USERNAME", "STM-001"),
                    env.get("SEED_STORE_MANAGER_PASSWORD"), "store manager")

    board = loader.get("/api/v1/loader/board")
    if not board["openIssues"]:
        for card in board["trips"]:
            if card["vehicleId"] == vehicle or card["status"] != "pending":
                continue
            task_id = card["loadTaskId"]
            detail = loader.get(f"/api/v1/loader/load-tasks/{task_id}")
            line = next((line for stop in detail["stops"] for line in stop["lines"]
                         if line["status"] == "pending" and line["units"] > 1), None)
            if not line:
                continue
            if detail["card"]["awaitingAcknowledgement"]:
                detail = loader.post(f"/api/v1/loader/load-tasks/{task_id}/acknowledge",
                                     {"expectedVersion": detail["task"]["version"]})
            loader.post(f"/api/v1/loader/load-tasks/{task_id}/lines/{line['id']}/shortfall",
                        {"expectedVersion": detail["task"]["version"], "kind": "MISSING",
                         "shortUnits": 1, "note": "One unit missing during the loading check",
                         "holdsVehicle": True})
            print(f"  loader: open held shortfall on {card['vehicleId']} trip {card['tripIndex']}")
            break
        else:
            raise SystemExit("FAILED: no pending non-driver task can show a loading issue")
    else:
        print("  loader: existing open loading issue retained")

    deliveries = store.get("/api/v1/store/deliveries")["rows"]
    target = next((row for row in deliveries
                   if row["vehicleId"] == vehicle and row["tripIndex"] == 2), None)
    if not target or target["receipt"] != "NONE":
        raise SystemExit(f"FAILED: {outlet} has no second-trip order awaiting receipt")
    if target["phase"] != "DELIVERED":
        home = driver.get("/api/v1/driver/home")
        card = next((trip for trip in home["trips"] if trip["tripIndex"] == 2), None)
        if not card:
            raise SystemExit("FAILED: seeded driver cannot see trip 2")
        if card["state"] == "LOADING":
            if not load_trip(loader, vehicle, 2):
                raise SystemExit("FAILED: second trip could not be handed over")
            home = driver.get("/api/v1/driver/home")
            card = next(trip for trip in home["trips"] if trip["tripIndex"] == 2)
        path = "/api/v1/driver/trips/2"
        if card["state"] == "READY":
            detail = driver.post(f"{path}/start", {"planVersion": card["planVersion"]})
        elif card["state"] == "IN_PROGRESS":
            detail = driver.get(path)
        else:
            raise SystemExit(f"FAILED: trip 2 is {card['state']}; cannot leave it active")
        stop = detail["stops"][0]
        if stop["outletId"] != outlet:
            raise SystemExit(f"FAILED: first stop is {stop['outletId']}, expected {outlet}")
        if stop["status"] == "PENDING":
            detail = driver.post(f"{path}/stops/{outlet}/arrive",
                                 {"expectedVersion": detail["version"]})
        current = detail["stops"][0]
        order = next((order for order in current["orders"]
                      if order["orderId"] == target["orderId"]), None)
        if not order:
            raise SystemExit("FAILED: store order is missing from driver's first stop")
        if not order["outcome"]:
            driver.post(f"{path}/orders/{target['orderId']}/outcome",
                        {"expectedVersion": detail["version"], "outcome": "DELIVERED",
                         "recipientName": "Shop Counter", "proofIds": []})
        print(f"  driver: trip 2 active; store order {target['orderId']} delivered for receipt")
    else:
        print(f"  store: order {target['orderId']} already awaits receipt")

    queue = dispatcher.get(f"/api/v1/dispatcher/exceptions?depot={board['depot']}")
    live = dispatcher.get(f"/api/v1/dispatcher/live-operations?depot={board['depot']}")
    current = next((row for row in store.get("/api/v1/store/deliveries")["rows"]
                    if row["orderId"] == target["orderId"]), None)
    trip = next((trip for trip in driver.get("/api/v1/driver/home")["trips"]
                 if trip["tripIndex"] == 2), None)
    if (not current or current["phase"] != "DELIVERED" or current["receipt"] != "NONE"
            or not trip or trip["state"] != "IN_PROGRESS"
            or not any(row["vehicleId"] == vehicle and row["tripIndex"] == 2
                       and row["state"] in ("IN_TRANSIT", "DELAYED") for row in live["vehicles"])
            or not any(item["sourceType"] == "LOADING_ISSUE" and item["status"] == "OPEN"
                       for item in queue["items"])):
        raise SystemExit("FAILED: actionable store, driver and dispatcher states did not persist")
    print("ENRICH OK: open loading exception, active driver trip and store receipt awaiting confirmation")


def uuid7(at: datetime) -> str:
    """Generate the same time-ordered action-id format as field-core."""
    bits = bytearray(os.urandom(16))
    bits[:6] = int(at.timestamp() * 1000).to_bytes(6, "big")
    bits[6] = 0x70 | (bits[6] & 0x0f)
    bits[8] = 0x80 | (bits[8] & 0x3f)
    return str(uuid.UUID(bytes=bytes(bits)))


def seed_offline_arrival(env: dict, base: str, vehicle: str) -> None:
    """Replay one real next-stop action, leaving its order for the driver."""
    driver = Session(base, env.get("SEED_DRIVER_USERNAME", "DRV-001"),
                     env.get("SEED_DRIVER_PASSWORD"), "driver")
    home = driver.get("/api/v1/driver/home")
    card = next((t for t in home["trips"] if t["tripIndex"] == 2
                 and t["vehicleId"] == vehicle), None)
    if not card or card["state"] != "IN_PROGRESS":
        raise SystemExit("FAILED: the seeded driver's second trip is not in progress")
    detail = driver.get("/api/v1/driver/trips/2")
    stops = detail["stops"]
    pending = [s for s in stops if s["status"] == "PENDING"]
    if not pending:
        if stops and stops[-1]["status"] == "ARRIVED":
            print(f"offline seed: {stops[-1]['outletId']} already arrived; no new action needed")
            return
        raise SystemExit("FAILED: no pending next stop to arrive at")
    if len(pending) != 1 or any(s["status"] != "COMPLETED" for s in stops if s not in pending):
        raise SystemExit("FAILED: earlier stops must be completed before offline arrival")
    stop = pending[0]
    if not stop["orders"] or any(order["outcome"] for order in stop["orders"]):
        raise SystemExit("FAILED: next stop has no untouched order for the driver")
    previous = [s for s in stops if s["status"] == "COMPLETED"]
    earliest = (datetime.fromisoformat(previous[-1]["departedAt"].replace("Z", "+00:00"))
                + timedelta(seconds=1)) if previous else datetime.now(timezone.utc)
    at = max(datetime.now(timezone.utc), earliest)
    action = {"clientActionId": uuid7(at), "actionType": "STOP_ARRIVE",
              "planDate": card["planDate"], "tripIndex": 2,
              "occurredAt": at.isoformat().replace("+00:00", "Z"),
              "outletId": stop["outletId"]}
    result = driver.post("/api/v1/driver/sync", {"actions": [action]})["results"]
    if len(result) != 1 or result[0]["result"] != "APPLIED":
        raise SystemExit(f"FAILED: offline arrival was not applied: {result}")
    retry = driver.post("/api/v1/driver/sync", {"actions": [action]})["results"]
    if len(retry) != 1 or retry[0]["result"] != "DUPLICATE":
        raise SystemExit(f"FAILED: offline arrival retry was not deduplicated: {retry}")
    after = driver.get("/api/v1/driver/trips/2")
    arrived = next(s for s in after["stops"] if s["outletId"] == stop["outletId"])
    if arrived["status"] != "ARRIVED" or any(o["outcome"] for o in arrived["orders"]):
        raise SystemExit("FAILED: expected an arrived stop with its order still actionable")
    print(f"offline seed: {stop['outletId']} arrived via sync (APPLIED, retry DUPLICATE); "
          f"{len(arrived['orders'])} order(s) left for driver")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true",
                        help="irreversibly clear all operational rows before seeding")
    parser.add_argument("--verify-only", action="store_true",
                        help="check the existing operating day without changing it")
    parser.add_argument("--enrich-existing", action="store_true",
                        help="add actionable role states to the existing published day")
    parser.add_argument("--seed-offline-arrival", action="store_true",
                        help="replay one next-stop arrival through driver sync")
    parser.add_argument("--no-stages", action="store_true",
                        help="publish the day but do not drive loading, delivery or receipt")
    args = parser.parse_args()
    if sum((args.reset, args.verify_only, args.enrich_existing, args.seed_offline_arrival)) > 1:
        parser.error("--reset, --verify-only, --enrich-existing and --seed-offline-arrival are mutually exclusive")
    if (args.enrich_existing or args.seed_offline_arrival) and args.no_stages:
        parser.error("--no-stages is only for a new seed")

    env = load_env()
    base = env.get("API_URL") or f"http://localhost:{env.get('API_PORT', '8080')}"
    outlet = env.get("SEED_STORE_MANAGER_OUTLET", "OUT001")
    vehicle = env.get("SEED_DRIVER_VEHICLE", "VEH036")

    if args.verify_only:
        verify(env)
        verify_role_views(env, base, vehicle, outlet)
        return 0
    if args.enrich_existing:
        verify(env)
        enrich_existing(env, base, vehicle, outlet)
        verify(env)
        return 0
    if args.seed_offline_arrival:
        verify(env)
        seed_offline_arrival(env, base, vehicle)
        verify(env)
        return 0

    existing = int(psql(env, "select count(*) from plan"))
    if existing and not args.reset:
        raise SystemExit("Operational plans already exist. Use --verify-only to inspect, "
                         "or --reset to clear and re-seed after reviewing its impact.")
    if args.reset:
        reset_operational(env)

    dispatcher = Session(base, env.get("SEED_DISPATCHER_USERNAME", "DSP-001"),
                         env.get("SEED_DISPATCHER_PASSWORD"), "dispatcher")
    plan_day(dispatcher, env, outlet, vehicle)

    if not args.no_stages:
        loader = Session(base, env.get("SEED_LOADER_USERNAME", "LDR-001"),
                         env.get("SEED_LOADER_PASSWORD"), "loader")
        driver = Session(base, env.get("SEED_DRIVER_USERNAME", "DRV-001"),
                         env.get("SEED_DRIVER_PASSWORD"), "driver")
        store = Session(base, env.get("SEED_STORE_MANAGER_USERNAME", "STM-001"),
                        env.get("SEED_STORE_MANAGER_PASSWORD"), "store manager")
        print("run: driving the first trip to a finished state")
        if not load_trip(loader, vehicle, 1):
            raise SystemExit("FAILED: first trip was not handed to the driver")
        if not drive_trip(driver, 1):
            raise SystemExit("FAILED: first trip recorded no delivered orders")
        settle_receipts(store, dispatcher)
        print(f"  left for a judge: {vehicle} trip 2 and every other published trip")

    verify(env, expect_stages=not args.no_stages)
    verify_role_views(env, base, vehicle, outlet)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        sys.exit(1)
