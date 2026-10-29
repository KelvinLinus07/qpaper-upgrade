# QPaper Studio 

## [live demo](http://13.236.178.46/)

## Recommended deployment: Docker Compose (AWS EC2 / any VPS)

For the easiest **single-server** deployment, use Docker Compose instead of ECS/Terraform. It runs React/Nginx, Express API, and PostgreSQL behind Caddy (automatic HTTPS with a domain); it supports Cloudflare R2 or existing AWS S3 for uploaded images.

```bash
./deploy/docker/setup.sh
# Local check: docker compose up -d --build && docker compose ps
# Production: first edit .env for your real domain, HTTPS and S3 configuration.
docker compose up -d --build
./deploy/docker/bootstrap-admin.sh
```

**Start here:** [`deploy/docker/README.md`](deploy/docker/README.md) for exact EC2 setup, HTTPS, first-run configuration, update/rollback guidance, and database backups. The previous ECS/Terraform files under `deploy/aws/` remain optional. **Never use the localhost HTTP defaults for a public deployment.**

Full-stack examination paper builder: **React 18 + Vite + Tailwind CSS v3 + React Router v6**, **Express.js**, **PostgreSQL**, and **Cloudflare R2 / AWS S3**.

## Included

- Mobile-friendly landing, About, Contact (working database-backed form), sign-in, sign-up, forgot/reset password, invitation acceptance
- React Router `HashRouter` for reliable static-host deep-link navigation, including GitHub Pages
- Role-based teacher, student, and admin dashboards, admin user-management panel
- Paper builder retains the five original question types, image uploads to R2 or S3, live preview, and PDF export
- **Question bank**: create, edit, search by text/subject/chapter/topic/difficulty, bulk CSV/JSON import, SHA-256 normalized-text duplicate detection, insert copies into a paper
- **Reusable paper templates**: 2 starter layouts, teacher-created/editable/duplicable reusable layouts, optional question content, and apply to independent new papers
- **Editable DOCX exports** (question papers and answer keys), print-faithful, selectable-text A4 PDFs using the same React paper preview (browser Save as PDF, including multilingual text)
- **Answer keys**: record answer/marking notes per question; export a separate answer key PDF/DOCX; answers are hidden from student paper preview
- **Autosave** every 9 seconds after editing, with a database snapshot on each save, version listing and restoration
- **Teacher invitations** with hashed, single-use, expiring tokens; optional SMTP email and copyable invitation link
- **Password reset** with generic confirmation (no user enumeration), hashed, one-time, 30-minute token, optional SMTP delivery
- **Institution branding** (name, logo, address, website, color); images stored in R2 or S3; logo displayed in builder preview/DOCX
- **Academic year** creation/activation and assignment to papers
- Contact messages stored in PostgreSQL, visible to admins

## Requirements

Node.js 20+ and npm, PostgreSQL 14+, Cloudflare R2 or AWS S3 credentials for images. SMTP server is optional for invitations but **required to deliver password-reset email**. Browser must reach R2/S3 images with CORS permission for export embeds.

## Cloudflare R2 image storage

Set `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID` (or `R2_ENDPOINT`), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Keep `STORAGE_PROVIDER=s3` for existing AWS S3 behavior. See **[`docs/CLOUDFLARE_R2.md`](docs/CLOUDFLARE_R2.md)** for exact Docker/EC2 setup. No database migration is required.

## Quick start

```bash
createdb qpaper
cp server/.env.example server/.env
# edit DATABASE_URL, JWT_SECRET (32+ random characters), S3 settings, etc.
cd server
npm install
npm run migrate
npm run seed:admin
npm run dev
```

In another terminal from the repository root:

```bash
npm install
npm run dev
```

Open **http://localhost:5173/#/**. The builder is at `/#/builder`, question bank at `/#/bank`, templates at `/#/templates`, admin at `/#/admin`. The Vite proxy forwards `/api` to port 4000. PostgreSQL migrations are **additive** and preserve the previous app's data.

To seed the admin, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), `ADMIN_NAME` in `server/.env` before `npm run seed:admin`.

### Import format

Accepts `.csv` with headers `type,text,options,answer,subject,chapter,topic,difficulty,marks` (options separated by `|`) or `.json` containing an array of questions / `{ "questions": [...] }` / `{ "sections": [{"questions": [...] }] }`. 500-question maximum per import. Use **Question bank → Sample CSV** to download a ready-to-edit template. Unsupported types become Objective. No OCR or DOCX-to-question extraction is claimed.

### What version history stores

Every successful save (manual or debounced autosave) writes a snapshot of paper info and all of its sections/questions in the same PostgreSQL transaction. Restore creates a **new** revision; older snapshots stay available. New question-bank changes don't alter papers because selected questions are copied into sections.

### PDF versus Word

- **PDF** now uses the **same React `Preview` component and styles** as the live preview. In the builder choose **Export → Question paper PDF**, review the full-size A4 sheet, then click **Print / Save as PDF** and choose your browser's **Save as PDF** destination. The preview and print share an exact 210mm A4 layout, 15mm horizontal / 16mm vertical margins, CBSE-style tables, MCQ option grids, matching questions, marks, school logo, and section rules. Browser PDF output keeps text selectable and supports Unicode fonts, including Hindi where system fonts provide glyphs.
- **Answer key PDF** opens a separate, print-ready answer-key layout with answers (teacher/admin only). **DOCX** remains an editable Word export; Word layout is independent and may differ from the PDF.
- **Do not** use browser headers/footers or custom print scaling if you need a faithful A4 layout. Choose **Paper: A4**, **Scale: 100%**, **Margins: Default/CSS**, **Headers and footers: Off**, and enable **Background graphics** when you need the table header fills/branding. Chrome/Edge print automatically supports the page margins specified in CSS.
- **DOCX** uses the `docx` library and generates editable headings, paragraphs, answer keys, sections and options. Images are included if they can be fetched with S3 CORS and encoded as JPEG/PNG. For non-image-rich papers, no S3 access is required to export.

## Deployment

Frontend may run on GitHub Pages using hash routes, but the backend must be deployed to a Node host with PostgreSQL and S3. Set `VITE_API_URL=https://your-api.example.com/api` **at frontend build time**, plus `CLIENT_ORIGIN` and `APP_URL` on the backend. Use HTTPS, same-site cookie policies, and/or a proxy to ensure cookie sessions function. Invitations and password reset links use `APP_URL/#/...`.

### Security and production hardening

All sensitive endpoints verify a signed, HttpOnly cookie and role checks; invitation and reset tokens are cryptographically random, SHA-256-hashed and expiring. Use CSRF protection, secure upload content inspection, S3 size/content quotas, organization tenant isolation for multi-institution SaaS, periodic orphan-image cleanup, audit logging, backup/restore procedures, tests, and monitoring before internet-facing production. Public self-registration creates teachers (consider restricting or invite-only registration for private institutions).

## Endpoints added in v3

- `GET /api/institution` · `PUT /api/admin/institution`
- `GET /api/academic-years` · `POST /api/admin/academic-years` · `PATCH /api/admin/academic-years/:id`
- `GET /api/bank` · `POST /api/bank` · `POST /api/bank/import` · `POST /api/bank/duplicates` · `PUT/DELETE /api/bank/:id`
- `GET /api/templates` · `POST /api/templates` · `DELETE /api/templates/:id`
- `GET /api/papers/:id/versions` · `GET /api/papers/:id/versions/:versionId` · `POST /api/papers/:id/restore/:versionId`
- `GET /api/admin/invitations` · `POST /api/admin/invitations` · `GET /api/auth/invitations/:token` · `POST /api/auth/accept-invite`
- `POST /api/auth/forgot-password` · `POST /api/auth/reset-password`
- `POST /api/contact` · `GET /api/admin/contact`

Existing authentication, question-paper CRUD, publish/unpublish and S3 upload endpoints remain available.

## Verification status

Source syntax checks are included. This environment could not reach the npm registry or run a PostgreSQL/S3 instance, so an actual Vite build and end-to-end runtime tests were **not** completed here. Run `npm install`, `npm run build`, database migrations, and integration tests in your own environment before deployment.

## Version 4: Reusable templates and analytics

### Create and reuse templates

1. Sign in as a **teacher or admin**. In **Templates** (`/#/templates`), select **Create template** to set a name, paper format, individual sections, question types, instructions, question counts and marks. Saved templates are stored in PostgreSQL (`paper_templates`) and remain after logout.
2. Alternatively, open **Builder → Workflow → Save template**. Choose **Layout only** (copies exact per-question types, section instructions and marks but clears questions/answers) or **Layout + question content** (includes question wording, MCQ choices, matching pairs, answers and S3 image URLs). Name and describe the template, then save.
3. In the **Template library**, choose **Use** to start an *independent new paper*, or choose **Edit**, **Copy** or **Delete** for templates you own. The two built-in templates are immutable but can be copied. Applying a template never alters the original layout, an existing paper or a saved paper revision.
4. Teachers can manage their own templates. Admins can make a template **Shared**, visible to teachers. Students can use only the built-in empty starter templates via the API; private and shared staff templates are not exposed to students, since full-content templates can contain solutions.
5. Templates saved by the earlier version using `questionCount` and `type` still load and can be copied/edited. Custom templates store their full layout as JSONB, preserving the existing database relationships for saved papers.

### Analytics dashboard

- **Dashboard** (`/#/dashboard`): period-filtered paper creation trend and a published/draft chart, plus real counts of papers, bank questions and saved custom templates.
- **Analytics** (`/#/analytics`): interactive **30 / 90 / 365-day** periods; charts of paper creation activity, publication status, most-used subjects, question-type mix, and question bank difficulty. The trend is aggregated by day / week / month respectively.
- All charts are drawn as accessible, responsive SVG and CSS; no chart library or external analytics service is required.
- Metrics use `/api/analytics?days=30|90|365` and are aggregated on the Express server from PostgreSQL. **Teacher:** their papers and question bank. **Admin:** institution-wide aggregates. **Student:** only published papers; private question bank/template stats are not accessible. No sample/demo figures are used. Empty datasets show honest empty states.
- Creation chart counts *new papers created during the period*, not revisions or edits. Other charts and summary totals show all-time saved data.

### Upgrade from v3

Run `npm run migrate` inside `server` **before starting the updated server**. Migration `003_templates_analytics.sql` adds the `updated_at` field and indexes without deleting existing users, papers, templates, or versions. No S3 or PDF export changes are needed; the preview-faithful A4 print/export logic is retained.

**Validation completed in this environment:** server source JavaScript syntax, frontend JSX parsing via TypeScript transpilation, relative import resolution, and direct template conversion assertions. **Not completed:** a full Vite build, authenticated API/database integration tests and rendered browser tests, because dependency installation timed out. Before deploying, run the steps in `docs/TESTING.md` with a live PostgreSQL connection and functional S3 credentials.

## AWS production deployment (v4 AWS package)

A complete AWS-focused deployment starter is available in `deploy/aws/README.md`. It includes Terraform definitions (VPC, TLS ALB, ECS Fargate, ECR, RDS PostgreSQL, private S3 buckets, CloudFront OAC, Route 53/ACM, IAM, CloudWatch and Secrets Manager), a production Dockerfile, an ECR bootstrap image script, a transactional database migration release workflow, Secrets Manager admin bootstrap, optional SES email, deployment checks, and operational cautions.

**Important:** The AWS package has not deployed anything to your account, charges apply once you run Terraform, and a custom Route 53-hosted domain is required. Follow the instructions before switching off your old hosting; this setup does not automatically migrate any pre-existing PostgreSQL data or uploads.


### v7: Question image preview and password visibility

New images are served through the Express `/api/uploads/image/...` endpoint using your configured S3/R2 storage; no public bucket domain or CORS is needed. The question editor shows upload progress and error feedback. Sign-in, registration, password-reset, and invitation forms have show/hide password buttons. See [`docs/IMAGE_PREVIEW_AND_PASSWORD_FIX.md`](docs/IMAGE_PREVIEW_AND_PASSWORD_FIX.md).
