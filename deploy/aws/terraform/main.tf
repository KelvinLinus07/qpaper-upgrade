terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.50, < 7.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = { Project = "qpaper-studio", Environment = var.environment, ManagedBy = "terraform" } }
}
provider "aws" {
  alias  = "use1"
  region = "us-east-1"
  default_tags { tags = { Project = "qpaper-studio", Environment = var.environment, ManagedBy = "terraform" } }
}

variable "region" { type = string
   default = "ap-south-1" }
variable "environment" { type = string
   default = "production" }
variable "domain_name" { type = string
   description = "App hostname, e.g. papers.example.com" }
variable "hosted_zone_name" { type = string
   description = "Existing public Route 53 hosted zone, e.g. example.com" }
variable "image_tag" { type = string
   default = "bootstrap" }
variable "api_desired_count" { type = number
   default = 1 }
variable "db_instance_class" { type = string
   default = "db.t4g.micro" }
variable "db_multi_az" { type = bool
   default = false }
variable "ses_from_email" { type = string
   default = ""
   description = "Sender verified with SES; production sending also requires SES production access" }
variable "admin_bootstrap_secret_arn" { type = string
   default = ""
   description = "ARN of JSON secret with email, password, and name for creating first admin" }
variable "allow_self_registration" { type = bool
   default = false }
variable "enable_deletion_protection" { type = bool
   default = true }

locals {
  prefix        = "qpaper-${var.environment}"
  origin_domain = "origin.${var.domain_name}"
  web_url       = "https://${var.domain_name}"
}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }
data "aws_route53_zone" "public" { name = "${trimsuffix(var.hosted_zone_name, ".")}."
   private_zone = false }
data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }

# Network: public ALB and Fargate subnets
# Isolated private RDS subnets, no public RDS IP.
resource "aws_vpc" "main" {
  cidr_block = "10.42.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = { Name = "${local.prefix}-vpc" }
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id }
resource "aws_subnet" "public" {
  count = 2
  vpc_id = aws_vpc.main.id
  availability_zone = data.aws_availability_zones.available.names[count.index]
  cidr_block = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
  tags = { Name = "${local.prefix}-public-${count.index + 1}" }
}
resource "aws_subnet" "private" {
  count = 2
  vpc_id = aws_vpc.main.id
  availability_zone = data.aws_availability_zones.available.names[count.index]
  cidr_block = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 20)
  tags = { Name = "${local.prefix}-db-${count.index + 1}" }
}
resource "aws_route_table" "public" { vpc_id = aws_vpc.main.id
   route { cidr_block = "0.0.0.0/0"
   gateway_id = aws_internet_gateway.main.id } }
resource "aws_route_table_association" "public" { count = 2
   subnet_id = aws_subnet.public[count.index].id
   route_table_id = aws_route_table.public.id }

resource "aws_security_group" "alb" {
  name_prefix = "${local.prefix}-alb-"
  vpc_id = aws_vpc.main.id
  description = "HTTPS from CloudFront origin-facing addresses only"
  ingress { from_port = 443
   to_port = 443
   protocol = "tcp"
   prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id] }
  egress { from_port = 4000
   to_port = 4000
   protocol = "tcp"
   cidr_blocks = ["10.42.0.0/16"] }
  lifecycle { create_before_destroy = true }
}
resource "aws_security_group" "api" {
  name_prefix = "${local.prefix}-api-"
  vpc_id = aws_vpc.main.id
  description = "Application traffic from ALB and outbound TLS / Postgres"
  ingress { from_port = 4000
   to_port = 4000
   protocol = "tcp"
   security_groups = [aws_security_group.alb.id] }
  egress { from_port = 0
   to_port = 0
   protocol = "-1"
   cidr_blocks = ["0.0.0.0/0"] }
  lifecycle { create_before_destroy = true }
}
resource "aws_security_group" "db" {
  name_prefix = "${local.prefix}-db-"
  vpc_id = aws_vpc.main.id
  description = "Postgres connections from API tasks only"
  ingress { from_port = 5432
   to_port = 5432
   protocol = "tcp"
   security_groups = [aws_security_group.api.id] }
  lifecycle { create_before_destroy = true }
}

# RDS PostgreSQL: RDS-managed master secret, encrypted storage and backups.
resource "aws_db_subnet_group" "main" {
  name = "${local.prefix}-db"
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.prefix}-pg16-"
  family = "postgres16"
  parameter { name = "rds.force_ssl"
   value = "1" }
  lifecycle { create_before_destroy = true }
}
resource "aws_db_instance" "postgres" {
  identifier = "${local.prefix}-postgres"
  engine = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class
  db_name = "qpaper"
  username = "qpaperadmin"
  manage_master_user_password = true
  allocated_storage = 20
  max_allocated_storage = 100
  storage_type = "gp3"
  storage_encrypted = true
  multi_az = var.db_multi_az
  publicly_accessible = false
  backup_retention_period = 7
  auto_minor_version_upgrade = true
  deletion_protection = var.enable_deletion_protection
  skip_final_snapshot = false
  final_snapshot_identifier = "${local.prefix}-final"
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name = aws_db_parameter_group.postgres.name
  apply_immediately = false
  copy_tags_to_snapshot = true
}

# S3 buckets remain private
# CloudFront signs GET requests with OAC.
resource "random_id" "suffix" { byte_length = 4 }
resource "aws_s3_bucket" "site" { bucket = "${local.prefix}-site-${random_id.suffix.hex}" }
resource "aws_s3_bucket" "images" { bucket = "${local.prefix}-images-${random_id.suffix.hex}" }
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id
  block_public_acls = true
   block_public_policy = true
   ignore_public_acls = true
   restrict_public_buckets = true
}
resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id
  block_public_acls = true
   block_public_policy = true
   ignore_public_acls = true
   restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "images" { bucket = aws_s3_bucket.images.id
   versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_server_side_encryption_configuration" "site" { bucket = aws_s3_bucket.site.id
   rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } } }
resource "aws_s3_bucket_server_side_encryption_configuration" "images" { bucket = aws_s3_bucket.images.id
   rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } } }
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule { id = "cleanup-previous-versions"
   filter {}
   status = "Enabled"
   noncurrent_version_expiration { noncurrent_days = 90 } }
}

resource "aws_ecr_repository" "api" {
  name = "${local.prefix}-api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({ rules = [{rulePriority=1,description="Keep 20 latest images",selection={tagStatus="any",countType="imageCountMoreThan",countNumber=20},action={type="expire"}}] })
}
resource "aws_cloudwatch_log_group" "api" { name = "/ecs/${local.prefix}/api"
   retention_in_days = 30 }
resource "aws_ecs_cluster" "main" { name = local.prefix }

resource "aws_iam_role" "execution" {
  name = "${local.prefix}-ecs-execution"
  assume_role_policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]})
}
resource "aws_iam_role_policy_attachment" "execution" {
  role = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "execution_secrets" {
  name = "rds-secret-read"
  role = aws_iam_role.execution.id
  policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Action=["secretsmanager:GetSecretValue"],Resource=[aws_db_instance.postgres.master_user_secret[0].secret_arn]}]})
}
resource "aws_iam_role" "task" {
  name = "${local.prefix}-ecs-task"
  assume_role_policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]})
}
resource "aws_iam_role_policy" "task" {
  name = "uploads-email-seed"
  role = aws_iam_role.task.id
  policy = jsonencode({Version="2012-10-17",Statement=concat(
    [{Effect="Allow",Action=["s3:PutObject"],Resource=["${aws_s3_bucket.images.arn}/questions/*"]}],
    var.ses_from_email != "" ? [{Effect="Allow",Action=["ses:SendEmail"],Resource=["arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/${var.ses_from_email}"]}] : [],
    var.admin_bootstrap_secret_arn != "" ? [{Effect="Allow",Action=["secretsmanager:GetSecretValue"],Resource=[var.admin_bootstrap_secret_arn]}] : []
  )})
}

resource "aws_ecs_task_definition" "api" {
  family = "${local.prefix}-api"
  network_mode = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu = 512
  memory = 1024
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture = "X86_64"
  }
  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name = "api"
    image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{containerPort=4000,hostPort=4000,protocol="tcp"}]
    environment = [
      {name="NODE_ENV",value="production"},
      {name="PORT",value="4000"},
      {name="AWS_REGION",value=var.region},
      {name="DB_HOST",value=aws_db_instance.postgres.address},
      {name="DB_PORT",value="5432"},
      {name="DB_NAME",value="qpaper"},
      {name="DB_USER",value="qpaperadmin"},
      {name="DB_SSL_CA_FILE",value="/app/certs/global-bundle.pem"},
      {name="S3_BUCKET",value=aws_s3_bucket.images.id},
      {name="S3_PUBLIC_BASE_URL",value=local.web_url},
      {name="CLIENT_ORIGIN",value=local.web_url},
      {name="APP_URL",value=local.web_url},
      {name="ALLOW_SELF_REGISTRATION",value=tostring(var.allow_self_registration)},
      {name="SES_FROM_EMAIL",value=var.ses_from_email},
      {name="TRUST_PROXY_HOPS",value="2"},
      {name="ADMIN_BOOTSTRAP_SECRET_ARN",value=var.admin_bootstrap_secret_arn}
    ]
    secrets = [
      {name="DB_PASSWORD",valueFrom="${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::"},
      {name="JWT_SECRET",valueFrom=aws_secretsmanager_secret.jwt.arn}
    ]
    logConfiguration = {logDriver="awslogs",options={"awslogs-group"=aws_cloudwatch_log_group.api.name,"awslogs-region"=var.region,"awslogs-stream-prefix"="api"}}
    healthCheck = {command=["CMD-SHELL","node -e \"fetch('http://localhost:4000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],interval=30,timeout=5,retries=3,startPeriod=35}
  }])
}
resource "random_password" "jwt" { length = 64
   special = false }
resource "aws_secretsmanager_secret" "jwt" { name = "${local.prefix}/jwt"
   recovery_window_in_days = 7 }
resource "aws_secretsmanager_secret_version" "jwt" { secret_id = aws_secretsmanager_secret.jwt.id
   secret_string = random_password.jwt.result }

resource "aws_lb" "api" {
  name = "${local.prefix}-alb"
  internal = false
  load_balancer_type = "application"
  security_groups = [aws_security_group.alb.id]
  subnets = aws_subnet.public[*].id
  enable_deletion_protection = var.enable_deletion_protection
}
resource "aws_lb_target_group" "api" {
  name = "${local.prefix}-tg"
  port = 4000
  protocol = "HTTP"
  vpc_id = aws_vpc.main.id
  target_type = "ip"
  health_check { path = "/api/health/live"
   matcher="200"
   healthy_threshold=2
   unhealthy_threshold=3
   interval=30 }
}
resource "aws_acm_certificate" "origin" {
  domain_name = local.origin_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "origin_validation" {
  for_each = {for d in aws_acm_certificate.origin.domain_validation_options : d.domain_name => {name=d.resource_record_name,record=d.resource_record_value,type=d.resource_record_type}}
  zone_id = data.aws_route53_zone.public.zone_id
  name = each.value.name
  type = each.value.type
  ttl = 60
  records = [each.value.record]
  allow_overwrite = true
}
resource "aws_acm_certificate_validation" "origin" {
  certificate_arn = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port = 443
  protocol = "HTTPS"
  ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn = aws_acm_certificate_validation.origin.certificate_arn
  default_action { type="forward"
   target_group_arn=aws_lb_target_group.api.arn }
}
resource "aws_ecs_service" "api" {
  name = "api"
  cluster = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  launch_type = "FARGATE"
  desired_count = var.api_desired_count
  health_check_grace_period_seconds = 90
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent = 200
  network_configuration { subnets=aws_subnet.public[*].id
   security_groups=[aws_security_group.api.id]
   assign_public_ip=true }
  load_balancer { target_group_arn=aws_lb_target_group.api.arn
   container_name="api"
   container_port=4000 }
  depends_on = [aws_lb_listener.https,aws_iam_role_policy.execution_secrets,aws_iam_role_policy_attachment.execution,aws_secretsmanager_secret_version.jwt]
  lifecycle { ignore_changes = [task_definition] } # releases use deploy.sh
}
resource "aws_route53_record" "origin" { zone_id=data.aws_route53_zone.public.zone_id
   name=local.origin_domain
   type="CNAME"
   ttl=60
   records=[aws_lb.api.dns_name] }

resource "aws_acm_certificate" "viewer" {
  provider = aws.use1
  domain_name = var.domain_name
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "viewer_validation" {
  for_each = {for d in aws_acm_certificate.viewer.domain_validation_options : d.domain_name => {name=d.resource_record_name,record=d.resource_record_value,type=d.resource_record_type}}
  zone_id=data.aws_route53_zone.public.zone_id
  name=each.value.name
  type=each.value.type
  ttl=60
  records=[each.value.record]
  allow_overwrite=true
}
resource "aws_acm_certificate_validation" "viewer" {
  provider=aws.use1
  certificate_arn=aws_acm_certificate.viewer.arn
  validation_record_fqdns=[for r in aws_route53_record.viewer_validation : r.fqdn]
}
resource "aws_cloudfront_origin_access_control" "oac" {
  name = "${local.prefix}-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior = "always"
  signing_protocol = "sigv4"
}
resource "aws_cloudfront_distribution" "web" {
  enabled = true
  is_ipv6_enabled = true
  aliases = [var.domain_name]
  default_root_object = "index.html"
  price_class = "PriceClass_200"
  origin {
    domain_name = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id = "site"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }
  origin {
    domain_name = aws_s3_bucket.images.bucket_regional_domain_name
    origin_id = "images"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }
  origin {
    domain_name = local.origin_domain
    origin_id = "api"
    custom_origin_config { http_port=80
   https_port=443
   origin_protocol_policy="https-only"
   origin_ssl_protocols=["TLSv1.2"]
   origin_read_timeout=60 }
  }
  default_cache_behavior {
    target_origin_id = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods = ["GET","HEAD"]
    cached_methods = ["GET","HEAD"]
    compress = true
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }
  ordered_cache_behavior {
    path_pattern = "/api/*"
    target_origin_id = "api"
    viewer_protocol_policy = "https-only"
    allowed_methods = ["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"]
    cached_methods = ["GET","HEAD"]
    compress = true
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be1f3f" # Managed-CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  }
  ordered_cache_behavior {
    path_pattern = "/questions/*"
    target_origin_id = "images"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods = ["GET","HEAD"]
    cached_methods = ["GET","HEAD"]
    compress = true
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }
  restrictions { geo_restriction { restriction_type="none" } }
  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate_validation.viewer.certificate_arn
    ssl_support_method = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  depends_on = [aws_s3_bucket_public_access_block.site,aws_s3_bucket_public_access_block.images]
}
resource "aws_s3_bucket_policy" "site" {
  bucket=aws_s3_bucket.site.id
  policy=jsonencode({Version="2012-10-17",Statement=[{Sid="CloudFrontGetSite",Effect="Allow",Principal={Service="cloudfront.amazonaws.com"},Action="s3:GetObject",Resource="${aws_s3_bucket.site.arn}/*",Condition={StringEquals={"AWS:SourceArn"=aws_cloudfront_distribution.web.arn}}}]})
}
resource "aws_s3_bucket_policy" "images" {
  bucket=aws_s3_bucket.images.id
  policy=jsonencode({Version="2012-10-17",Statement=[{Sid="CloudFrontGetImages",Effect="Allow",Principal={Service="cloudfront.amazonaws.com"},Action="s3:GetObject",Resource="${aws_s3_bucket.images.arn}/questions/*",Condition={StringEquals={"AWS:SourceArn"=aws_cloudfront_distribution.web.arn}}}]})
}
resource "aws_route53_record" "web_a" {
  zone_id=data.aws_route53_zone.public.zone_id
  name=var.domain_name
  type="A"
  alias { name=aws_cloudfront_distribution.web.domain_name
   zone_id=aws_cloudfront_distribution.web.hosted_zone_id
   evaluate_target_health=false }
}
resource "aws_route53_record" "web_aaaa" {
  zone_id=data.aws_route53_zone.public.zone_id
  name=var.domain_name
  type="AAAA"
  alias { name=aws_cloudfront_distribution.web.domain_name
   zone_id=aws_cloudfront_distribution.web.hosted_zone_id
   evaluate_target_health=false }
}

output "site_url" { value=local.web_url }
output "site_bucket" { value=aws_s3_bucket.site.id }
output "images_bucket" { value=aws_s3_bucket.images.id }
output "ecr_repository_url" { value=aws_ecr_repository.api.repository_url }
output "ecs_cluster" { value=aws_ecs_cluster.main.name }
output "ecs_service" { value=aws_ecs_service.api.name }
output "ecs_task_family" { value=aws_ecs_task_definition.api.family }
output "api_subnets" { value=aws_subnet.public[*].id
   description="Fargate subnets (public, outbound access enabled); DB is private" }
output "api_security_group" { value=aws_security_group.api.id }
output "cloudfront_distribution_id" { value=aws_cloudfront_distribution.web.id }
output "rds_endpoint" { value=aws_db_instance.postgres.endpoint }

output "allow_self_registration" { value=var.allow_self_registration }
