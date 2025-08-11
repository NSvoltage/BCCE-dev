package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentity"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// AWS credential_process output format
type CredentialsOutput struct {
	Version         int    `json:"Version"`
	AccessKeyId     string `json:"AccessKeyId"`
	SecretAccessKey string `json:"SecretAccessKey"`
	SessionToken    string `json:"SessionToken"`
	Expiration      string `json:"Expiration"`
}

// Configuration from environment
type Config struct {
	Region         string
	IdentityPoolID string
	OIDCToken      string
	RoleArn        string
}

func loadConfig() (*Config, error) {
	cfg := &Config{
		Region:         os.Getenv("AWS_REGION"),
		IdentityPoolID: os.Getenv("COGNITO_IDENTITY_POOL_ID"),
		OIDCToken:      os.Getenv("OIDC_ID_TOKEN"),
		RoleArn:        os.Getenv("BCCE_ROLE_ARN"),
	}

	if cfg.Region == "" {
		return nil, fmt.Errorf("AWS_REGION environment variable is required")
	}
	if cfg.IdentityPoolID == "" {
		return nil, fmt.Errorf("COGNITO_IDENTITY_POOL_ID environment variable is required")
	}
	if cfg.OIDCToken == "" {
		return nil, fmt.Errorf("OIDC_ID_TOKEN environment variable is required")
	}

	return cfg, nil
}

func exchangeToken(ctx context.Context, cfg *Config) (*CredentialsOutput, error) {
	// Load AWS config
	awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(cfg.Region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create Cognito Identity client
	cognitoClient := cognitoidentity.NewFromConfig(awsCfg)

	// Get Identity ID from Cognito Identity Pool using OIDC token
	getIdInput := &cognitoidentity.GetIdInput{
		IdentityPoolId: aws.String(cfg.IdentityPoolID),
		Logins: map[string]string{
			// This key depends on your OIDC provider configuration
			"accounts.google.com": cfg.OIDCToken, // Example for Google
		},
	}

	getIdOutput, err := cognitoClient.GetId(ctx, getIdInput)
	if err != nil {
		return nil, fmt.Errorf("failed to get identity ID: %w", err)
	}

	// Get credentials for the identity
	getCredsInput := &cognitoidentity.GetCredentialsForIdentityInput{
		IdentityId: getIdOutput.IdentityId,
		Logins: map[string]string{
			"accounts.google.com": cfg.OIDCToken,
		},
	}

	if cfg.RoleArn != "" {
		// If specific role is required, use STS AssumeRoleWithWebIdentity instead
		stsClient := sts.NewFromConfig(awsCfg)
		
		assumeRoleInput := &sts.AssumeRoleWithWebIdentityInput{
			RoleArn:          aws.String(cfg.RoleArn),
			RoleSessionName:  aws.String("bcce-session"),
			WebIdentityToken: aws.String(cfg.OIDCToken),
			DurationSeconds:  aws.Int32(3600), // 1 hour
		}

		assumeRoleOutput, err := stsClient.AssumeRoleWithWebIdentity(ctx, assumeRoleInput)
		if err != nil {
			return nil, fmt.Errorf("failed to assume role: %w", err)
		}

		return &CredentialsOutput{
			Version:         1,
			AccessKeyId:     *assumeRoleOutput.Credentials.AccessKeyId,
			SecretAccessKey: *assumeRoleOutput.Credentials.SecretAccessKey,
			SessionToken:    *assumeRoleOutput.Credentials.SessionToken,
			Expiration:      assumeRoleOutput.Credentials.Expiration.Format(time.RFC3339),
		}, nil
	}

	// Use Cognito Identity credentials
	getCredsOutput, err := cognitoClient.GetCredentialsForIdentity(ctx, getCredsInput)
	if err != nil {
		return nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	return &CredentialsOutput{
		Version:         1,
		AccessKeyId:     *getCredsOutput.Credentials.AccessKeyId,
		SecretAccessKey: *getCredsOutput.Credentials.SecretKey,
		SessionToken:    *getCredsOutput.Credentials.SessionToken,
		Expiration:      getCredsOutput.Credentials.Expiration.Format(time.RFC3339),
	}, nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Load configuration
	cfg, err := loadConfig()
	if err != nil {
		log.Printf("Configuration error: %v", err)
		// Return empty credentials to satisfy AWS credential_process contract
		emptyCreds := &CredentialsOutput{Version: 1}
		json.NewEncoder(os.Stdout).Encode(emptyCreds)
		os.Exit(1)
	}

	// Exchange OIDC token for AWS credentials
	creds, err := exchangeToken(ctx, cfg)
	if err != nil {
		log.Printf("Token exchange failed: %v", err)
		// Return empty credentials to satisfy AWS credential_process contract
		emptyCreds := &CredentialsOutput{Version: 1}
		json.NewEncoder(os.Stdout).Encode(emptyCreds)
		os.Exit(1)
	}

	// Output credentials in AWS credential_process format
	if err := json.NewEncoder(os.Stdout).Encode(creds); err != nil {
		log.Printf("JSON encoding failed: %v", err)
		os.Exit(1)
	}
}