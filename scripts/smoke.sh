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

echo "4/5 reference data is seeded"
summary=$(curl -fsS "$API/api/v1/reference/summary")
for key in outlets vehicles calendarDays districts serviceAllowances; do
  n=$(echo "$summary" | json_field "['$key']")
  (( n > 0 )) || fail "$key is 0: $summary"
done

echo "5/5 requests carry a trace id"
curl -fsS -D - -o /dev/null "$API/api/v1/system/health" | tr -d '\r' | grep -qi '^x-request-id' || fail "missing X-Request-Id header"

echo "SMOKE OK: $summary"
