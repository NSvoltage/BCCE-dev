# BCCE + AWS Solutions Library Integration Infrastructure
# Extends AWS Solutions Library with BCCE governance capabilities

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_solutions_library_deployed" {
  description = "Whether AWS Solutions Library infrastructure is already deployed"
  type        = bool
  default     = false
}

variable "cognito_user_pool_name" {
  description = "Name of the Cognito User Pool from AWS Solutions Library"
  type        = string
  default     = "claude-code-user-pool"
}

variable "organization_name" {
  description = "Organization name for resource naming"
  type        = string
}

variable "departments" {
  description = "Department configuration for BCCE governance"
  type = map(object({
    budget_limit = number
    access_tiers = list(string)
    manager_email = string
  }))
  default = {
    engineering = {
      budget_limit = 10000
      access_tiers = ["sandbox", "integration", "production"]
      manager_email = "engineering-manager@company.com"
    }
    product = {
      budget_limit = 5000
      access_tiers = ["sandbox", "integration"]
      manager_email = "product-manager@company.com"
    }
    data_science = {
      budget_limit = 15000
      access_tiers = ["sandbox", "integration", "production"]
      manager_email = "data-science-manager@company.com"
    }
  }
}

# Data sources for existing AWS Solutions Library resources
data "aws_cognito_user_pools" "claude_code_pools" {
  count = var.aws_solutions_library_deployed ? 1 : 0
  name  = var.cognito_user_pool_name
}

data "aws_cognito_user_pool" "claude_code_pool" {
  count         = var.aws_solutions_library_deployed ? 1 : 0
  user_pool_id  = data.aws_cognito_user_pools.claude_code_pools[0].ids[0]
}

# If Solutions Library not deployed, create minimal Cognito setup for testing
resource "aws_cognito_user_pool" "claude_code_pool_minimal" {
  count = var.aws_solutions_library_deployed ? 0 : 1
  name  = var.cognito_user_pool_name

  alias_attributes = ["email"]
  
  # Basic configuration that matches Solutions Library pattern
  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = false
  }

  tags = {
    Purpose = "BCCE-Testing-Minimal-Setup"
    Source  = "Local-Creation"
  }
}

# Local values for unified resource references
locals {
  user_pool_id = var.aws_solutions_library_deployed ? data.aws_cognito_user_pool.claude_code_pool[0].id : aws_cognito_user_pool.claude_code_pool_minimal[0].id
  user_pool_arn = var.aws_solutions_library_deployed ? data.aws_cognito_user_pool.claude_code_pool[0].arn : aws_cognito_user_pool.claude_code_pool_minimal[0].arn
}

# BCCE-specific Cognito User Pool Schema Extensions
resource "aws_cognito_user_pool_schema" "department" {
  name           = "department"
  user_pool_id   = local.user_pool_id
  attribute_data_type = "String"
  required       = false
  mutable        = true

  string_attribute_constraints {
    min_length = 1
    max_length = 50
  }
}

resource "aws_cognito_user_pool_schema" "access_tier" {
  name           = "access_tier"
  user_pool_id   = local.user_pool_id
  attribute_data_type = "String"
  required       = false
  mutable        = true

  string_attribute_constraints {
    min_length = 1
    max_length = 20
  }
}

resource "aws_cognito_user_pool_schema" "budget_limit" {
  name           = "budget_limit"
  user_pool_id   = local.user_pool_id
  attribute_data_type = "Number"
  required       = false
  mutable        = true

  number_attribute_constraints {
    min_value = 0
    max_value = 100000
  }
}

resource "aws_cognito_user_pool_schema" "manager_email" {
  name           = "manager_email"
  user_pool_id   = local.user_pool_id
  attribute_data_type = "String"
  required       = false
  mutable        = true

  string_attribute_constraints {
    min_length = 5
    max_length = 100
  }
}

# Cognito Groups for Department Access Management
resource "aws_cognito_user_pool_group" "department_groups" {
  for_each = var.departments

  name         = each.key
  user_pool_id = local.user_pool_id
  description  = "BCCE ${title(each.key)} Department Group"
  precedence   = 10

  role_arn = aws_iam_role.bcce_department_role[each.key].arn
}

# Enhanced IAM Roles for Department Access
resource "aws_iam_role" "bcce_department_role" {
  for_each = var.departments

  name = "BCCE-${title(each.key)}-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = local.user_pool_id
          }
          "ForAllValues:StringEquals" = {
            "cognito:groups" = [each.key]
          }
        }
      }
    ]
  })

  tags = {
    Department = each.key
    Purpose    = "BCCE-Department-Access"
    ManagedBy  = "Terraform"
  }
}

# IAM Policies for Department Roles
resource "aws_iam_role_policy" "bcce_department_policy" {
  for_each = var.departments

  name = "BCCE-${title(each.key)}-Policy"
  role = aws_iam_role.bcce_department_role[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BCCEBedrockAccess"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels",
          "bedrock:GetFoundationModel"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = ["us-east-1", "us-west-2"]
          }
        }
      },
      {
        Sid    = "BCCEAnalyticsAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.bcce_analytics.arn,
          "${aws_s3_bucket.bcce_analytics.arn}/*"
        ]
      },
      {
        Sid    = "BCCEMonitoringAccess"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "aws:RequestTag/Department" = [each.key]
          }
        }
      },
      {
        Sid    = "BCCEBudgetRead"
        Effect = "Allow"
        Action = [
          "budgets:ViewBudget",
          "budgets:DescribeBudget"
        ]
        Resource = "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/BCCE-${title(each.key)}-*"
      }
    ]
  })
}

# BCCE Analytics S3 Bucket
resource "aws_s3_bucket" "bcce_analytics" {
  bucket = "bcce-analytics-${var.organization_name}-${random_string.suffix.result}"

  tags = {
    Purpose       = "BCCE-Analytics-Data"
    IntegratedWith = "AWS-Solutions-Library"
    ManagedBy     = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "bcce_analytics" {
  bucket = aws_s3_bucket.bcce_analytics.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "bcce_analytics" {
  bucket = aws_s3_bucket.bcce_analytics.id

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.bcce_analytics.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }
}

# KMS Key for BCCE Analytics Encryption
resource "aws_kms_key" "bcce_analytics" {
  description             = "BCCE Analytics encryption key"
  deletion_window_in_days = 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableIAMUserPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowBCCEDepartmentAccess"
        Effect = "Allow"
        Principal = {
          AWS = [
            for role in aws_iam_role.bcce_department_role : role.arn
          ]
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Purpose   = "BCCE-Analytics-Encryption"
    ManagedBy = "Terraform"
  }
}

resource "aws_kms_alias" "bcce_analytics" {
  name          = "alias/bcce-analytics-${var.organization_name}"
  target_key_id = aws_kms_key.bcce_analytics.key_id
}

# Enhanced Budgets with BCCE Integration
resource "aws_budgets_budget" "bcce_department_budgets" {
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

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock", "Amazon S3", "Amazon CloudWatch"]
  }

  # 80% threshold notification
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = [each.value.manager_email]
  }

  # 100% threshold notification
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [
      each.value.manager_email,
      "finance@${lower(var.organization_name)}.com"
    ]
  }

  # Forecast notification at 120%
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 120
    threshold_type            = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [
      each.value.manager_email,
      "cfo@${lower(var.organization_name)}.com"
    ]
  }

  tags = {
    Department = each.key
    Purpose    = "BCCE-Cost-Management"
    ManagedBy  = "Terraform"
  }
}

# CloudWatch Dashboard for BCCE Analytics
resource "aws_cloudwatch_dashboard" "bcce_unified_dashboard" {
  dashboard_name = "BCCE-Unified-Analytics"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/Bedrock", "InvocationsCount"],
            ["AWS/S3", "NumberOfObjects"],
            ["AWS/Budgets", "ActualCost"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          title   = "BCCE Usage Overview"
          period  = 300
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 24
        height = 6

        properties = {
          query   = "SOURCE '/aws/lambda/bcce-analytics'\n| fields @timestamp, department, access_tier, cost\n| filter department != \"\"\n| stats sum(cost) by department"
          region  = "us-east-1"
          title   = "Cost by Department"
          view    = "table"
        }
      }
    ]
  })
}

# Lambda Function for BCCE Analytics Processing
resource "aws_lambda_function" "bcce_analytics_processor" {
  filename         = "bcce-analytics-processor.zip"
  function_name    = "bcce-analytics-processor"
  role            = aws_iam_role.bcce_analytics_lambda_role.arn
  handler         = "index.handler"
  runtime         = "python3.11"
  timeout         = 300

  environment {
    variables = {
      ANALYTICS_BUCKET = aws_s3_bucket.bcce_analytics.bucket
      KMS_KEY_ID       = aws_kms_key.bcce_analytics.key_id
      ORGANIZATION     = var.organization_name
    }
  }

  tags = {
    Purpose   = "BCCE-Analytics-Processing"
    ManagedBy = "Terraform"
  }
}

# IAM Role for Analytics Lambda
resource "aws_iam_role" "bcce_analytics_lambda_role" {
  name = "BCCE-Analytics-Lambda-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Purpose   = "BCCE-Analytics-Lambda"
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_role_policy" "bcce_analytics_lambda_policy" {
  name = "BCCE-Analytics-Lambda-Policy"
  role = aws_iam_role.bcce_analytics_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.bcce_analytics.arn,
          "${aws_s3_bucket.bcce_analytics.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.bcce_analytics.arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:ListFoundationModels",
          "cloudwatch:GetMetricStatistics"
        ]
        Resource = "*"
      }
    ]
  })
}

# Random string for unique naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Outputs for integration
output "cognito_integration" {
  description = "Cognito User Pool integration details"
  value = {
    user_pool_id  = local.user_pool_id
    user_pool_arn = local.user_pool_arn
    department_groups = {
      for k, v in aws_cognito_user_pool_group.department_groups : k => v.name
    }
    custom_attributes = [
      "department",
      "access_tier", 
      "budget_limit",
      "manager_email"
    ]
  }
}

output "bcce_governance_resources" {
  description = "BCCE governance resources created"
  value = {
    analytics_bucket = aws_s3_bucket.bcce_analytics.bucket
    kms_key_id      = aws_kms_key.bcce_analytics.key_id
    department_roles = {
      for k, v in aws_iam_role.bcce_department_role : k => v.arn
    }
    budget_names = {
      for k, v in aws_budgets_budget.bcce_department_budgets : k => v.name
    }
    dashboard_name = aws_cloudwatch_dashboard.bcce_unified_dashboard.dashboard_name
  }
}

output "integration_status" {
  description = "Integration status and next steps"
  value = {
    status = "Phase 1 Complete - Foundation Extended"
    aws_solutions_library_integrated = var.aws_solutions_library_deployed
    bcce_governance_enabled = true
    next_phase = "Deploy unified onboarding workflow"
    ready_for_testing = true
  }
}