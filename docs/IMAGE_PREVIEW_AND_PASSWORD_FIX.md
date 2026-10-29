# QPaper Studio v7 — image display + password visibility fix

## Why images previously did not show

The v6 backend successfully uploaded the file to R2 or AWS S3, but saved a URL derived from `R2_PUBLIC_URL` or `S3_PUBLIC_BASE_URL`. If the bucket was private, the custom domain was unconfigured, or the browser blocked cross-origin image retrieval, the uploaded file would not render in the question, preview, PDF or DOCX.

## Fix

- New uploaded files are saved as **same-origin** URLs (`/api/uploads/image/<user-uuid>/<object-uuid>.png`). These are safe to store in `questions.image_url`, `question_bank.image_url`, and `institution_settings.logo_url`.
- `GET /api/uploads/image/:ownerId/:filename` retrieves the object through the configured R2/S3 SDK client. A normal authenticated browser session can load these images without a public R2 URL or CORS configuration. Institution logos recorded in the database may be retrieved anonymously.
- Question editor shows upload progress, client-side size/type checks (JPEG, PNG, WebP, GIF, max 5 MiB), an image thumbnail, and errors for unsuccessful retrieval.
- Live preview and PDF reuse the same `q.image`, with a visible failure message when an image cannot be rendered. DOCX image fetching also works via the same-origin path.
- Old `https://R2_PUBLIC_URL/questions/...` images are converted *on load* in the paper, question bank and templates when the configured `R2_PUBLIC_URL` matches the old link. Do not unset that variable if you need to display old R2 image links.
- Existing HTTPS image URLs are still accepted. R2's public delivery domain is **optional** for new uploads. AWS S3 is still supported.

**Access control:** New question image URLs require a signed-in session; users who know a valid opaque URL can read the image after signing in. These are not per-paper or per-student access checks. Branding logos saved as institution logo are available publicly. For highly confidential exam content, add image-level authorization before wider deployment.

## Login / registration improvement

Eye/EyeOff password visibility toggles are available in sign-in, registration, invitation acceptance, and reset-password forms. They only change the input type and never store or log the password. The button is keyboard-accessible and has an accessible label.

## Existing AWS EC2 Docker Compose deployment

1. Upload the patch ZIP from your **local computer**:

   ```bash
   scp -i kela-quest.pem qpaper-studio-v7-image-password-patch.zip ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/
   ```

2. On EC2, **keep your existing `.env` and PostgreSQL volumes**:

   ```bash
   cd /home/ubuntu/deploy
   cp -a src src.before-image-fix
   cp -a server/src server/src.before-image-fix
   unzip -o /home/ubuntu/qpaper-studio-v7-image-password-patch.zip -d /home/ubuntu/deploy
   docker compose config --quiet
   docker compose up -d --no-deps --build --force-recreate api web
   docker compose ps
   ```

3. In `.env`, retain `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`/`R2_ENDPOINT`, `R2_BUCKET`, and your R2 access credentials. `R2_PUBLIC_URL` is optional for **new** images but should remain set if old saved image URLs use that prefix. The token must have both object **Read** and **Write** permissions.
4. Refresh the browser, open Builder, upload a new test PNG, confirm an attached thumbnail and live preview, save, reload, print PDF, and export DOCX.

**No database migration or admin reseed is required.** Do not run `docker compose down -v`.

## Local development

If using local Vite and Node.js, run the backend on port 4000, frontend on port 5173, and PostgreSQL on its configured port. Vite proxies `/api` requests to Express. Cookies must be configured for the correct local HTTP origin (localhost). `server/.env` must include the same R2 settings as the API container.

## Troubleshooting

| What you see | What to check |
|---|---|
| Upload returns 503 | R2 endpoint, bucket or credentials not configured in API container |
| Upload returns 403 | R2 token lacks Object Write permission or bucket is wrong |
| Upload succeeds but image GET is 401 | Login cookie missing; use your signed-in website origin and HTTPS in production |
| Image GET returns 404 | Object key not found; R2 bucket or provider has changed |
| Image GET returns 500 | R2 GetObject failed; token may lack Object Read or the endpoint is incorrect; check API logs |
| Existing R2 images still fail | Retain the **exact old** R2 public URL in `R2_PUBLIC_URL` to enable on-load conversion |
| Image doesn't survive reload | Check the paper save response; confirm question `image_url` is stored in PostgreSQL |

For debugging without disclosing credentials: `docker compose logs --tail=100 api`. Do **not** paste `.env` or access keys publicly.
