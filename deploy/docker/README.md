# Deploy QPaper Studio with Docker Compose (recommended)

This is the **simpler alternative to ECS, ECR, Terraform and RDS**. Install Docker on one AWS EC2 instance (or Ubuntu VPS), configure a domain, and run a single Compose stack:

| Service | Container | Exposed to internet? |
| --- | --- | --- |
| TLS / reverse proxy | Caddy | Yes (ports 80/443) |
| React / Tailwind static app | Nginx | No |
| Express REST API | Node.js 22 | No |
| Database | PostgreSQL 16 | No; persistent Docker volume |
| Uploaded question images | **Cloudflare R2 or AWS S3** | Private object storage read via authenticated `/api/uploads/image/...` (public URL optional) |

**Not Kubernetes. No AWS load balancer. No Vite development server in production.** This is a *single-host* setup: it does **not** automatically provide high availability or managed database backups. The previous Terraform config remains in `deploy/aws/` if you later need managed scaling.

## 1. Requirements

- Docker Engine with **Docker Compose v2** (`docker compose version`), 64-bit Linux VM or EC2 instance. A small deployment can start with 2 vCPU / 4 GB RAM; actual sizing depends on simultaneous users and workloads.
- For production: DNS A/AAAA record pointing the chosen hostname to this VM. Open inbound TCP **80 and 443**, and SSH only from trusted IPs. Do **not** open 5432 or 4000 publicly.
- Cloudflare R2 bucket (or AWS S3) for image uploads. Configure `STORAGE_PROVIDER=r2` and the `R2_*` variables as described in [`docs/CLOUDFLARE_R2.md`](../../docs/CLOUDFLARE_R2.md). Keep `STORAGE_PROVIDER=s3` to use AWS S3 as before.
- Optional SMTP or AWS SES for invitation and password reset emails.

On Ubuntu with Docker Engine and the Compose plugin installed (from Docker's official packages):

```bash
# from the project root:
docker compose version
./deploy/docker/setup.sh
```

The script creates an untracked, chmod-600 `.env` with unique random PostgreSQL and JWT secrets. **Never commit `.env`** and do not publish the database password.

## 2. Local verification (no domain yet)

The generated `.env` uses:

```dotenv
APP_URL=http://localhost:8080
SITE_ADDRESS=:80
HTTP_PORT=8080
HTTPS_PORT=8443
COOKIE_SECURE=false
```

Start everything:

```bash
docker compose up -d --build
docker compose ps
./deploy/docker/bootstrap-admin.sh
./deploy/docker/check.sh
```

Visit **http://localhost:8080/#/**. Frontend `/api` calls reach Express through the *same origin*, so session cookies and CORS work. `COOKIE_SECURE=false` is honored by the API **only when APP_URL is `http://localhost` or `http://127.0.0.1` (optionally with a port)**. It is **not** an insecure-cookie switch for public hosts.

**Do not use the local HTTP configuration on an internet-facing server**. Logins and passwords require HTTPS outside localhost. Docker builds download npm packages and base images, so the first build needs network access.

## 3. Production EC2/VPS setup with automatic HTTPS

1. Create the instance, attach an Elastic IP or static IP, configure `papers.yourdomain.com` DNS A record. Open inbound TCP 80/443. Allow administrative SSH only from trusted IP addresses. Install current supported Docker Engine + Compose plugin; verify that the user running commands has Docker access.
2. Run `./deploy/docker/setup.sh` only if `.env` does not already exist. Then **edit `.env` before starting**. Use your actual domain:

   ```dotenv
   APP_URL=https://papers.yourdomain.com
   SITE_ADDRESS=papers.yourdomain.com
   HTTP_PORT=80
   HTTPS_PORT=443
   COOKIE_SECURE=true
   ALLOW_SELF_REGISTRATION=false
   ```

3. Choose object storage: **Cloudflare R2** (recommended if switching away from S3):

   ```dotenv
   STORAGE_PROVIDER=r2
   R2_ACCOUNT_ID=your-cloudflare-account-id
   R2_BUCKET=qpaper-images
   # R2_PUBLIC_URL is optional for new uploads; keep if you have legacy saved URLs
   R2_ACCESS_KEY_ID=your-r2-access-key
   R2_SECRET_ACCESS_KEY=your-r2-secret-key
   ```

   Or keep **AWS S3**:

   ```dotenv
   STORAGE_PROVIDER=s3
   AWS_REGION=ap-south-1
   S3_BUCKET=your-existing-bucket
   S3_PUBLIC_BASE_URL=https://your-image-cdn.example.com
   ```

   For the full R2 setup, custom domain and troubleshooting instructions see [`docs/CLOUDFLARE_R2.md`](../../docs/CLOUDFLARE_R2.md).

   Prefer an **EC2 IAM instance profile** granting only `s3:PutObject` for the designated image prefix. When relying on IMDSv2 from containers, ensure the instance metadata hop limit permits container network requests (typically **2**). For a non-AWS VPS, use narrowly scoped AWS credentials in `.env` and protect the file. Existing images remain in the bucket; Compose does not copy/migrate S3 objects.
4. Configure SMTP (`SMTP_HOST`, `SMTP_USER`, etc.) **or** a verified AWS SES sender using `SES_FROM_EMAIL` with appropriate IAM permissions. Without this, password-reset and invitation emails will not be delivered.
5. Launch (first run builds the frontend and API, starts PostgreSQL, **automatically applies migrations**, then starts the application):

   ```bash
   docker compose up -d --build
   docker compose ps
   ./deploy/docker/bootstrap-admin.sh
   ./deploy/docker/check.sh
   ```

6. Visit `https://papers.yourdomain.com/#/`. Caddy automatically requests/renews a trusted certificate when public DNS and inbound 80/443 are working. Check Caddy logs if certificate provisioning fails: `docker compose logs --tail=100 proxy`.

**Important:** Reverse proxies, CDNs and firewalls in front of Caddy must preserve HTTPS, original Host and standard forwarded headers. Express is configured to trust one proxy hop (Caddy). If you later add an external proxy, review `TRUST_PROXY_HOPS`, `APP_URL` and request-origin validation.

## 4. Useful commands

```bash
# Start or apply new source code. The migration service runs before the API.
docker compose up -d --build

# Check status and logs
docker compose ps
docker compose logs -f --tail=100 api

docker compose logs -f --tail=100 proxy

# Smoke test homepage and authenticated-API database readiness
./deploy/docker/check.sh

# Back up PostgreSQL (custom-format dump) before each upgrade
./deploy/docker/backup-db.sh

# Backup, build, restart and test
./deploy/docker/update.sh

# Stop containers WITHOUT removing PostgreSQL, Caddy certs or secrets
docker compose down
```

**Never run `docker compose down -v` unless you deliberately intend to DELETE the PostgreSQL database and certificate volumes.** Do not rely only on Compose volumes for backup: move backups to encrypted off-host storage and test restoring periodically.

### Restoring a PostgreSQL backup

Stop API traffic and take a fresh safety backup first. Restoring overwrites data, so do this only in a controlled maintenance window. For example, for a *new, empty* deployment after migrations and with a trusted dump:

```bash
# See the archive content first:
docker compose exec -T db pg_restore --list < backups/qpaper-DATE.dump
# Restore ONLY after preparing the destination (may replace existing objects):
# docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < backups/qpaper-DATE.dump
```

Use a temporary database for restore tests. Backup includes the application tables; S3 images are a **separate** backup/retention responsibility. If migrating from RDS, export/import PostgreSQL appropriately and retain the same S3 bucket URLs to preserve saved paper images.

## 5. Troubleshooting

| Problem | Fix |
| --- | --- |
| Caddy doesn't obtain HTTPS | DNS A record, security group/firewall 80/443, and domain spelling; check proxy logs |
| `api` not starting | Look at `docker compose logs migrate db api`; migrations run first and require a healthy DB |
| Login doesn't persist | APP_URL must equal the browser origin; public domains must use HTTPS and `COOKIE_SECURE=true` |
| Images fail to upload | R2: verify `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`/`R2_ENDPOINT`, `R2_BUCKET`, R2 credentials; S3: verify bucket, region and IAM |
| Images appear broken in DOCX/PDF | Ensure browser access to the image CDN and CORS configured for your domain |
| Password reset email not sent | Add SMTP or verified SES configuration; the public response intentionally doesn't reveal users |
| Local port conflicts | Change HTTP_PORT/HTTPS_PORT in `.env`; don't change internal container ports |
| Frontend build fails | Allow build access to npm registry, inspect `docker compose build web --progress=plain` |

## 6. Deployment limitations and security checklist

- Compose is excellent for a **single-host deployment**, not a multi-zone high-availability service. If the VM fails, the application stays unavailable until you restore it. Plan maintenance windows and monitor free disk space.
- Rotate secrets and back up `postgres_data` **off the host**. PostgreSQL remains inside a private Docker network with no published port. Enable encrypted EBS and snapshot/backup retention on EC2.
- Restrict sign-ups (`ALLOW_SELF_REGISTRATION=false` by default); use teacher invitations. Only run `bootstrap-admin.sh` with trusted administrators—it can reset the account with the same email.
- Implement additional controls before handling real high-stakes exams: integration tests, rate limiting at the edge, access/audit logging, disaster-recovery drills, image scanning, and tenant isolation if hosting multiple institutions.
- **Not a live deployment verification**: to certify a production deployment you must build images and test authenticated flows against your own Docker host, S3 and SMTP.

## 7. What changed versus AWS/Fargate edition

- **Added:** `compose.yaml`, Caddy automatic HTTPS, Nginx production frontend Dockerfile, Compose API Dockerfile, Docker `.env` starter, admin/backup/health/update helpers.
- **Reused:** existing React UI, paper preview/PDF behavior, Express routes, all 3 additive PostgreSQL migrations, user/paper/template/version data structure, R2/S3 uploads, SMTP/SES integrations.
- **Unchanged / optional:** `deploy/aws/` infrastructure files; no Terraform or ECS knowledge needed to use the Compose path.
