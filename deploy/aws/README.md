# QPaper Studio v4 — AWS deployment guide

This folder prepares the existing full-stack source for **one institution** on AWS. It does not deploy into your account automatically. Infrastructure provisioning consumes AWS resources and incurs ongoing charges.

## Production architecture

```text
Browser: https://papers.example.com/#/dashboard
                  |
          Route 53 + ACM (TLS)
                  |
             CloudFront
        +---------+-----------+
        |         |           |
        v         v           v
       /       /questions/*  /api/* (NO CACHE)
  private S3   private S3    HTTPS (TLS 1.2+)
  site bucket  image bucket         |
                  ^                ALB (CloudFront ingress only)
                  |                  |
               PutObject       ECS Fargate Express
              IAM task role       /         \
                               private     AWS SES
                             RDS Pg16     (optional)
```

- React/Vite + Tailwind frontend is a static S3 site served by CloudFront with **origin access control (OAC)**, not a public website bucket.
- CloudFront forwards `/api/*` to an HTTPS ALB/ECS API, including cookies and query strings, with caching **disabled**. It forwards `/questions/*` to a private S3 images bucket, enabling image display and PDF export on the same domain.
- Express, auth, templates, versions, analytics, bank search, migrations, and paper CRUD are retained. RDS PostgreSQL is encrypted, private, backed up, and requires TLS with certificate verification.
- User session cookies are Secure+HttpOnly in production, and API mutations require a custom anti-CSRF request header. Self-registration defaults to **off**; administrators send invitations to staff.
- Fargate retrieves images from ECR, uses its task role for S3 uploads and optional SES email, and reads DB/JWT secrets from Secrets Manager.
- No AWS access key or database password is checked into the ZIP.

## Prerequisites

You need an AWS account with permission to create VPC, RDS, ECS, ECR, CloudFront, Route 53, ACM, IAM, S3, CloudWatch and Secrets Manager resources; AWS CLI v2 authenticated (`aws sts get-caller-identity`); Terraform >=1.6; Docker Engine; Node 20+ and npm; `jq`, `curl`, and a Git client (optional for commit-based tags). Production also requires a domain managed by an existing **public Route 53 hosted zone**. Change the example domain and DNS zone before applying.

The default infrastructure is cost-conscious, **not highly available**: one Fargate task and single-AZ RDS. ALB, NAT-free public ECS networking, RDS, CloudFront, storage and data transfer incur costs. Enable `db_multi_az=true` and `api_desired_count=2` for higher availability, plus WAF, alerting, operational on-call and restore rehearsals before mission-critical use.

> Terraform state contains sensitive generated JWT material and infrastructure metadata. Use an encrypted, access-controlled **remote S3 state backend** with locking and versioning for teams. `terraform/backend.tf.example` is an illustrative starting point. Never commit tfstate.

## A. First infrastructure provisioning

1. Extract ZIP. Go to `deploy/aws/terraform` and prepare input values:

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # edit domain_name, hosted_zone_name, region, environment
   terraform init
   terraform validate
   terraform plan
   ```

2. Optionally set up your initial admin without putting a password in Terraform state:

   Create a temporary local file (do not commit it) named `admin-secret.json` with `{"email":"admin@yourdomain.com","name":"Administrator","password":"your-unique-strong-password"}`. Upload it to Secrets Manager:

   ```bash
   aws secretsmanager create-secret \
     --region ap-south-1 \
     --name qpaper/initial-admin \
     --secret-string file://admin-secret.json \
     --query ARN --output text
   ```

   Put the returned ARN into `admin_bootstrap_secret_arn` in `terraform.tfvars`, then **securely delete your local copy** of `admin-secret.json`. Change/rotate the secret after first bootstrap; it isn't needed by the normal API workflow.

3. Bootstrap the ECR repository and upload the first API image **before** the rest of Terraform attempts to run ECS:

   ```bash
   cd ../../..   # project root
   ./deploy/aws/bootstrap-image.sh
   cd deploy/aws/terraform
   terraform apply
   ```

   The `bootstrap-image.sh` script performs a one-off targeted apply for ECR; review its plan. Always follow it with a complete `terraform apply`. ACM will request DNS validation in Route 53 in **both** your workload region and `us-east-1` (CloudFront). If validation fails, verify your domain delegates to that hosted zone.

4. Deploy app, migrate the database, and optionally create the first admin:

   ```bash
   cd ../../..  # project root
   BOOTSTRAP_ADMIN=true ./deploy/aws/release.sh
   ```

   If no admin bootstrap secret was configured, run without `BOOTSTRAP_ADMIN=true`, then provision an admin through a controlled database operation before issuing invitations. **Do not enable public self-registration just to create an admin.**

5. Confirm the app and private DB are reachable:

   ```bash
   ./deploy/aws/smoke-test.sh https://papers.example.com
   ```

   Test the complete flow manually: login, question bank, template create/apply, paper autosave and history, upload an image, PDF preview/print, DOCX, analytics, admin panel, invitation and password reset.

## B. Subsequent releases

From the project root:

```bash
IMAGE_TAG=release-2026-10-27 ./deploy/aws/release.sh
```

The release script performs these **in order**:

1. Build/push the Express Docker image to ECR.
2. Register a new ECS task definition pointing at this image.
3. Run `node src/migrate.js` as a one-off ECS/Fargate task; fail closed on any non-zero exit code.
4. Deploy the ECS service with its new task definition and wait for healthy tasks.
5. Run `npm install` / `npm ci` and `vite build` for the frontend, sync built assets to S3, then upload `index.html` with no-cache headers and invalidate `/` and `/index.html` in CloudFront.

**Rollback:** Repoint ECS service to the previous task definition (`aws ecs update-service --task-definition ...`), redeploy an earlier static frontend artifact to S3, and invalidate CloudFront. **PostgreSQL schema downgrades are not automatic**; design migrations to be backward compatible and take verified backups before destructive changes.

## C. AWS SES email / password reset

For fully functioning password resets and invitations, verify the sender identity and domain in **Amazon SES**, request production sending access if your account is still in the SES sandbox, and set `ses_from_email` in `terraform.tfvars`, then `terraform apply`. Deploy another release to register the task with the updated sender setting. Emails are sent using the ECS task role via AWS SDK, without SMTP passwords.

If SES is not configured, the API will accept password-reset requests but cannot deliver reset links. Invitation links may be copied from the administrator panel where available.

## D. Images, permissions and data privacy

The images bucket is **not public**; CloudFront OAC is the only read path. However `/questions/<user-id>/<random-id>.<ext>` images are **publicly viewable if someone knows the exact CDN URL**. For confidential assessments, add authenticated signed URLs/cookies and per-institution media authorization *before* using it to store sensitive exam content. Uploaded images are limited to 5 MB, with MIME extension checks and signature sniffing; stronger antivirus or image transcoding is recommended.

Do not expose the RDS port publicly. The database security group allows Postgres connections only from the ECS task group. Keep RDS automated backups, test point-in-time recovery and keep S3 images versioning enabled. Rotate JWT/admin credentials as part of a documented incident recovery plan.

## E. Existing PostgreSQL data

The Terraform setup creates a **new RDS database** and runs the existing SQL migrations (`001`, `002`, `003`). It **does not copy data** from your current local or separately hosted PostgreSQL server. If you have real users/papers, schedule a controlled migration window: make a consistent `pg_dump -Fc` backup, restore it to RDS using a client inside the AWS VPC (e.g. an isolated Fargate migration task), verify counts/roles/image URLs, then point the new service at RDS. Do not open RDS to the public Internet to simplify a restore. The existing S3 images may need an object copy and image URL rewrite, if their domain/bucket changes.

## F. Deployment checklist

- [ ] Route 53 hosted zone is authoritative for the app domain.
- [ ] Terraform state is encrypted, locked and access-controlled.
- [ ] Infra plan reviewed, budget alerts configured.
- [ ] RDS is private, TLS-enabled, backups configured.
- [ ] ECS service is healthy; CloudWatch application logs reviewed.
- [ ] CloudFront `/api/*` is no-cache and forwards auth cookies and query strings.
- [ ] `https://domain/api/health` returns 200 with database `ok=true`.
- [ ] IAM task role can PUT images; uploaded HTTPS CDN URL loads.
- [ ] Admin bootstrapped, registration policy chosen, invitations tested.
- [ ] SES identity and sending status checked if password reset is required.
- [ ] Question PDF matches browser preview, including image links, Unicode text and page breaks.
- [ ] Test data restoration and document rolling back a bad release.

## Limitations / things not automatically provided

No CI/CD pipeline is enabled without your approval and credentials; releases run from your authenticated workstation. A Web Application Firewall, advanced observability/alarms, tenant isolation, private CDN image authorization, and a robust high-availability/failover strategy are **not** included in this baseline. Infrastructure code is provided but has **not been applied** to an AWS account in this environment. See `docs/TESTING.md` for feature tests.
