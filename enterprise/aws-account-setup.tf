# BCCE Enterprise AWS Account Setup
# Terraform configuration for multi-account enterprise deployment

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Variables for enterprise configuration
variable "organization_name" {
  description = "Name of the organization"
  type        = string
}

variable "departments" {
  description = "List of departments requiring BCCE access"
  type = map(object({
    budget_limit = number
    environments = list(string)
    tier_default = string
  }))
  default = {
    engineering = {
      budget_limit = 10000
      environments = ["dev", "staging", "prod"]
      tier_default = "integration"
    }
    product = {
      budget_limit = 5000
      environments = ["dev", "staging"]
      tier_default = "sandbox"
    }
    data_science = {
      budget_limit = 15000
      environments = ["dev", "staging", "prod"]
      tier_default = "integration"
    }
  }
}

variable "compliance_frameworks" {
  description = "Required compliance frameworks"
  type        = list(string)
  default     = ["soc2"]
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# AWS Organizations setup
resource "aws_organizations_organization" "bcce_org" {
  aws_service_access_principals = [
    "cloudtrail.amazonaws.com",
    "config.amazonaws.com",
    "sso.amazonaws.com",
    "budgets.amazonaws.com",
    "tag-policies.amazonaws.com"
  ]

  feature_set = "ALL"

  enabled_policy_types = [
    "SERVICE_CONTROL_POLICY",
    "TAG_POLICY",
    "BACKUP_POLICY"
  ]

  tags = {
    Purpose = "BCCE-Enterprise-Governance"
    ManagedBy = "Terraform"
  }
}

# Organizational Units
resource "aws_organizations_organizational_unit" "security" {
  name      = "Security"
  parent_id = aws_organizations_organization.bcce_org.roots[0].id

  tags = {
    Purpose = "Security-and-Compliance"
  }
}

resource "aws_organizations_organizational_unit" "workloads" {
  name      = "Workloads"
  parent_id = aws_organizations_organization.bcce_org.roots[0].id

  tags = {
    Purpose = "BCCE-Workload-Accounts"
  }
}

# Security account for centralized logging
resource "aws_organizations_account" "security" {
  name                       = "${var.organization_name}-Security"
  email                      = "bcce-security@${lower(var.organization_name)}.com"
  iam_user_access_to_billing = "DENY"
  parent_id                  = aws_organizations_organizational_unit.security.id

  tags = {
    Purpose = "Security-Logging-Compliance"
    AccountType = "Security"
  }
}

# Development account
resource "aws_organizations_account" "development" {
  name                       = "${var.organization_name}-BCCE-Development"
  email                      = "bcce-dev@${lower(var.organization_name)}.com"
  iam_user_access_to_billing = "DENY"
  parent_id                  = aws_organizations_organizational_unit.workloads.id

  tags = {
    Purpose = "BCCE-Development"
    Environment = "dev"
    AccountType = "Workload"
  }
}

# Staging account
resource "aws_organizations_account" "staging" {
  name                       = "${var.organization_name}-BCCE-Staging"
  email                      = "bcce-staging@${lower(var.organization_name)}.com"
  iam_user_access_to_billing = "DENY"
  parent_id                  = aws_organizations_organizational_unit.workloads.id

  tags = {
    Purpose = "BCCE-Staging"
    Environment = "staging"
    AccountType = "Workload"
  }
}

# Production account
resource "aws_organizations_account" "production" {
  name                       = "${var.organization_name}-BCCE-Production"
  email                      = "bcce-prod@${lower(var.organization_name)}.com"
  iam_user_access_to_billing = "DENY"
  parent_id                  = aws_organizations_organizational_unit.workloads.id

  tags = {
    Purpose = "BCCE-Production"
    Environment = "prod"
    AccountType = "Workload"
  }
}

# Service Control Policy for development accounts
resource "aws_organizations_policy" "bcce_development_scp" {
  name        = "BCCE-Development-Restrictions"
  description = "Restrict expensive services and enforce best practices in development"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBCCEServices"
        Effect = "Allow"
        Action = [
          "bedrock:*",
          "s3:*",
          "cloudwatch:*",
          "logs:*",
          "sts:GetCallerIdentity",
          "sts:AssumeRole",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "DenyExpensiveEC2Instances"
        Effect = "Deny"
        Action = [
          "ec2:RunInstances"
        ]
        Resource = "arn:aws:ec2:*:*:instance/*"
        Condition = {
          ForAnyValue:StringNotEquals = {
            "ec2:InstanceType" = [
              "t3.micro",
              "t3.small",
              "t3.medium",
              "t4g.micro",
              "t4g.small"
            ]
          }
        }
      },
      {
        Sid    = "DenyExpensiveBedrockModels"
        Effect = "Deny"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-opus*",
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-instant-v1*"
        ]
      },
      {
        Sid    = "RequireResourceTagging"
        Effect = "Deny"
        Action = [
          "ec2:RunInstances",
          "s3:CreateBucket",
          "rds:CreateDBInstance"
        ]
        Resource = "*"
        Condition = {
          "Null" = {
            "aws:RequestedRegion" = "false"
          }
          ForAllValues:StringNotEquals = {
            "aws:TagKeys" = ["Department", "Owner", "Purpose"]
          }
        }
      }
    ]
  })
}

# Attach SCP to development account
resource "aws_organizations_policy_attachment" "development_scp" {
  policy_id = aws_organizations_policy.bcce_development_scp.id
  target_id = aws_organizations_account.development.id
}

# Service Control Policy for production accounts
resource "aws_organizations_policy" "bcce_production_scp" {
  name        = "BCCE-Production-Controls"
  description = "Strict controls for production environment"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBCCEServices"
        Effect = "Allow"
        Action = [
          "bedrock:*",
          "s3:*",
          "cloudwatch:*",
          "logs:*",
          "sts:GetCallerIdentity",
          "sts:AssumeRole",
          "kms:*"
        ]
        Resource = "*"
      },
      {
        Sid    = "DenyDangerousActions"
        Effect = "Deny"
        Action = [
          "iam:DeleteRole",
          "iam:DeleteUser",
          "iam:DeletePolicy",
          "s3:DeleteBucket",
          "kms:DeleteKey",
          "cloudtrail:DeleteTrail",
          "cloudtrail:StopLogging"
        ]
        Resource = "*"
      },
      {
        Sid    = "RequireEncryptionInTransit"
        Effect = "Deny"
        Action = "*"
        Resource = "*"
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Attach SCP to production account
resource "aws_organizations_policy_attachment" "production_scp" {
  policy_id = aws_organizations_policy.bcce_production_scp.id
  target_id = aws_organizations_account.production.id
}

# CloudTrail for organization-wide logging
resource "aws_cloudtrail" "organization_trail" {
  provider = aws.security-account

  name                          = "BCCE-Organization-Trail"
  s3_bucket_name               = aws_s3_bucket.cloudtrail_logs.bucket
  s3_key_prefix                = "cloudtrail-logs"
  include_global_service_events = true
  is_multi_region_trail        = true
  enable_log_file_validation    = true
  is_organization_trail         = true

  event_selector {
    read_write_type                 = "All"
    include_management_events       = true

    data_resource {
      type   = "AWS::Bedrock::*"
      values = ["arn:aws:bedrock:*"]
    }

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::bcce-*/*"]
    }
  }

  tags = {
    Purpose = "BCCE-Enterprise-Audit"
    ManagedBy = "Terraform"
  }
}

# S3 bucket for CloudTrail logs
resource "aws_s3_bucket" "cloudtrail_logs" {
  provider = aws.security-account
  
  bucket        = "bcce-${var.organization_name}-cloudtrail-logs-${random_string.bucket_suffix.result}"
  force_destroy = false

  tags = {
    Purpose = "CloudTrail-Logs"
    ManagedBy = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  provider = aws.security-account
  
  bucket = aws_s3_bucket.cloudtrail_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "cloudtrail_logs" {
  provider = aws.security-account
  
  bucket = aws_s3_bucket.cloudtrail_logs.id

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# Random string for unique bucket naming
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# Cost budgets for each department
resource "aws_budgets_budget" "department_budgets" {
  for_each = var.departments

  account_id   = data.aws_caller_identity.current.account_id
  name         = "BCCE-${title(each.key)}-Department"
  budget_type  = "COST"
  limit_amount = tostring(each.value.budget_limit)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKey"
    values = ["Department"]
  }

  cost_filter {
    name   = "TagValue"
    values = [each.key]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["finance@${lower(var.organization_name)}.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["cfo@${lower(var.organization_name)}.com"]
  }

  tags = {
    Department = each.key
    ManagedBy  = "Terraform"
  }
}

# Outputs
output "organization_details" {
  description = "Details of the created AWS Organization"
  value = {
    organization_id  = aws_organizations_organization.bcce_org.id
    organization_arn = aws_organizations_organization.bcce_org.arn
    security_account_id = aws_organizations_account.security.id
    development_account_id = aws_organizations_account.development.id
    staging_account_id = aws_organizations_account.staging.id
    production_account_id = aws_organizations_account.production.id
  }
}

output "cloudtrail_details" {
  description = "CloudTrail configuration details"
  value = {
    trail_name = aws_cloudtrail.organization_trail.name
    trail_arn  = aws_cloudtrail.organization_trail.arn
    s3_bucket  = aws_s3_bucket.cloudtrail_logs.bucket
  }
}

output "budget_names" {
  description = "Created budget names for departments"
  value = {
    for k, v in aws_budgets_budget.department_budgets : k => v.name
  }
}

# Provider aliases for cross-account resources
provider "aws" {
  alias = "security-account"
  assume_role {
    role_arn = "arn:aws:iam::${aws_organizations_account.security.id}:role/OrganizationAccountAccessRole"
  }
}