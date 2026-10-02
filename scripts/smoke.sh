#!/usr/bin/env bash
# Smoke test for the running Compose stack. Verifies every Phase 0 exit-gate link:
#   web serves  ·  web origin may call the API (CORS)  ·  Spring up  ·  Spring -> Python  ·  seeded data present
set -euo pipefail

# Use the ports from .env when present, so the script matches whatever Compose started.
if [[ -f .env ]]; then set -a; source .env; set +a; fi
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
trap 'rm -f -- "${cookies:?}" "${login_body:?}"' EXIT
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

echo "Phase 3A: demo-day orders, dashboard and fleet reads"
dashboard=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/dashboard?date=$demo_date")
[[ "$(echo "$dashboard" | json_field "['ordersToPlan']['available']")" == "True" || "$(echo "$dashboard" | json_field "['ordersToPlan']['available']")" == "true" ]] || fail "ordersToPlan unavailable: $dashboard"
orders_to_plan=$(echo "$dashboard" | json_field "['ordersToPlan']['value']")
(( orders_to_plan > 0 )) || fail "ordersToPlan is 0: $dashboard"
[[ "$(echo "$dashboard" | json_field "['ordersPlanned']['available']")" == "False" || "$(echo "$dashboard" | json_field "['ordersPlanned']['available']")" == "false" ]] || fail "ordersPlanned should be unavailable until Phase 7"
order_page=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders?date=$demo_date&size=1")
[[ "$(echo "$order_page" | json_field "['total']")" == "$orders_to_plan" ]] || fail "orders total mismatch: $order_page vs $orders_to_plan"
first_order_id=$(echo "$order_page" | json_field "['items'][0]['id']")
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/orders/$first_order_id" > /dev/null
fleet=$(curl -fsS -b "$cookies" "$API/api/v1/dispatcher/fleet?date=$demo_date")
fleet_len=$(echo "$fleet" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
(( fleet_len > 0 )) || fail "fleet list empty"
curl -fsS -b "$cookies" "$API/api/v1/dispatcher/fleet/$(echo "$fleet" | json_field "[0]['vehicleId']")?date=$demo_date" > /dev/null

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
  fi
  curl -fsS -b "$cookies" -H 'X-Requested-With: Waypoint' -X POST "$API/api/v1/auth/logout" > /dev/null
 done
unset SMOKE_ROLE
echo "SMOKE OK: $summary · demo orders=$orders_to_plan · all four sessions and role guards passed"
