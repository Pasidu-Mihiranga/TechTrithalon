#!/usr/bin/env bash
# Smoke test for the running Compose stack. Verifies every Phase 0 exit-gate link:
#   web serves  ·  web origin may call the API (CORS)  ·  Spring up  ·  Spring -> Python  ·  seeded data present
set -euo pipefail

# Use the same environment file as Compose, including isolated synthetic verification stacks.
smoke_env_file="${SMOKE_ENV_FILE:-.env}"
if [[ -f "$smoke_env_file" ]]; then set -a; source "$smoke_env_file"; set +a; fi
API="${API_URL:-http://localhost:${API_PORT:-8080}}"
WEB="${WEB_URL:-http://localhost:${WEB_PORT:-5173}}"
INTEL="${INTELLIGENCE_URL:-http://localhost:${INTELLIGENCE_PORT:-8000}}"
TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-180}"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }
wait_for() { # url
  local deadline=$((SECONDS + TIMEOUT))
  until curl -fsS -o /dev/null "$1" 2>/dev/null; do
    (( SECONDS < deadline )) || fail "timed out waiting for $1"
    sleep 2
  done
}
json_field() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

echo "waiting for services..."
wait_for "$INTEL/health"
wait_for "$API/actuator/health"
wait_for "$WEB/"

echo "1/5 web serves the app"
curl -fsS "$WEB/" | grep -q '<div id="root">' || fail "web did not return the app shell"

echo "2/5 Spring is healthy and reports Python reachable (Spring -> Python)"
health=$(curl -fsS "$API/api/v1/system/health")
[[ "$(echo "$health" | json_field "['status']")" == "ok" ]] || fail "api status not ok: $health"
[[ "$(echo "$health" | json_field "['intelligence']")" == "reachable" ]] || fail "Spring cannot reach Python: $health"

echo "3/5 browser origin $WEB may call the API (React -> Spring, CORS)"
cors=$(curl -fsS -D - -o /dev/null -H "Origin: $WEB" "$API/api/v1/system/health" | tr -d '\r' | grep -i '^access-control-allow-origin' || true)
[[ "$cors" == *"$WEB"* ]] || fail "CORS does not allow $WEB (got: '${cors:-none}')"

echo "4/5 authenticated reference data is seeded"
[[ -n "${SEED_DISPATCHER_PASSWORD:-}" ]] || fail "set SEED_DISPATCHER_PASSWORD in .env"
cookies=$(mktemp)
login_body=$(mktemp)
error_headers=$(mktemp)
error_body=$(mktemp)
trap 'rm -f -- "${cookies:?}" "${login_body:?}" "${error_headers:?}" "${error_body:?}"' EXIT
python3 -c 'import os,json; print(json.dumps({"username":os.environ.get("SEED_DISPATCHER_USERNAME", "DSP-001"),"password":os.environ["SEED_DISPATCHER_PASSWORD"]}))' > "$login_body"
curl -fsS -c "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary "@$login_body" "$API/api/v1/auth/login" > /dev/null
summary=$(curl -fsS -b "$cookies" "$API/api/v1/reference/summary")
for key in outlets vehicles calendarDays districts serviceAllowances; do
  n=$(echo "$summary" | json_field "['$key']")
  (( n > 0 )) || fail "$key is 0: $summary"
done

echo "Phase 3: reference reads and unrecorded fleet state"
for path in outlets vehicles districts depots service-allowances; do
  curl -fsS -b "$cookies" "$API/api/v1/reference/$path" > /dev/null || fail "reference $path failed"
done
demo_date=$(echo "$summary" | json_field "['demoOperatingDate']")
first_vehicle=$(curl -fsS -b "$cookies" "$API/api/v1/reference/vehicles" | json_field "[0]['vehicleId']")
first_outlet=$(curl -fsS -b "$cookies" "$API/api/v1/reference/outlets" | json_field "[0]['outletId']")
curl -fsS -b "$cookies" "$API/api/v1/reference/outlets/$first_outlet" > /dev/null
curl -fsS -b "$cookies" "$API/api/v1/reference/vehicles/$first_vehicle" > /dev/null
curl -fsS -b "$cookies" "$API/api/v1/reference/calendar?from=$demo_date&to=$demo_date" > /dev/null
for path in availability fuel; do
  curl -fsS -b "$cookies" "$API/api/v1/dispatcher/vehicles/$first_vehicle/$path?date=$demo_date" > /dev/null || fail "fleet $path failed"
done
[[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookies" "$API/api/v1/reference/outlets/UNKNOWN")" == "404" ]] || fail "unknown outlet did not return 404"

assert_failure() { # expected status, code, then curl arguments
  local expected_status="$1" expected_code="$2"
  shift 2
  local actual_status
  actual_status=$(curl -sS -D "$error_headers" -o "$error_body" -w '%{http_code}' "$@")
  [[ "$actual_status" == "$expected_status" ]] || fail "expected $expected_status, got $actual_status"
  EXPECTED_ERROR_CODE="$expected_code" python3 - "$error_headers" "$error_body" <<'PYCODE'
import json, os, re, sys
from pathlib import Path
headers = Path(sys.argv[1]).read_text()
body = json.loads(Path(sys.argv[2]).read_text())
trace = re.search(r'^x-request-id:\s*(.+)$', headers, re.I | re.M)
assert body['code'] == os.environ['EXPECTED_ERROR_CODE'], body
assert trace and body['traceId'] == trace.group(1).strip(), body
assert not any(value in str(body) for value in ['SQLException', 'java.lang', 'stackTrace']), body
PYCODE
}

echo "Phase 5: planning snapshot freeze"
depot=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&size=1" | json_field "['items'][0]['depot']")
[[ -n "$depot" && "$depot" != "None" ]] || fail "no depot from reference"
queue=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders/summary?date=$demo_date&depot=$depot")
(( $(echo "$queue" | json_field "['totalOrders']") > 0 )) || fail "confirmed queue is empty"
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&depot=$depot&parkingConstraint=van_only&size=1" > /dev/null
assert_failure 400 INVALID_FILTER -b "$cookies" "$API/api/v1/dispatcher/orders?parkingConstraint=invalid"
assert_failure 401 UNAUTHENTICATED "$API/api/v1/dispatcher/orders/summary?date=$demo_date&depot=$depot"
assert_failure 404 NOT_FOUND -b "$cookies" "$API/api/v1/dispatcher/orders/summary?date=$demo_date&depot=UNKNOWN"
snap=$(curl -fsS -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d "{\"planDate\":\"$demo_date\",\"depot\":\"$depot\"}" \
  "$API/api/v1/dispatcher/planning/snapshots")
snap_id=$(echo "$snap" | json_field "['id']")
snap_hash=$(echo "$snap" | json_field "['contentHash']")
[[ -n "$snap_id" && "$snap_id" != "None" ]] || fail "snapshot id missing: $snap"
[[ "$(echo "$snap" | json_field "['depot']")" == "$depot" ]] || fail "snapshot depot mismatch"
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/planning/snapshots/$snap_id" > /dev/null || fail "snapshot get failed"
[[ "$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/planning/snapshots/$snap_id/compare" | json_field "['unchanged']")" == "True" \
  || "$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/planning/snapshots/$snap_id/compare" | json_field "['unchanged']")" == "true" ]] \
  || fail "snapshot compare should be unchanged"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d "{\"planDate\":\"$demo_date\",\"depot\":\"$depot\"}" \
  "$API/api/v1/dispatcher/planning/snapshots")" == "401" ]] || fail "unauthenticated snapshot did not return 401"
[[ "$(echo "$snap" | json_field "['inputs']['schemaVersion']")" == "1" ]] || fail "complete snapshot inputs missing"
expected_count=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&depot=$depot&status=confirmed&size=1" | json_field "['total']")
[[ "$(echo "$snap" | json_field "['orderCount']")" == "$expected_count" ]] || fail "snapshot membership count mismatch"
assert_failure 404 NOT_FOUND -b "$cookies" "$API/api/v1/dispatcher/planning/snapshots/999999999"
assert_failure 400 VALIDATION_FAILED -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d "{\"planDate\":\"$demo_date\",\"depot\":\"$depot\",\"orderIds\":[-1]}" "$API/api/v1/dispatcher/planning/snapshots"
echo "Phase 5 snapshot ok id=$snap_id hash=${snap_hash:0:12}"

echo "Manual planning: persisted candidate and guarded reads"
candidate=$(curl -fsS -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d "{\"snapshotId\":$snap_id,\"reason\":\"Smoke verification\"}" "$API/api/v1/dispatcher/plans")
plan_id=$(echo "$candidate" | json_field "['plan']['id']")
[[ "$(echo "$candidate" | json_field "['plan']['status']")" == "candidate" ]] || fail "manual plan was not persisted as a candidate"
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/plans/$plan_id" > /dev/null
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/plans?date=$demo_date&depot=$depot" > /dev/null
changes=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/plans/$plan_id/changes")
[[ "$(echo "$changes" | json_field "['planId']")" == "$plan_id" ]] || fail "plan changes did not describe the candidate: $changes"
assert_failure 404 NOT_FOUND -b "$cookies" "$API/api/v1/dispatcher/plans/999999999/changes"
assert_failure 401 UNAUTHENTICATED "$API/api/v1/dispatcher/plans/$plan_id"
assert_failure 404 NOT_FOUND -b "$cookies" "$API/api/v1/dispatcher/plans/999999999"
assert_failure 400 VALIDATION_FAILED -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d "{\"snapshotId\":$snap_id,\"reason\":\"\"}" "$API/api/v1/dispatcher/plans"
if (( expected_count > 0 )); then
  assert_failure 422 ORDER_ACCOUNTING -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
    -d '{"expectedVersion":0,"reason":"Smoke verification of publication gate"}' "$API/api/v1/dispatcher/plans/$plan_id/publish"
fi

echo "Phase 3A: demo-day orders, dashboard and fleet reads"
dashboard=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/dashboard?date=$demo_date")
[[ "$(echo "$dashboard" | json_field "['ordersToPlan']['available']")" == "True" || "$(echo "$dashboard" | json_field "['ordersToPlan']['available']")" == "true" ]] || fail "ordersToPlan unavailable: $dashboard"
orders_to_plan=$(echo "$dashboard" | json_field "['ordersToPlan']['value']")
(( orders_to_plan > 0 )) || fail "ordersToPlan is 0: $dashboard"
[[ "$(echo "$dashboard" | json_field "['ordersPlanned']['available']")" == "True" ]] || fail "persisted planned-order count should be available"
planned_page=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&status=planned&size=1")
[[ "$(echo "$dashboard" | json_field "['ordersPlanned']['value']")" == "$(echo "$planned_page" | json_field "['total']")" ]] || fail "planned-order count mismatch"
order_page=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&status=confirmed,deferred&size=1")
[[ "$(echo "$order_page" | json_field "['total']")" == "$orders_to_plan" ]] || fail "orders total mismatch: $order_page vs $orders_to_plan"
first_order_id=$(echo "$order_page" | json_field "['items'][0]['id']")
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders/$first_order_id" > /dev/null
fleet=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/fleet?date=$demo_date")
fleet_len=$(echo "$fleet" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
(( fleet_len > 0 )) || fail "fleet list empty"
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/fleet/$(echo "$fleet" | json_field "[0]['vehicleId']")?date=$demo_date" > /dev/null

assert_failure 403 FORBIDDEN -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
  -d '{"tempRequirement":"ambient","units":1,"weightKg":10,"volumeM3":0.1}' "$API/api/v1/store/orders"
assert_failure 404 NOT_FOUND -b "$cookies" "$API/api/v1/dispatcher/orders/999999999"

echo "Deferral history: run summary and store notices (read-only)"
deferral_run=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/deferrals?date=$demo_date&depot=$depot")
[[ "$(echo "$deferral_run" | json_field "['deferredOrders']")" == "$(echo "$deferral_run" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")" ]] \
  || fail "deferral total does not match its rows: $deferral_run"
assert_failure 400 BAD_REQUEST -b "$cookies" "$API/api/v1/dispatcher/deferrals?date=not-a-date"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' "$API/api/v1/store/deferrals")" == "401" ]] || fail "anonymous store deferrals did not return 401"

echo "5/5 requests carry a trace id"
curl -fsS -D - -o /dev/null "$API/api/v1/system/health" | tr -d '\r' | grep -qi '^x-request-id' || fail "missing X-Request-Id header"

echo "Phase 2: session restore, revocation and every seeded role"
[[ "$(curl -fsS -b "$cookies" "$API/api/v1/auth/me" | json_field "['role']")" == "DISPATCHER" ]] || fail "dispatcher session not restored"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookies" -H 'X-Requested-With: Waypoint' -X POST "$API/api/v1/auth/logout")" == "204" ]] || fail "logout failed"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookies" "$API/api/v1/auth/me")" == "401" ]] || fail "revoked session still works"
for role in STORE_MANAGER LOADER DRIVER; do
  export SMOKE_ROLE="$role"
  python3 -c 'import os,json; role=os.environ["SMOKE_ROLE"]; print(json.dumps({"username":os.environ.get("SEED_"+role+"_USERNAME", {"STORE_MANAGER":"STM-001","LOADER":"LDR-001","DRIVER":"DRV-001"}[role]), "password":os.environ["SEED_"+role+"_PASSWORD"]}))' > "$login_body"
  curl -fsS -c "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary "@$login_body" "$API/api/v1/auth/login" > /dev/null
  [[ "$(curl -fsS -b "$cookies" "$API/api/v1/auth/me" | json_field "['role']")" == "$role" ]] || fail "$role session not restored"
  expected=403
  [[ "$role" == "STORE_MANAGER" ]] && expected=200
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookies" "$API/api/v1/reference/summary")" == "$expected" ]] || fail "$role reference guard failed"
  if [[ "$role" == "STORE_MANAGER" ]]; then
    curl -fsS -b "$cookies" "$API/api/v1/store/cutoff" > /dev/null || fail "store cutoff failed"
    curl -fsS -b "$cookies" "$API/api/v1/store/orders" > /dev/null || fail "store orders failed"
    curl -fsS -b "$cookies" "$API/api/v1/store/deferrals" > /dev/null || fail "store deferral notices failed"
    assert_failure 403 FORBIDDEN -b "$cookies" "$API/api/v1/dispatcher/deferrals?date=$demo_date&depot=$depot"
    assert_failure 404 NOT_FOUND -b "$cookies" -H 'X-Requested-With: Waypoint' -X POST "$API/api/v1/store/deferrals/999999999/acknowledge"
    assert_failure 403 FORBIDDEN -b "$cookies" "$API/api/v1/dispatcher/planning/snapshots/$snap_id"
    assert_failure 403 FORBIDDEN -b "$cookies" "$API/api/v1/dispatcher/plans/$plan_id"
    assert_failure 400 VALIDATION_FAILED -b "$cookies" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
      -d '{"tempRequirement":"ambient","units":0,"weightKg":10,"volumeM3":0.1}' "$API/api/v1/store/orders"
    echo "Phase 4: store place-order (accept create or demo-day duplicate)"
    place_code=$(curl -sS -o /tmp/smoke-place.json -w '%{http_code}' -b "$cookies" \
      -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
      -d '{"tempRequirement":"ambient","units":2,"weightKg":10,"volumeM3":0.05}' \
      "$API/api/v1/store/orders")
    if [[ "$place_code" == "201" ]]; then
      [[ "$(json_field "['status']" < /tmp/smoke-place.json)" == "confirmed" ]] || fail "placed order not confirmed"
    elif [[ "$place_code" == "409" ]]; then
      [[ "$(json_field "['code']" < /tmp/smoke-place.json)" == "DUPLICATE_TEMP_ORDER" ]] || fail "unexpected 409 on place: $(cat /tmp/smoke-place.json)"
      place_code=$(curl -sS -o /tmp/smoke-place.json -w '%{http_code}' -b "$cookies" \
        -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
        -d '{"tempRequirement":"chilled","units":2,"weightKg":10,"volumeM3":0.05}' \
        "$API/api/v1/store/orders")
      [[ "$place_code" == "201" || "$place_code" == "409" ]] || fail "chilled place failed: $place_code $(cat /tmp/smoke-place.json)"
    else
      fail "place order unexpected status $place_code: $(cat /tmp/smoke-place.json)"
    fi
    [[ "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' \
      -d '{"tempRequirement":"ambient","units":0,"weightKg":10,"volumeM3":0.05}' \
      "$API/api/v1/store/orders")" == "401" ]] || fail "unauthenticated place did not return 401"
  fi
  curl -fsS -b "$cookies" -H 'X-Requested-With: Waypoint' -X POST "$API/api/v1/auth/logout" > /dev/null
 done
unset SMOKE_ROLE
echo "SMOKE OK: $summary · demo orders=$orders_to_plan · all four sessions and role guards passed"
