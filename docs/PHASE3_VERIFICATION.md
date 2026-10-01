# Phase 3 verification — Reference Data Foundation

Verified locally on 2026-10-02. Phase 3 is complete. Phase 3A (Dispatcher and Store Manager screens) is next; Phase 0's remote GitHub CI check remains pending.

## Implemented slice

Spring exposes seeded outlet, vehicle, district travel, depot, calendar and service-allowance reads. Outlet responses derive effective delivery windows as `max(windowOpen, mallWindowOpen)` through `min(windowClose, mallWindowClose)`; the importer rejects empty intersections in one transaction. Imports retain natural IDs and use `ON CONFLICT DO NOTHING`, so repeating startup does not duplicate rows or silently overwrite existing reference values.

Fleet availability is recorded per vehicle/date with optimistic concurrency and a required reason. `expectedVersion: 0` creates a previously unrecorded day; later writes supply the last returned version. The accepted statuses are `available` and `in_workshop`. Stale writes return `409`; non-operating dates return `422`; unknown vehicles or calendar dates return `404`. Availability and its before/after audit event commit together. Actor IDs come from the authenticated principal and timestamps from the injected Clock.

A missing availability row returns `recorded: false`, `status: null`, and `version: 0`. A missing weekly ledger returns `recorded: false` and null committed, actual and remaining balances. No row is seeded merely to imply availability or unused fuel. For a recorded ledger, Spring calculates `remainingLitres = quotaLitres - committedLitres`; actual consumption is reported separately. Fuel commitments and execution updates belong to later planning/execution phases; this phase adds persistence and reads.

`OutletSelect` and `VehicleSelect` use the generated client and the shared `Select`/`RemoteSelect` controls. They handle loading, empty data, transport errors, forbidden access and retries, with options exclusively from the API. They are prepared for the later order and planning flows and tested as components; this phase adds no standalone screen. Their composition in those screens is flagged for Figma design review in Phase 3A.

| Operation | Access / scope |
|---|---|
| `GET /api/v1/reference/outlets` | Dispatcher depot or Store Manager's own outlet; optional brand/district filters |
| `GET /api/v1/reference/outlets/{id}` | Same scope; hidden and unknown outlets both return 404 |
| `GET /api/v1/reference/vehicles` | Dispatcher depot |
| `GET /api/v1/reference/vehicles/{id}` | Dispatcher depot; hidden/unknown vehicle returns 404 |
| `GET /api/v1/reference/districts` | Dispatcher depot or Store Manager's own outlet district |
| `GET /api/v1/reference/depots` | Distinct depots from the scoped district records |
| `GET /api/v1/reference/service-allowances` | Shared reference allowances; Store Manager restricted to own outlet brand |
| `GET /api/v1/reference/calendar?from=&to=` | Dispatcher / Store Manager; shared calendar |
| `GET /api/v1/dispatcher/vehicles/{id}/availability?date=` | Dispatcher depot |
| `PATCH /api/v1/dispatcher/vehicles/{id}/availability` | Dispatcher depot; date, status, note and expectedVersion |
| `GET /api/v1/dispatcher/vehicles/{id}/fuel?date=` | Dispatcher depot; date selects the supplied calendar's ISO year/week |

Schema changes are additive in `V20261002_0002__fleet_reference_state.sql`: `vehicle_availability`, `fuel_ledger`, and `audit_event`. The existing migrations were not changed. Published `ReferenceService` and `AuditService` boundaries keep fleet code out of other modules' repositories.

## Source files and PostgreSQL reconciliation

Inputs remain local and ignored under `dataset/data/General Data/`: `outlets.csv`, `vehicles.csv`, `district_travel.csv`, `calendar.csv`, and `service_allowance.csv`. No supplied CSV rows or copies of the competition dataset are included in this verification record. Detailed curl bodies below use invented fixtures under `apps/api/src/test/resources/reference-fixture/` in a separate Compose project.

Verified through `RealDatasetSeedIT`, the running normal API and direct PostgreSQL queries:

| Invariant | Verified value |
|---|---:|
| Outlets | 120 |
| Vehicles | 60 |
| Districts | 12 |
| Service allowances | 9 |
| Calendar days / operating days | 910 / 770 |
| Van-only outlets / mall outlets | 13 / 12 |
| Ambient trucks / reefer trucks | 40 / 12 |
| Ambient vans / reefer vans | 4 / 4 |

Calendar bounds are **2024-01-01 through 2026-06-28**. There is no automatic date extension. Calendar reads outside those bounds return an empty list; fleet operations for a missing day return `404`. Date ranges must be ordered and contain at most 367 days. `DEMO_OPERATING_DATE=2026-06-26` remains a verified supplied operating day; current wall-clock dates are not substituted for it. A future calendar extension requires an approved data source and the applicable migration/import review.

The normal database still contained **zero availability, zero fuel-ledger and zero audit records** after curl verification. Successful availability transitions and synthetic fuel balances were exercised only in the isolated verification project.

## Validation

- `cd apps/api && ./gradlew test`: **28 passed, zero failed or skipped**, including real PostgreSQL migrations, import idempotency/rollback, exact supplied fleet mix, mall intersections, role/depot scoping, workshop transitions, concurrent creation, stale updates, audit rollback and weekly fuel arithmetic.
- `make gen-api`: generated `apps/api/openapi.json` and `apps/web/src/generated/api.d.ts`; the final OpenAPI drift test passed. A second TypeScript generation to `/private/tmp` matched the tracked client byte for byte (`cmp` exited 0). Nullable fields and required selector IDs are documented in the generated schema.
- Web lint and production build passed; Vitest **37 passed**. Selector tests use invented response fixtures only in `*.test.tsx` files.
- `docker compose up --build -d api`: rebuilt and started the normal stack at `http://localhost:8081`.
- `./scripts/smoke.sh`: passed against the normal stack, including all reference reads, availability/fuel reads, unknown-outlet 404, and the four seeded role sessions. Successful write checks remain isolated to synthetic integration fixtures.
- Curl: 59 recorded normal-stack checks, followed by 68 recorded checks on the final synthetic stack image and six additional depot-scope/fuel checks. Every failure had a stable `code`, matching `traceId` / `X-Request-Id`, and no internal exception, SQL or class-name leak. Three additional login calls prepared the normal-stack cookies; each returned 200. Repeated credential setup/cleanup also succeeded.

Browser end-to-end tests were not rerun for this phase; the selectors are not yet mounted in complete order/planning screens. Remote GitHub Actions was not run and no commit or push was made.

## Normal stack curl outcomes

Cookie files and login payloads were temporary and private. The detailed normal outlet/vehicle response bodies are omitted here to keep competition records out of the repository; their values were returned by PostgreSQL-backed reads and the verified count/mix checks above. The same endpoint shapes are captured below with synthetic fixtures. Each following entry was called with `curl -i` and a role's cookie file when applicable.

`GET /api/v1/reference/outlets` → **200**, 120 database records.

`GET /api/v1/reference/vehicles` → **200**, 60 database records.

`GET /api/v1/reference/outlets/OUT001` → **200**.

`GET /api/v1/reference/vehicles/VEH001` → **200**.

`GET /api/v1/reference/districts` → **200**, 12 database records.

`GET /api/v1/reference/depots` → **200**, 2 database records.

`GET /api/v1/reference/service-allowances` → **200**, 9 database records.

`GET /api/v1/reference/calendar?from=2026-06-26&to=2026-06-26` → **200**, 1 database records.

`GET /api/v1/dispatcher/vehicles/VEH001/availability?date=2026-06-26` → **200**.

`GET /api/v1/dispatcher/vehicles/VEH001/fuel?date=2026-06-26` → **200**.

`GET /api/v1/reference/outlets` → **200**, 1 database records.

`GET /api/v1/reference/outlets/OUT001` → **200**.

`GET /api/v1/reference/districts` → **200**, 1 database records.

`GET /api/v1/reference/depots` → **200**, 1 database records.

`GET /api/v1/reference/service-allowances` → **200**, 3 database records.

`GET /api/v1/reference/calendar?from=2026-06-26&to=2026-06-26` → **200**, 1 database records.

`GET /api/v1/reference/outlets/OUT002` → **404** (`NOT_FOUND`).

`GET /api/v1/reference/outlets` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/outlets` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/outlets/OUT001` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/outlets/OUT001` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/vehicles` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/vehicles` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/vehicles/VEH001` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/vehicles/VEH001` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/districts` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/districts` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/depots` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/depots` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/service-allowances` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/service-allowances` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/calendar?from=2026-06-26&to=2026-06-26` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/reference/calendar?from=2026-06-26&to=2026-06-26` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/vehicles` → **403** (`FORBIDDEN`).

`GET /api/v1/reference/outlets/UNKNOWN` → **404** (`NOT_FOUND`).

`GET /api/v1/reference/vehicles/UNKNOWN` → **404** (`NOT_FOUND`).

`GET /api/v1/reference/calendar?from=bad&to=2026-06-26` → **400** (`BAD_REQUEST`).

`GET /api/v1/reference/calendar?from=2026-06-28&to=2026-06-26` → **400** (`INVALID_DATE_RANGE`).

`GET /api/v1/reference/calendar?from=2020-01-01&to=2026-06-26` → **400** (`INVALID_DATE_RANGE`).

`GET /api/v1/reference/calendar?from=2030-01-01&to=2030-01-01` → **200**, 0 database records.

`GET /api/v1/dispatcher/vehicles/VEH001/availability?date=2026-06-26` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/dispatcher/vehicles/VEH001/availability?date=2026-06-26` → **403** (`FORBIDDEN`).

`GET /api/v1/dispatcher/vehicles/UNKNOWN/availability?date=2026-06-26` → **404** (`NOT_FOUND`).

`GET /api/v1/dispatcher/vehicles/VEH001/availability?date=2030-01-01` → **404** (`NOT_FOUND`).

`GET /api/v1/dispatcher/vehicles/VEH001/fuel?date=2026-06-26` → **401** (`UNAUTHENTICATED`).

`GET /api/v1/dispatcher/vehicles/VEH001/fuel?date=2026-06-26` → **403** (`FORBIDDEN`).

`GET /api/v1/dispatcher/vehicles/UNKNOWN/fuel?date=2026-06-26` → **404** (`NOT_FOUND`).

`GET /api/v1/dispatcher/vehicles/VEH001/fuel?date=2030-01-01` → **404** (`NOT_FOUND`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **401** (`UNAUTHENTICATED`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **403** (`FORBIDDEN`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **400** (`VALIDATION_FAILED`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **400** (`VALIDATION_FAILED`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **404** (`NOT_FOUND`).

`PATCH /api/v1/dispatcher/vehicles/UNKNOWN/availability` → **404** (`NOT_FOUND`).

`PATCH /api/v1/dispatcher/vehicles/VEH001/availability` → **422** (`NON_OPERATING_DAY`).

`curl -i http://localhost:8081/v3/api-docs` → **200**; all 11 new operations appear in the generated contract.

`POST /api/v1/auth/logout` → **204**.

`POST /api/v1/auth/logout` → **204**.

`POST /api/v1/auth/logout` → **204**.

## Synthetic stack curl commands and actual responses

API: `http://localhost:18081`. Cookies are referenced by private file variables and session-token headers are redacted. `login.json` held the configured synthetic username/password; no password is recorded here. Except for credential redaction and omitted repetitive transport/security headers, the following responses are the captured output of the final running Docker API. Additional scoped tests temporarily changed only the synthetic dispatcher depot, then restored it.

```bash
curl -i -c "$DISPATCHER_COOKIES" -H "X-Requested-With: Waypoint" -H "Content-Type: application/json" --data-binary @login.json http://localhost:18081/api/v1/auth/login
```

```http
HTTP/1.1 200 
X-Request-Id: 4e299f7d-67ab-41f7-b034-65b980306832
Set-Cookie: [redacted session token]
Cache-Control: no-store
Content-Type: application/json

{"id":1,"username":"DSP-001","displayName":"Dispatcher","role":"DISPATCHER","outletId":null,"depot":null}
```


```bash
curl -i -c "$STORE_MANAGER_COOKIES" -H "X-Requested-With: Waypoint" -H "Content-Type: application/json" --data-binary @login.json http://localhost:18081/api/v1/auth/login
```

```http
HTTP/1.1 200 
X-Request-Id: 8e1dc0d9-8484-427c-83b2-9863d4c297bc
Set-Cookie: [redacted session token]
Cache-Control: no-store
Content-Type: application/json

{"id":2,"username":"STM-001","displayName":"Store manager","role":"STORE_MANAGER","outletId":"OUT901","depot":null}
```


```bash
curl -i -c "$DRIVER_COOKIES" -H "X-Requested-With: Waypoint" -H "Content-Type: application/json" --data-binary @login.json http://localhost:18081/api/v1/auth/login
```

```http
HTTP/1.1 200 
X-Request-Id: 74cf8969-8477-47cf-8509-03d4a07dac23
Set-Cookie: [redacted session token]
Cache-Control: no-store
Content-Type: application/json

{"id":4,"username":"DRV-001","displayName":"Driver","role":"DRIVER","outletId":null,"depot":null}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/outlets
```

```http
HTTP/1.1 200 
X-Request-Id: c5c9b935-64a8-4314-a345-e9f433683c1d
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"outletId":"OUT901","brand":"Fresh","district":"Alpha","depot":"Peliyagoda","dockType":"street","parkingConstraint":"van_only","windowOpen":"05:00:00","windowClose":"07:30:00","mallWindowOpen":null,"mallWindowClose":null,"effectiveWindowOpen":"05:00:00","effectiveWindowClose":"07:30:00"},{"outletId":"OUT902","brand":"Style","district":"Alpha","depot":"Peliyagoda","dockType":"mall_bay","parkingConstraint":"mall_dock","windowOpen":"09:00:00","windowClose":"17:00:00","mallWindowOpen":"10:00:00","mallWindowClose":"12:00:00","effectiveWindowOpen":"10:00:00","effectiveWindowClose":"12:00:00"},{"outletId":"OUT903","brand":"Tech","district":"Beta","depot":"Kandy","dockType":"rear_dock","parkingConstraint":"normal","windowOpen":"09:00:00","windowClose":"17:00:00","mallWindowOpen":null,"mallWindowClose":null,"effectiveWindowOpen":"09:00:00","effectiveWindowClose":"17:00:00"}]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/vehicles
```

```http
HTTP/1.1 200 
X-Request-Id: 39fff331-1339-4385-855d-6c6da137cce2
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"vehicleId":"VEH901","type":"truck","temp":"reefer","weightCapKg":5000.00,"volumeCapM3":25.000,"fuelType":"diesel","kmPerL":5.00,"weeklyFuelQuotaL":400.00,"depot":"Peliyagoda"},{"vehicleId":"VEH902","type":"van","temp":"ambient","weightCapKg":1100.00,"volumeCapM3":8.000,"fuelType":"diesel","kmPerL":9.00,"weeklyFuelQuotaL":300.00,"depot":"Kandy"}]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/outlets/OUT901
```

```http
HTTP/1.1 200 
X-Request-Id: e8d6c394-07a6-4125-a0f2-0b6a5b5bcd0f
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"outletId":"OUT901","brand":"Fresh","district":"Alpha","depot":"Peliyagoda","dockType":"street","parkingConstraint":"van_only","windowOpen":"05:00:00","windowClose":"07:30:00","mallWindowOpen":null,"mallWindowClose":null,"effectiveWindowOpen":"05:00:00","effectiveWindowClose":"07:30:00"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/vehicles/VEH901
```

```http
HTTP/1.1 200 
X-Request-Id: 128d5bfa-5232-4ea4-8e66-5542c53167e7
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","type":"truck","temp":"reefer","weightCapKg":5000.00,"volumeCapM3":25.000,"fuelType":"diesel","kmPerL":5.00,"weeklyFuelQuotaL":400.00,"depot":"Peliyagoda"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/districts
```

```http
HTTP/1.1 200 
X-Request-Id: bcc99fc1-4680-45b6-acc4-cd0fb9b6d7f2
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"district":"Alpha","depot":"Peliyagoda","roadClass":"urban","freeFlowKmh":30.00,"depotToDistrictKm":10.00,"depotToDistrictMinutes":20,"interStopKm":3.00,"interStopMinutes":7},{"district":"Beta","depot":"Kandy","roadClass":"hill","freeFlowKmh":25.00,"depotToDistrictKm":50.00,"depotToDistrictMinutes":120,"interStopKm":6.00,"interStopMinutes":15}]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/depots
```

```http
HTTP/1.1 200 
X-Request-Id: 61946c45-252a-457c-a967-26274668020a
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

["Kandy","Peliyagoda"]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/service-allowances
```

```http
HTTP/1.1 200 
X-Request-Id: c8841fd7-bcd0-48b8-b22b-c298ffa43efa
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"brand":"Fresh","dockType":"mall_bay","minutes":12},{"brand":"Fresh","dockType":"rear_dock","minutes":10},{"brand":"Fresh","dockType":"street","minutes":11},{"brand":"Style","dockType":"mall_bay","minutes":32},{"brand":"Style","dockType":"rear_dock","minutes":30},{"brand":"Style","dockType":"street","minutes":31},{"brand":"Tech","dockType":"mall_bay","minutes":42},{"brand":"Tech","dockType":"rear_dock","minutes":40},{"brand":"Tech","dockType":"street","minutes":41}]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2026-06-27&to=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: ca6b0bdc-25c0-4787-884c-43570083ef18
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"date":"2026-06-27","isoYear":2026,"isoWeek":26,"operating":true,"payday":false,"festival":null,"festivalRamp":0.000,"monsoon":true}]
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: a1f201b2-4a3f-4d21-bad3-b86c2a59b67e
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","date":"2026-06-27","status":null,"note":null,"version":0,"updatedAt":null,"updatedBy":null,"recorded":false}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: 52432ef4-914f-41bd-934b-2b32cadc5405
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","isoYear":2026,"isoWeek":26,"quotaLitres":400.00,"committedLitres":null,"actualLitres":null,"remainingLitres":null,"recorded":false}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/outlets
```

```http
HTTP/1.1 200 
X-Request-Id: b3b74b67-144f-4e8d-a90e-a094024f8e9d
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"outletId":"OUT901","brand":"Fresh","district":"Alpha","depot":"Peliyagoda","dockType":"street","parkingConstraint":"van_only","windowOpen":"05:00:00","windowClose":"07:30:00","mallWindowOpen":null,"mallWindowClose":null,"effectiveWindowOpen":"05:00:00","effectiveWindowClose":"07:30:00"}]
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/outlets/OUT901
```

```http
HTTP/1.1 200 
X-Request-Id: c6312d17-a637-45db-ade7-7a9844baf49f
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"outletId":"OUT901","brand":"Fresh","district":"Alpha","depot":"Peliyagoda","dockType":"street","parkingConstraint":"van_only","windowOpen":"05:00:00","windowClose":"07:30:00","mallWindowOpen":null,"mallWindowClose":null,"effectiveWindowOpen":"05:00:00","effectiveWindowClose":"07:30:00"}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/districts
```

```http
HTTP/1.1 200 
X-Request-Id: e1842202-fc85-47f5-9a8a-54547070ef8b
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"district":"Alpha","depot":"Peliyagoda","roadClass":"urban","freeFlowKmh":30.00,"depotToDistrictKm":10.00,"depotToDistrictMinutes":20,"interStopKm":3.00,"interStopMinutes":7}]
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/depots
```

```http
HTTP/1.1 200 
X-Request-Id: d38aeff6-fe53-4f0b-863d-b3adfea95820
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

["Peliyagoda"]
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/service-allowances
```

```http
HTTP/1.1 200 
X-Request-Id: f4db3d3c-01a4-4c38-8b7a-e604909be37f
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"brand":"Fresh","dockType":"mall_bay","minutes":12},{"brand":"Fresh","dockType":"rear_dock","minutes":10},{"brand":"Fresh","dockType":"street","minutes":11}]
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2026-06-26&to=2026-06-26'
```

```http
HTTP/1.1 200 
X-Request-Id: a43e7392-6aa2-40fd-a11f-1966fc22ce14
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[{"date":"2026-06-26","isoYear":2026,"isoWeek":26,"operating":true,"payday":false,"festival":null,"festivalRamp":0.000,"monsoon":true}]
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/outlets/OUT902
```

```http
HTTP/1.1 404 
X-Request-Id: 3e44594f-e696-41dd-b14b-1f5f62f30bcd
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/reference/outlets/OUT902","code":"NOT_FOUND","traceId":"3e44594f-e696-41dd-b14b-1f5f62f30bcd"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/outlets
```

```http
HTTP/1.1 401 
X-Request-Id: 92955a3e-63fe-46c3-8048-867264d95554
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/outlets","code":"UNAUTHENTICATED","traceId":"92955a3e-63fe-46c3-8048-867264d95554"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/outlets
```

```http
HTTP/1.1 403 
X-Request-Id: 3bcb1f23-15ed-4d9e-9dea-44cc734b7204
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/outlets","code":"FORBIDDEN","traceId":"3bcb1f23-15ed-4d9e-9dea-44cc734b7204"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/outlets/OUT901
```

```http
HTTP/1.1 401 
X-Request-Id: 11a3d541-87a0-4311-b8f0-7104aeb2d7db
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/outlets/OUT901","code":"UNAUTHENTICATED","traceId":"11a3d541-87a0-4311-b8f0-7104aeb2d7db"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/outlets/OUT901
```

```http
HTTP/1.1 403 
X-Request-Id: f9444dec-383e-434c-ac79-9e38fa138a99
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/outlets/OUT901","code":"FORBIDDEN","traceId":"f9444dec-383e-434c-ac79-9e38fa138a99"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/vehicles
```

```http
HTTP/1.1 401 
X-Request-Id: 267b6e90-9632-431d-a344-c8f6eac16f52
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/vehicles","code":"UNAUTHENTICATED","traceId":"267b6e90-9632-431d-a344-c8f6eac16f52"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/vehicles
```

```http
HTTP/1.1 403 
X-Request-Id: 1992263d-8414-48ca-b7cc-829e03b53488
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/vehicles","code":"FORBIDDEN","traceId":"1992263d-8414-48ca-b7cc-829e03b53488"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/vehicles/VEH901
```

```http
HTTP/1.1 401 
X-Request-Id: 12490068-2365-48e2-a44c-fd68ce0b8e0f
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/vehicles/VEH901","code":"UNAUTHENTICATED","traceId":"12490068-2365-48e2-a44c-fd68ce0b8e0f"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/vehicles/VEH901
```

```http
HTTP/1.1 403 
X-Request-Id: 6b29d7e0-a22f-43c9-93d5-35ae76d39606
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/vehicles/VEH901","code":"FORBIDDEN","traceId":"6b29d7e0-a22f-43c9-93d5-35ae76d39606"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/districts
```

```http
HTTP/1.1 401 
X-Request-Id: 3c55a1be-03ab-4b06-9ea7-7e8c88288e05
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/districts","code":"UNAUTHENTICATED","traceId":"3c55a1be-03ab-4b06-9ea7-7e8c88288e05"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/districts
```

```http
HTTP/1.1 403 
X-Request-Id: 648de7f3-c9e1-4dff-9c89-b8d3344efc87
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/districts","code":"FORBIDDEN","traceId":"648de7f3-c9e1-4dff-9c89-b8d3344efc87"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/depots
```

```http
HTTP/1.1 401 
X-Request-Id: 8c7e4faa-6750-44dc-ae70-8d61b4780a98
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/depots","code":"UNAUTHENTICATED","traceId":"8c7e4faa-6750-44dc-ae70-8d61b4780a98"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/depots
```

```http
HTTP/1.1 403 
X-Request-Id: dc276940-f2f1-440e-ad85-6a7a4375afb4
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/depots","code":"FORBIDDEN","traceId":"dc276940-f2f1-440e-ad85-6a7a4375afb4"}
```


```bash
curl -i http://localhost:18081/api/v1/reference/service-allowances
```

```http
HTTP/1.1 401 
X-Request-Id: dd6e4957-94dc-4935-8724-116732083f0b
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/service-allowances","code":"UNAUTHENTICATED","traceId":"dd6e4957-94dc-4935-8724-116732083f0b"}
```


```bash
curl -i -b "$DRIVER_COOKIES" http://localhost:18081/api/v1/reference/service-allowances
```

```http
HTTP/1.1 403 
X-Request-Id: 0a458df8-2368-448b-98f7-69b2cd240a59
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/service-allowances","code":"FORBIDDEN","traceId":"0a458df8-2368-448b-98f7-69b2cd240a59"}
```


```bash
curl -i 'http://localhost:18081/api/v1/reference/calendar?from=2026-06-26&to=2026-06-26'
```

```http
HTTP/1.1 401 
X-Request-Id: 1d583847-42e0-4f96-8e9b-d0a055c44c90
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/calendar","code":"UNAUTHENTICATED","traceId":"1d583847-42e0-4f96-8e9b-d0a055c44c90"}
```


```bash
curl -i -b "$DRIVER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2026-06-26&to=2026-06-26'
```

```http
HTTP/1.1 403 
X-Request-Id: d19b4d05-ae06-4905-a1ba-f1ebc4aaff2a
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/calendar","code":"FORBIDDEN","traceId":"d19b4d05-ae06-4905-a1ba-f1ebc4aaff2a"}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" http://localhost:18081/api/v1/reference/vehicles
```

```http
HTTP/1.1 403 
X-Request-Id: 34082409-61f6-4e50-bc83-17af98877b58
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/vehicles","code":"FORBIDDEN","traceId":"34082409-61f6-4e50-bc83-17af98877b58"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/outlets/UNKNOWN
```

```http
HTTP/1.1 404 
X-Request-Id: 5441438c-84d0-4e82-b599-3437e9b6e970
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/reference/outlets/UNKNOWN","code":"NOT_FOUND","traceId":"5441438c-84d0-4e82-b599-3437e9b6e970"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" http://localhost:18081/api/v1/reference/vehicles/UNKNOWN
```

```http
HTTP/1.1 404 
X-Request-Id: 250169ac-481a-4cdd-a609-e393cf48991c
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/reference/vehicles/UNKNOWN","code":"NOT_FOUND","traceId":"250169ac-481a-4cdd-a609-e393cf48991c"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=bad&to=2026-06-26'
```

```http
HTTP/1.1 400 
X-Request-Id: 565259e2-3621-47e5-acc9-4423557b519b
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Failed to convert 'from' with value: 'bad'","instance":"/api/v1/reference/calendar","code":"BAD_REQUEST","traceId":"565259e2-3621-47e5-acc9-4423557b519b"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2026-06-28&to=2026-06-26'
```

```http
HTTP/1.1 400 
X-Request-Id: 018b1698-5947-4367-8dbc-c6b277ef5d20
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Choose an ordered date range of at most 367 days","instance":"/api/v1/reference/calendar","code":"INVALID_DATE_RANGE","traceId":"018b1698-5947-4367-8dbc-c6b277ef5d20"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2020-01-01&to=2026-06-26'
```

```http
HTTP/1.1 400 
X-Request-Id: 3336b55f-b68b-4ae4-89a6-9c29962a6d78
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Choose an ordered date range of at most 367 days","instance":"/api/v1/reference/calendar","code":"INVALID_DATE_RANGE","traceId":"3336b55f-b68b-4ae4-89a6-9c29962a6d78"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/calendar?from=2030-01-01&to=2030-01-01'
```

```http
HTTP/1.1 200 
X-Request-Id: a0ca091b-19b5-458a-9e89-8a71c50d03da
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

[]
```


```bash
curl -i 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 401 
X-Request-Id: 728dc877-9f06-4392-a12f-a8baad0df5b5
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"UNAUTHENTICATED","traceId":"728dc877-9f06-4392-a12f-a8baad0df5b5"}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 403 
X-Request-Id: 49e23605-d3c6-4143-8faf-38d71acdd590
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"FORBIDDEN","traceId":"49e23605-d3c6-4143-8faf-38d71acdd590"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/UNKNOWN/availability?date=2026-06-27'
```

```http
HTTP/1.1 404 
X-Request-Id: 26850fa9-71fe-4db1-bc5f-b4005347d3b4
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/UNKNOWN/availability","code":"NOT_FOUND","traceId":"26850fa9-71fe-4db1-bc5f-b4005347d3b4"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2030-01-01'
```

```http
HTTP/1.1 404 
X-Request-Id: 7fa8ba28-5178-4236-9161-71655a5016fb
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"NOT_FOUND","traceId":"7fa8ba28-5178-4236-9161-71655a5016fb"}
```


```bash
curl -i 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-27'
```

```http
HTTP/1.1 401 
X-Request-Id: bc5705da-92c2-4197-a500-6751f10c5614
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/dispatcher/vehicles/VEH901/fuel","code":"UNAUTHENTICATED","traceId":"bc5705da-92c2-4197-a500-6751f10c5614"}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-27'
```

```http
HTTP/1.1 403 
X-Request-Id: ba2034a5-c3f5-4a8c-89d3-28bacc832eb2
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/dispatcher/vehicles/VEH901/fuel","code":"FORBIDDEN","traceId":"ba2034a5-c3f5-4a8c-89d3-28bacc832eb2"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/UNKNOWN/fuel?date=2026-06-27'
```

```http
HTTP/1.1 404 
X-Request-Id: c5feb6bc-c143-43b0-95c5-a2a2420b102a
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/UNKNOWN/fuel","code":"NOT_FOUND","traceId":"c5feb6bc-c143-43b0-95c5-a2a2420b102a"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2030-01-01'
```

```http
HTTP/1.1 404 
X-Request-Id: fc092a61-55d9-45f6-a2c6-182475f2f728
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/fuel","code":"NOT_FOUND","traceId":"fc092a61-55d9-45f6-a2c6-182475f2f728"}
```


```bash
curl -i -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 401 
X-Request-Id: 80f39490-ae3b-495a-9dc0-27654832ce73
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"UNAUTHENTICATED","traceId":"80f39490-ae3b-495a-9dc0-27654832ce73"}
```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 403 
X-Request-Id: b5251ef2-62ca-4111-bd59-0f725f5812a3
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"FORBIDDEN","traceId":"b5251ef2-62ca-4111-bd59-0f725f5812a3"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "invalid", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 400 
X-Request-Id: b1c22758-620f-4792-88fe-a84a16387f32
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Request validation failed","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"VALIDATION_FAILED","traceId":"b1c22758-620f-4792-88fe-a84a16387f32","violations":[{"field":"status","message":"must match \"available|in_workshop\""}]}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 400 
X-Request-Id: c757611b-3e2b-48fa-bcc2-ec955e0ed866
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Request validation failed","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"VALIDATION_FAILED","traceId":"c757611b-3e2b-48fa-bcc2-ec955e0ed866","violations":[{"field":"note","message":"must not be blank"}]}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2030-01-01", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 404 
X-Request-Id: 2aaffaf9-a534-44d2-a3a3-a9cf304b09c6
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"NOT_FOUND","traceId":"2aaffaf9-a534-44d2-a3a3-a9cf304b09c6"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/UNKNOWN/availability
```

```http
HTTP/1.1 404 
X-Request-Id: 08314c09-51fe-47c9-bee0-5b1dac46991d
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/UNKNOWN/availability","code":"NOT_FOUND","traceId":"08314c09-51fe-47c9-bee0-5b1dac46991d"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-28", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 422 
X-Request-Id: c04818c8-2543-4df4-9545-5ef2ccaf82c5
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"Availability changes require an operating date","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"NON_OPERATING_DAY","traceId":"c04818c8-2543-4df4-9545-5ef2ccaf82c5"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 1}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 409 
X-Request-Id: 2fc91924-a1b3-4e7f-bbaf-929c21a44ed7
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Conflict","status":409,"detail":"Availability changed; reload before saving","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"STALE_AVAILABILITY","traceId":"2fc91924-a1b3-4e7f-bbaf-929c21a44ed7"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 200 
X-Request-Id: 52e10eaf-1574-4a7c-9e39-331ef163ae6d
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","date":"2026-06-27","status":"in_workshop","note":"Synthetic curl verification","version":1,"updatedAt":"2026-10-01T19:36:56.330057Z","updatedBy":1,"recorded":true}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: b255c096-4287-47a1-91ba-caed726ff417
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","date":"2026-06-27","status":"in_workshop","note":"Synthetic curl verification","version":1,"updatedAt":"2026-10-01T19:36:56.330057Z","updatedBy":1,"recorded":true}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "in_workshop", "note": "Synthetic curl verification", "expectedVersion": 0}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 409 
X-Request-Id: 749d322b-8cf2-41dc-bb7c-7c812db649e3
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Conflict","status":409,"detail":"Availability changed; reload before saving","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"STALE_AVAILABILITY","traceId":"749d322b-8cf2-41dc-bb7c-7c812db649e3"}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{"date": "2026-06-27", "status": "available", "note": "Synthetic curl verification", "expectedVersion": 1}' http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability
```

```http
HTTP/1.1 200 
X-Request-Id: 7a20c513-748e-4764-93aa-fee9683bfcdd
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","date":"2026-06-27","status":"available","note":"Synthetic curl verification","version":2,"updatedAt":"2026-10-01T19:36:56.396197Z","updatedBy":1,"recorded":true}
```


```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: cb46ed23-95a3-492a-8a70-9f4554b2db0e
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","date":"2026-06-27","status":"available","note":"Synthetic curl verification","version":2,"updatedAt":"2026-10-01T19:36:56.396197Z","updatedBy":1,"recorded":true}
```


`curl -i http://localhost:18081/v3/api-docs` → **200**; all 11 new operations appear in the generated contract.

```bash
curl -i -b "$DISPATCHER_COOKIES" -X POST -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{}' http://localhost:18081/api/v1/auth/logout
```

```http
HTTP/1.1 204 
X-Request-Id: ba759578-5dbd-4a5b-96be-61fd5a2b3aa6
Set-Cookie: WP_SESSION=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
Cache-Control: no-cache, no-store, max-age=0, must-revalidate


```


```bash
curl -i -b "$STORE_MANAGER_COOKIES" -X POST -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{}' http://localhost:18081/api/v1/auth/logout
```

```http
HTTP/1.1 204 
X-Request-Id: a27ffe60-7ea9-47f5-bb6a-40f6705d84c7
Set-Cookie: WP_SESSION=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
Cache-Control: no-cache, no-store, max-age=0, must-revalidate


```


```bash
curl -i -b "$DRIVER_COOKIES" -X POST -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data '{}' http://localhost:18081/api/v1/auth/logout
```

```http
HTTP/1.1 204 
X-Request-Id: 0c35fecc-47e6-4c29-bd44-aebc15cab26e
Set-Cookie: WP_SESSION=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
Cache-Control: no-cache, no-store, max-age=0, must-revalidate


```


## Additional scoped fleet and fuel checks

```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/outlets/OUT901'
```

```http
HTTP/1.1 404 
X-Request-Id: a9a31a9f-7a1c-4ae9-ac52-2188a633ecb3
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/reference/outlets/OUT901","code":"NOT_FOUND","traceId":"a9a31a9f-7a1c-4ae9-ac52-2188a633ecb3"}
```

```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/reference/vehicles/VEH901'
```

```http
HTTP/1.1 404 
X-Request-Id: 575866be-1109-4145-9e64-ef43506530a2
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/reference/vehicles/VEH901","code":"NOT_FOUND","traceId":"575866be-1109-4145-9e64-ef43506530a2"}
```

```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-27'
```

```http
HTTP/1.1 404 
X-Request-Id: 9b996fe3-4f0b-4573-9c55-69e045a37163
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"NOT_FOUND","traceId":"9b996fe3-4f0b-4573-9c55-69e045a37163"}
```

```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-27'
```

```http
HTTP/1.1 404 
X-Request-Id: 53d4a137-15d4-4e15-86db-3ba36f71e0a6
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/fuel","code":"NOT_FOUND","traceId":"53d4a137-15d4-4e15-86db-3ba36f71e0a6"}
```

```bash
curl -i -b "$DISPATCHER_COOKIES" -X PATCH -H "X-Requested-With: Waypoint" -H "Content-Type: application/json" --data '{"date": "2026-06-27", "status": "available", "note": "Synthetic depot scope check", "expectedVersion": 2}' 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/availability'
```

```http
HTTP/1.1 404 
X-Request-Id: d8bc77ad-5b94-416b-a9f0-f66e152142e0
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/dispatcher/vehicles/VEH901/availability","code":"NOT_FOUND","traceId":"d8bc77ad-5b94-416b-a9f0-f66e152142e0"}
```

```bash
curl -i -b "$DISPATCHER_COOKIES" 'http://localhost:18081/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-27'
```

```http
HTTP/1.1 200 
X-Request-Id: 10ce0e36-bca1-424c-89d2-b7905c7a24bd
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Content-Type: application/json

{"vehicleId":"VEH901","isoYear":2026,"isoWeek":26,"quotaLitres":400.00,"committedLitres":125.25,"actualLitres":90.50,"remainingLitres":274.75,"recorded":true}
```

Synthetic PostgreSQL comparison:

```text
VEH901|2026|26|125.25|90.50
1||in_workshop|1
1|in_workshop|available|2
```
