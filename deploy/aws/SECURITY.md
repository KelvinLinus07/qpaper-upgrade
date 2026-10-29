# Security notes

- Production cookie: HttpOnly/Secure/SameSite=Lax. React sends the `X-QPaper-Request: 1` verification header on mutating API requests, enforced by Express. The backend also checks the browser Origin when present.
- API fronted by CloudFront `/api/*` with caching disabled. Never enable edge caching on protected endpoints. A second TLS hop connects CloudFront to the ALB regional ACM certificate.
- RDS: TLS verification via AWS RDS CA bundle, secret-managed password, PostgreSQL SSL required, AWS-managed master password, private networking.
- IAM task role has S3 `PutObject` limited to `questions/*`; SES sending to a verified sender identity if enabled. Do not use IAM user static keys in ECS.
- Uploaded image magic headers are checked in addition to MIME. File-size cap 5MB; malware scanning, orphan cleanup, content-policy enforcement, quota enforcement and signed media downloads are NOT implemented.
- Origin request only restricts to CloudFront's IP range, not specifically *your* CloudFront distribution. If origin bypass risk is important, add an origin custom header checked at the ALB/WAF or use CloudFront VPC origins/private ALB architecture.
- Public admin access/invitation routes remain open to legitimate authenticated admins. Students cannot access staff bank/templates/answer keys through API.
- Single-institution deployment; data is **not multi-tenant isolated**. Do not reuse the same DB for unrelated customer institutions without changing this design.
- Default single-AZ/single ECS task is not an HA setup. Production use should include WAF, alerting, backups, disaster recovery tests, retention policies and security audit.
