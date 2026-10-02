# Phase 2 — Authentication & RBAC verification

Verified locally on **2026-10-02 (Asia/Colombo)**. API: `http://localhost:8081`; web: `http://localhost:5173`.

## Delivered behavior

Four configured accounts sign in through the Figma-based login screen, restore their cookie session, enter their own workspace, reject other role workspaces, and sign out. The server supplies role and scope; the browser never chooses them. Passwords use BCrypt; random session tokens are persisted only as SHA-256 hashes. Logout and account deactivation invalidate sessions immediately. Absolute expiry is 16 hours by default.

API routes: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`. State-changing requests require `X-Requested-With`. CORS and CSRF failures use the standard problem envelope. Wrong-role method-security failures use that envelope too. Independent username/address login buckets produce `429` and `Retry-After`.

Private query data is cleared on logout, expiry and restored-actor changes. Loading, API failure/retry, wrong role, incorrect credentials and throttling all have visible states. The remembered-cookie setting does not extend server expiry. No credentials are stored in localStorage or sessionStorage.

## Automated and browser checks

| Check | Result |
|---|---|
| `cd apps/api && ./gradlew test --no-daemon` | 20 passed, including eight PostgreSQL identity/security tests; no skipped tests |
| Web `lint`, `typecheck`, `test`, `build` | Passed; 32 Vitest tests |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' corepack pnpm --dir apps/web test:e2e` | Six passed against Compose |
| `./scripts/smoke.sh` | Whole stack, four seeded roles, protected reference data, logout and revocation passed |
| `make gen-api` | Contract and TypeScript client regenerated |
| API contract drift test | Passed without the update flag |
| Repeat API-client and design-token generation | Byte-identical output |
| Live `curl -i http://localhost:8081/v3/api-docs` | 200; structurally identical to generated `openapi.json`, including cookie security scheme |
| `git diff --check` | Passed |

Security tests exercise all 16 role/route combinations, anonymous access, method guards, CSRF/CORS, cookie attributes, expired/revoked/inactive sessions, UTF-8 password limits, throttling and seed idempotence. Test-only service/controller probes verify `404` for another outlet/depot/driver's work, including two separately authenticated synthetic drivers. These probes are **not production endpoints**. Actual order/trip ownership must be enforced and curl-tested in each future feature slice.

The trusted `CurrentUser` principal exposes actor ID, role and outlet/depot scope to later application services and audit records.

## Visual verification

Compared the login implementation with Figma file `nfP1ZRvqcF2cJ4cWeZqyvT`, frame `1121:36567`. The background, overlay, logo layer and five icon assets are local files in the existing auth feature folder. Every asset loaded in the browser, and SVG root dimensions remain intact. Desktop (1280 × 832) and phone (375 × 812) checks passed with no horizontal overflow. Keyboard order, visible focus, password visibility, and help-dialog Escape handling passed. Temporary screenshots are `/tmp/waypoint-phase2-login-1280.png` and `/tmp/waypoint-phase2-login-375.png`.

Adaptations: the shared screen says “Waypoint Login” and “USER ID”; it has no prototype credentials/version, and Remember me starts unchecked. Typography uses the existing Geist token family rather than Inter. The phone layout is derived and remains flagged for final design review. Password help honestly refers the user to their administrator.

## Database verification

Read-only `psql` queries confirmed the four response identities, all BCrypt password hashes, and 64-character hashed session tokens. No password or token value was printed.

```sql
SELECT id, username, display_name, role, outlet_id, depot, active,
       password_hash LIKE '$2a$%' AS bcrypt
FROM app_user ORDER BY id;
SELECT count(*) AS sessions, bool_and(length(token_hash)=64) AS hashed_tokens
FROM user_session;
SELECT count(*) AS outlets FROM outlet;
SELECT count(*) AS vehicles FROM vehicle;
```

The returned IDs were 1–4 for Dispatcher, Store manager, Loader and Driver respectively. All accounts were active and had BCrypt hashes. The reference counts matched SQL (120 outlets and 60 vehicles); no business counts were invented in the UI.

## Curl evidence

The stack was rebuilt using `docker compose up --build -d api web`, then the final API using `docker compose up --build -d api`. All requests below used `curl -i`. Private payload/cookie filenames are normalized in these commands; passwords and session-cookie values are redacted. Input payloads were generated in a temporary directory from the ignored `.env`, except deliberately invalid requests. The API was restarted after the deliberate throttle lockout to restore normal local sign-in.

Every failure body below has a stable `code` and a `traceId` equal to the displayed `X-Request-Id`. No SQL, stack trace, class name, password or session token is exposed. Rule-conflict statuses `409/422` do not apply to these authentication routes.

### 1. anonymous me

```bash
curl -i http://localhost:8081/api/v1/auth/me
```

```http
HTTP/1.1 401
x-request-id: 5d14aabd-0b73-4e73-8180-9cb355ae8d09
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/me","code":"UNAUTHENTICATED","traceId":"5d14aabd-0b73-4e73-8180-9cb355ae8d09"}
```

### 2. anonymous reference

```bash
curl -i http://localhost:8081/api/v1/reference/summary
```

```http
HTTP/1.1 401
x-request-id: 6bab693e-8955-4313-8172-afaff009769b
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/reference/summary","code":"UNAUTHENTICATED","traceId":"6bab693e-8955-4313-8172-afaff009769b"}
```

### 3. anonymous logout

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint'
```

```http
HTTP/1.1 401
x-request-id: 5348c07f-ed2e-46aa-b2a1-5fffd37a6956
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/logout","code":"UNAUTHENTICATED","traceId":"5348c07f-ed2e-46aa-b2a1-5fffd37a6956"}
```

### 4. missing csrf

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json
```

```http
HTTP/1.1 403
x-request-id: 046c0235-8b49-4002-af09-7b4e2bf18bfb
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"The request was rejected as a possible cross-site request","instance":"/api/v1/auth/login","code":"CSRF_REJECTED","traceId":"046c0235-8b49-4002-af09-7b4e2bf18bfb"}
```

### 5. untrusted origin

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Origin: https://untrusted.invalid' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json
```

```http
HTTP/1.1 403
x-request-id: d2bfab28-25e7-40c0-a214-053ade52f2a1
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"The request origin is not allowed","code":"CORS_REJECTED","traceId":"d2bfab28-25e7-40c0-a214-053ade52f2a1"}
```

### 6. invalid input

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json
```

```http
HTTP/1.1 400
x-request-id: 834c77ec-da20-49af-83ed-678a838cff16
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Request validation failed","instance":"/api/v1/auth/login","code":"VALIDATION_FAILED","traceId":"834c77ec-da20-49af-83ed-678a838cff16","violations":[{"message":"must not be blank","field":"username"},{"message":"must not be blank","field":"password"}]}
```

### 7. invalid utf8 length

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json
```

```http
HTTP/1.1 400
x-request-id: 11d42f16-777e-4dce-9ad0-69c115325445
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Bad Request","status":400,"detail":"Password must be at most 72 UTF-8 bytes","instance":"/api/v1/auth/login","code":"VALIDATION_FAILED","traceId":"11d42f16-777e-4dce-9ad0-69c115325445"}
```

### 8. invalid credentials

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json
```

```http
HTTP/1.1 401
x-request-id: 4f7c91d0-4f79-4df3-b982-6123286104b6
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Incorrect user ID or password","instance":"/api/v1/auth/login","code":"INVALID_CREDENTIALS","traceId":"4f7c91d0-4f79-4df3-b982-6123286104b6"}
```

### 9. login DISPATCHER

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json -c /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: b7786f44-ef8f-411a-b8ff-ff3e2ce6edc7
cache-control: no-store
content-type: application/json
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=57600; Expires=Fri, 02 Oct 2026 11:02:23 GMT; HttpOnly; SameSite=Lax

{"id":1,"username":"DSP-001","displayName":"Dispatcher","role":"DISPATCHER","outletId":null,"depot":null}
```

### 10. restore DISPATCHER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: c8e2e613-54f8-4b1d-a64e-ddb6631a37b7
cache-control: no-store
content-type: application/json

{"id":1,"username":"DSP-001","displayName":"Dispatcher","role":"DISPATCHER","outletId":null,"depot":null}
```

### 11. reference DISPATCHER

```bash
curl -i http://localhost:8081/api/v1/reference/summary -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: 86f5bff0-4bb5-4c3f-98d6-c757a0086b8f
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/json

{"outlets":120,"vehicles":60,"calendarDays":910,"districts":12,"serviceAllowances":9,"demoOperatingDate":"2026-06-26"}
```

### 12. unknown route

```bash
curl -i http://localhost:8081/api/v1/auth/does-not-exist -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 404
x-request-id: 98861e5e-2d73-42df-b2cf-c50928bd4353
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Not Found","status":404,"detail":"Resource not found","instance":"/api/v1/auth/does-not-exist","code":"NOT_FOUND","traceId":"98861e5e-2d73-42df-b2cf-c50928bd4353"}
```

### 13. logout missing csrf

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 403
x-request-id: 3891e42f-8da8-40d7-a8da-c443e7b186a0
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"The request was rejected as a possible cross-site request","instance":"/api/v1/auth/logout","code":"CSRF_REJECTED","traceId":"3891e42f-8da8-40d7-a8da-c443e7b186a0"}
```

### 14. logout untrusted origin

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint' -H 'Origin: https://untrusted.invalid' -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 403
x-request-id: 91210a1c-2c76-442b-9c06-2e4936a9063c
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"The request origin is not allowed","code":"CORS_REJECTED","traceId":"91210a1c-2c76-442b-9c06-2e4936a9063c"}
```

### 15. logout DISPATCHER

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint' -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 204
x-request-id: c4e4da88-5864-477f-b3ab-bc1b3e78b8aa
cache-control: no-cache, no-store, max-age=0, must-revalidate
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax

(empty body)
```

### 16. revoked DISPATCHER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 401
x-request-id: 4a1aa9ea-53a0-4213-ab04-7a9631d98c63
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/me","code":"UNAUTHENTICATED","traceId":"4a1aa9ea-53a0-4213-ab04-7a9631d98c63"}
```

### 17. login STORE_MANAGER

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json -c /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: a85d91a7-d2e5-4545-b252-8abcfef6b19b
cache-control: no-store
content-type: application/json
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=57600; Expires=Fri, 02 Oct 2026 11:02:24 GMT; HttpOnly; SameSite=Lax

{"id":2,"username":"STM-001","displayName":"Store manager","role":"STORE_MANAGER","outletId":"OUT001","depot":null}
```

### 18. restore STORE_MANAGER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: c03a98c7-9a7f-4d2c-be1f-0618e5f22972
cache-control: no-store
content-type: application/json

{"id":2,"username":"STM-001","displayName":"Store manager","role":"STORE_MANAGER","outletId":"OUT001","depot":null}
```

### 19. reference STORE_MANAGER

```bash
curl -i http://localhost:8081/api/v1/reference/summary -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: 51c9286d-bb54-4f79-b01c-85cf90e895d7
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/json

{"outlets":120,"vehicles":60,"calendarDays":910,"districts":12,"serviceAllowances":9,"demoOperatingDate":"2026-06-26"}
```

### 20. logout STORE_MANAGER

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint' -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 204
x-request-id: 15799922-372d-47d6-9844-49ce4fe1c31b
cache-control: no-cache, no-store, max-age=0, must-revalidate
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax

(empty body)
```

### 21. revoked STORE_MANAGER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 401
x-request-id: 1079093c-4e30-41cd-acdc-380b64634733
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/me","code":"UNAUTHENTICATED","traceId":"1079093c-4e30-41cd-acdc-380b64634733"}
```

### 22. login LOADER

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json -c /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: 7f5aacbd-2a77-4376-aca8-b8c4fcc632c8
cache-control: no-store
content-type: application/json
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=57600; Expires=Fri, 02 Oct 2026 11:02:24 GMT; HttpOnly; SameSite=Lax

{"id":3,"username":"LDR-001","displayName":"Loader","role":"LOADER","outletId":null,"depot":"Peliyagoda"}
```

### 23. restore LOADER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: e3a6f658-7430-43f9-b914-8ce19fd3446e
cache-control: no-store
content-type: application/json

{"id":3,"username":"LDR-001","displayName":"Loader","role":"LOADER","outletId":null,"depot":"Peliyagoda"}
```

### 24. reference LOADER

```bash
curl -i http://localhost:8081/api/v1/reference/summary -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 403
x-request-id: 86112c79-09d8-470d-93d9-59215ddbfa54
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/summary","code":"FORBIDDEN","traceId":"86112c79-09d8-470d-93d9-59215ddbfa54"}
```

### 25. logout LOADER

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint' -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 204
x-request-id: d848ae05-7525-48e9-b43c-b6d7d76c25bd
cache-control: no-cache, no-store, max-age=0, must-revalidate
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax

(empty body)
```

### 26. revoked LOADER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 401
x-request-id: 808da2d9-d8a7-489f-9ed4-cc52ca1ed1a1
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/me","code":"UNAUTHENTICATED","traceId":"808da2d9-d8a7-489f-9ed4-cc52ca1ed1a1"}
```

### 27. login DRIVER

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With: Waypoint' -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data-binary @/tmp/private-payload.json -c /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: 706d7ebe-dfef-4a28-9683-96e071227b5b
cache-control: no-store
content-type: application/json
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=57600; Expires=Fri, 02 Oct 2026 11:02:25 GMT; HttpOnly; SameSite=Lax

{"id":4,"username":"DRV-001","displayName":"Driver","role":"DRIVER","outletId":null,"depot":null}
```

### 28. restore DRIVER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 200
x-request-id: ea8ca586-8048-47c7-b8fe-8e5abc8263c1
cache-control: no-store
content-type: application/json

{"id":4,"username":"DRV-001","displayName":"Driver","role":"DRIVER","outletId":null,"depot":null}
```

### 29. reference DRIVER

```bash
curl -i http://localhost:8081/api/v1/reference/summary -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 403
x-request-id: 4381a507-c8f7-4946-92e1-a5ec3b3f1016
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Forbidden","status":403,"detail":"Your role does not have access to this resource","instance":"/api/v1/reference/summary","code":"FORBIDDEN","traceId":"4381a507-c8f7-4946-92e1-a5ec3b3f1016"}
```

### 30. logout DRIVER

```bash
curl -i http://localhost:8081/api/v1/auth/logout -X POST -H 'X-Requested-With: Waypoint' -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 204
x-request-id: 1fe83a42-e4c7-401a-8b7e-75a3b909ee70
cache-control: no-cache, no-store, max-age=0, must-revalidate
set-cookie: WP_SESSION=<redacted>; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax

(empty body)
```

### 31. revoked DRIVER

```bash
curl -i http://localhost:8081/api/v1/auth/me -b /tmp/private-cookie-jar
```

```http
HTTP/1.1 401
x-request-id: 74b2dc40-7301-4bce-9c6e-daab6a241175
cache-control: no-cache, no-store, max-age=0, must-revalidate
content-type: application/problem+json

{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in to continue","instance":"/api/v1/auth/me","code":"UNAUTHENTICATED","traceId":"74b2dc40-7301-4bce-9c6e-daab6a241175"}
```

### 32. throttle

```bash
curl -i http://localhost:8081/api/v1/auth/login -H 'X-Requested-With:Waypoint' --data-binary @/tmp/synthetic-invalid-payload.json
```

```http
HTTP/1.1 429
x-request-id: 29b7fcb3-cb7b-45f1-a064-b6975f4ac4e2
retry-after: 896

{"type":"about:blank","title":"Too Many Requests","status":429,"detail":"Too many failed sign-in attempts. Try again later.","instance":"/api/v1/auth/login","code":"TOO_MANY_ATTEMPTS","traceId":"29b7fcb3-cb7b-45f1-a064-b6975f4ac4e2"}
```

## Remaining boundaries

Phase 2 is verified locally. Phase 0's GitHub CI gate remains pending because nothing was committed or pushed. The workflow now includes the authentication browser suite and generates synthetic CI account credentials at runtime.

Self-service password reset and native bearer transport are outside this phase. Native transport joins the same session store in Phase 14A. Login throttling is in memory for one API instance. Operational order/trip endpoints and their ownership checks belong to subsequent phases.
