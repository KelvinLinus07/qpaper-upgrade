# Cloudflare R2 setup for QPaper Studio (Docker / local Node.js)

The application uploads images from Express to either **Cloudflare R2** or **AWS S3**, using the already-installed AWS SDK for JavaScript v3. The PostgreSQL schema and existing PDF layout stay unchanged. New uploads are served through the Express API so a private R2 bucket works for preview and document export.

## 1. Create an R2 bucket

1. In https://dash.cloudflare.com open **R2 Object Storage** and create a bucket (example `qpaper-images`).
2. Create an R2 API token with **Object Read & Write** for **only that bucket**, and copy its R2 **Access Key ID** and **Secret Access Key**. These are not your ordinary Cloudflare account API token value.
3. Copy your Cloudflare **Account ID**. Its standard upload endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (you can use `R2_ENDPOINT` instead of account ID if required for a jurisdiction-specific endpoint).
4. **No public bucket is needed for question images.** New uploads use a protected same-origin `/api/uploads/image/...` endpoint that reads objects from R2 using the backend credentials. `R2_PUBLIC_URL` is optional for new uploads; retain it if older saved images used that URL.

**Privacy note:** Image URLs require login for question images; authenticated users who know a URL can read it. For strict confidential paper access, implement per-paper media authorization. You do not need to make your R2 bucket public.

## 2. Configure the existing EC2 Docker deployment

On your server, from your existing project directory (e.g. `/home/ubuntu/deploy`), **edit the existing `.env`**. Do not rerun the setup script, remove Docker volumes, or overwrite secrets.

```dotenv
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
# R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=qpaper-images
# Optional for new images; keep your previous value to resolve older saved R2 image links.
R2_PUBLIC_URL=
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
```

`R2_ENDPOINT` is optional when `R2_ACCOUNT_ID` is configured. You do not need to enable the public `r2.dev` URL or configure R2 bucket CORS to show newly uploaded images. The backend supplies private objects over the same origin.

Keep `AWS_REGION` and any `AWS_*` credentials as they were: AWS SES email integration may depend on them. The upload client obtains R2 credentials from the separate `R2_*` variables.

Set file permissions to protect the secrets:

```bash
chmod 600 .env
```

Apply the new backend and Compose configuration:

```bash
docker compose config --quiet
docker compose up -d --no-deps --build --force-recreate api
docker compose ps
docker compose logs --tail=80 api
```

No database migration is required. The latest image-preview/password UI patch does require rebuilding both `api` and `web`. Docker Compose passes the new variables to the API container, and the API reads them when handling uploads. You can confirm the **non-secret provider**:

```bash
docker compose exec api sh -c 'printf "STORAGE_PROVIDER=%s\n" "$STORAGE_PROVIDER"'
```

## 3. Test and troubleshoot

1. Log in as an administrator or teacher using an HTTPS domain (public HTTP cannot persist production login cookies).
2. Open the paper builder and upload a JPEG or PNG image no larger than 5 MiB.
3. Confirm that the image appears in your preview; the returned URL should begin with `/api/uploads/image/`.
4. Confirm the object exists in the R2 bucket under `questions/<user-id>/<uuid>.png` (or jpg/webp/gif).
5. Check that images render in **Preview → Print/Save as PDF** and DOCX. Both use the same-origin image route; R2 bucket CORS is not required.

`403 AccessDenied` often means wrong bucket, R2 token scope, or keys. A successful upload with a broken image may indicate a login-cookie problem or that the R2 token lacks **Object Read** permission; check the authenticated image GET response and API logs. `503` with a missing-setting error means the selected provider's environment fields aren't configured.

## 4. AWS S3 fallback and old images

Leave `STORAGE_PROVIDER=s3` (or omit it) to retain the previous AWS S3 behavior, with existing `S3_BUCKET`, `S3_PUBLIC_BASE_URL`, `AWS_REGION`, and AWS IAM credentials.

Switching to R2 changes **only future uploads**. Stored database image URLs are left as-is; do not delete the old AWS S3 bucket until you have migrated images and their references.

## 5. Local development without Docker

Add the same `STORAGE_PROVIDER=r2` and `R2_*` settings to `server/.env`, alongside your usual local PostgreSQL and JWT variables. Start the API from `server` with `npm run dev` and the frontend from the repository root with `npm run dev`.

## References

- Cloudflare R2 S3-compatible SDK: https://developers.cloudflare.com/r2/get-started/s3/
- R2 public buckets and custom domains: https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
