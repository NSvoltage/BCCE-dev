package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrock"
)

type CheckResult struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // pass, fail, warn
	Message string `json:"message"`
	Fix     string `json:"fix,omitempty"`
}

func checkDNS(host string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	_, err := net.DefaultResolver.LookupHost(ctx, host)
	return err
}

func checkHTTPSConnectivity(url string) error {
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 5 * time.Second,
			}).DialContext,
		},
	}
	
	resp, err := client.Head(url)
	if err != nil {
		return err
	}
	resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	
	return nil
}

func checkBedrockAccess(region string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := bedrock.NewFromConfig(cfg)
	
	// Minimal dry-run: list foundation models (read-only operation)
	input := &bedrock.ListFoundationModelsInput{
		ByProvider: aws.String("anthropic"),
	}
	
	result, err := client.ListFoundationModels(ctx, input)
	if err != nil {
		return fmt.Errorf("bedrock API call failed: %w", err)
	}
	
	if len(result.ModelSummaries) == 0 {
		return fmt.Errorf("no Anthropic models available in region %s", region)
	}
	
	return nil
}

func runChecks() []CheckResult {
	var results []CheckResult
	
	// Get region from environment
	region := os.Getenv("AWS_REGION")
	if region == "" {
		results = append(results, CheckResult{
			Name:    "AWS_REGION",
			Status:  "fail",
			Message: "AWS_REGION environment variable not set",
			Fix:     "export AWS_REGION=us-east-1 (or your preferred region)",
		})
		return results // Can't continue without region
	}
	
	results = append(results, CheckResult{
		Name:    "AWS_REGION",
		Status:  "pass",
		Message: fmt.Sprintf("Set to: %s", region),
	})
	
	// DNS resolution checks
	endpoints := []struct {
		name string
		host string
	}{
		{"Bedrock Runtime", fmt.Sprintf("bedrock-runtime.%s.amazonaws.com", region)},
		{"Bedrock Control", fmt.Sprintf("bedrock.%s.amazonaws.com", region)},
		{"STS", fmt.Sprintf("sts.%s.amazonaws.com", region)},
	}
	
	for _, endpoint := range endpoints {
		if err := checkDNS(endpoint.host); err != nil {
			results = append(results, CheckResult{
				Name:    fmt.Sprintf("DNS - %s", endpoint.name),
				Status:  "fail", 
				Message: fmt.Sprintf("Failed to resolve %s: %v", endpoint.host, err),
				Fix:     "Check internet connectivity and DNS settings",
			})
		} else {
			results = append(results, CheckResult{
				Name:    fmt.Sprintf("DNS - %s", endpoint.name),
				Status:  "pass",
				Message: fmt.Sprintf("Resolved %s", endpoint.host),
			})
		}
	}
	
	// HTTPS connectivity check
	bedrockURL := fmt.Sprintf("https://bedrock-runtime.%s.amazonaws.com", region)
	if err := checkHTTPSConnectivity(bedrockURL); err != nil {
		results = append(results, CheckResult{
			Name:    "HTTPS Connectivity",
			Status:  "fail",
			Message: fmt.Sprintf("Failed to connect to %s: %v", bedrockURL, err),
			Fix:     "Check firewall, proxy settings, or VPC endpoint configuration",
		})
	} else {
		results = append(results, CheckResult{
			Name:    "HTTPS Connectivity", 
			Status:  "pass",
			Message: fmt.Sprintf("Successfully connected to %s", bedrockURL),
		})
	}
	
	// PrivateLink endpoint check (if VPC endpoint is configured)
	if strings.Contains(os.Getenv("AWS_BEDROCK_ENDPOINT_URL"), "vpce-") {
		results = append(results, CheckResult{
			Name:    "PrivateLink VPC Endpoint",
			Status:  "pass",
			Message: "VPC endpoint configuration detected",
		})
	}
	
	// Bedrock API access check
	if err := checkBedrockAccess(region); err != nil {
		status := "fail"
		fix := "Check AWS credentials and IAM permissions for bedrock:ListFoundationModels"
		
		// Provide more specific guidance based on error type
		errMsg := err.Error()
		if strings.Contains(errMsg, "UnauthorizedOperation") || strings.Contains(errMsg, "AccessDenied") {
			fix = "Add bedrock:ListFoundationModels permission to your IAM role/user"
		} else if strings.Contains(errMsg, "no models available") {
			status = "warn"
			fix = "Request access to Anthropic models in AWS Bedrock console"
		}
		
		results = append(results, CheckResult{
			Name:    "Bedrock API Access",
			Status:  status,
			Message: errMsg,
			Fix:     fix,
		})
	} else {
		results = append(results, CheckResult{
			Name:    "Bedrock API Access",
			Status:  "pass", 
			Message: fmt.Sprintf("Successfully accessed Bedrock API in %s", region),
		})
	}
	
	return results
}

func main() {
	results := runChecks()
	
	hasFailures := false
	hasWarnings := false
	
	fmt.Println("🩺 BCCE Doctor Probes Report")
	fmt.Println()
	
	for _, result := range results {
		icon := "✅"
		switch result.Status {
		case "warn":
			icon = "⚠️"
			hasWarnings = true
		case "fail":
			icon = "❌"
			hasFailures = true
		}
		
		fmt.Printf("%s %s: %s\n", icon, result.Name, result.Message)
		if result.Fix != "" {
			fmt.Printf("   Fix: %s\n", result.Fix)
		}
	}
	
	fmt.Println()
	
	if hasFailures {
		fmt.Println("❌ Critical connectivity issues detected")
		os.Exit(1)
	} else if hasWarnings {
		fmt.Println("⚠️  Some warnings detected")
		os.Exit(2)
	} else {
		fmt.Println("✅ All connectivity checks passed")
		os.Exit(0)
	}
}