# ADR 0001: Proof-of-delivery files in Cloudinary

- **Status:** accepted (owner decision, 2026-10-03)
- **Context:** Round 2 Step 5 (driver workflow). Drivers attach a photo and/or the recipient's signature to each delivery. The technical reference planned S3-compatible storage (MinIO locally, any S3 in production). Files must not live in PostgreSQL.

## Decision

Store proof files in **Cloudinary** (free plan).

- The phone compresses a photo (longest side 1280 px, JPEG 0.7) and uploads it to the API: `POST /api/v1/driver/trips/{trip}/orders/{order}/proofs`.
- The API checks the file is JPEG or PNG from its bytes, at most 5 MB and at most 40 megapixels. It then re-encodes the image, which drops EXIF and location data, and scales it to at most 1600 px.
- The API uploads the file to Cloudinary as `authenticated` (not public) with a signed REST call. No SDK and no new dependency are needed. Only the returned key goes into `pod_asset.object_key`.
- Screens show a file through a signed delivery link that the API builds.
- Configuration is a single secret, `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`, which never reaches the browser.

## Consequences

- No extra container is needed. Each environment that should store photos needs a Cloudinary account and its URL in `.env`.
- Without `CLOUDINARY_URL`:
  - `GET /api/v1/driver/capabilities` reports `proofUploads: false`.
  - Uploads return `503 POD_STORAGE_UNAVAILABLE`.
  - Deliveries are recorded with the recipient's name only. The phone says this plainly.
- With it, a delivered or partial outcome requires at least one proof file.
- Integration tests use an in-memory stand-in for the storage. It lives under `src/test` and holds synthetic files only.
- Cloudinary's signed links do not expire. Anyone holding a link can open that one file, so links are shown only to signed-in roles that may see the delivery.

## Alternatives considered

- **MinIO locally plus Cloudflare R2 or S3:** S3 protocol everywhere and runs without an account, but adds a container and the AWS SDK.
- **A local disk volume:** no new service, but weak for a cloud deployment.
