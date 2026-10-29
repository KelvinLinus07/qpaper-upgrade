# Apply the Cloudflare R2 patch to an existing QPaper Studio Docker installation

This patch is intended for the existing QPaper Studio **v5 Enlarge Preview** Docker package. It changes only the Express upload route, adds its storage configuration helper, and passes new variables into `compose.yaml`. The PostgreSQL schema, React UI, equation rendering, PDF export, and current `.env` stay unchanged.

## 1. Create your Cloudflare R2 bucket and access keys

In Cloudflare Dashboard → R2 Object Storage, create the bucket and a bucket-scoped **Object Read & Write** API token. Copy the Cloudflare Account ID and R2 **Access Key ID** and **Secret Access Key**. For public image display, configure an R2 **Custom Domain**, for example `https://images.example.com` (or temporarily use the R2 public `r2.dev` URL for testing only).

## 2. Upload the patch (from your local computer)

```bash
scp -i kela-quest.pem qpaper-studio-r2-patch.zip ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/
```

## 3. Back up the current source, then extract (on EC2)

```bash
cd /home/ubuntu/deploy
cp server/src/index.js server/src/index.js.before-r2
cp compose.yaml compose.yaml.before-r2
unzip -o /home/ubuntu/qpaper-studio-r2-patch.zip -d /home/ubuntu/deploy
```

Do **not** extract over or replace your `.env`. The patch contains only code, example env files, documentation, and tests.

## 4. Edit the existing `.env` (on EC2)

```bash
nano .env
```

Add or adjust the following lines (using your actual values and no duplicates):

```dotenv
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=YOUR_ACCOUNT_ID
R2_BUCKET=qpaper-images
R2_PUBLIC_URL=https://images.yourdomain.com
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
```

`R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com` can be used instead of `R2_ACCOUNT_ID`. Keep all existing PostgreSQL/JWT/authentication/domain/SMTP settings unchanged. Do **not** reuse AWS credentials for R2.

```bash
chmod 600 .env
docker compose config --quiet
```

## 5. Rebuild only the Express API

```bash
docker compose up -d --no-deps --build --force-recreate api
docker compose ps
docker compose exec api sh -c 'printf "STORAGE_PROVIDER=%s\n" "$STORAGE_PROVIDER"'
docker compose logs --tail=80 api
```

No database migration or admin re-seeding is needed. Test a question image upload in your builder and confirm the URL loads over HTTPS.

## 6. Roll back (if necessary)

```bash
cd /home/ubuntu/deploy
cp server/src/index.js.before-r2 server/src/index.js
cp compose.yaml.before-r2 compose.yaml
# Restore STORAGE_PROVIDER=s3 and your original S3_* values in .env.
docker compose up -d --no-deps --build --force-recreate api
```

**Warning:** Rolling back to S3 does not migrate R2 images. Images already stored in R2 need to remain accessible by their saved URLs. Do not delete your R2 bucket or old AWS S3 bucket without migrating images.

Detailed setup and privacy/CORS notes: [`CLOUDFLARE_R2.md`](CLOUDFLARE_R2.md).
