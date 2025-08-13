package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"time"
)

type CheckResult struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // pass, fail, warn
	Message string `json:"message"`
	Fix     string `json:"fix,omitempty"`
}

type ProbeOutput struct {
	Checks []CheckResult `json:"checks"`
}

func checkDNS(host string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	_, err := net.DefaultResolver.LookupHost(ctx, host)
	return err
}

func runDNSChecks(region string) []CheckResult {
	var results []CheckResult
	
	// DNS resolution check for Bedrock endpoint
	bedrockHost := fmt.Sprintf("bedrock-runtime.%s.amazonaws.com", region)
	if err := checkDNS(bedrockHost); err != nil {
		results = append(results, CheckResult{
			Name:    "DNS - Bedrock Runtime",
			Status:  "fail",
			Message: fmt.Sprintf("Failed to resolve %s: %v", bedrockHost, err),
			Fix:     "Check internet connectivity and DNS settings",
		})
	} else {
		results = append(results, CheckResult{
			Name:    "DNS - Bedrock Runtime",
			Status:  "pass",
			Message: fmt.Sprintf("Resolved %s", bedrockHost),
		})
	}
	
	return results
}

func main() {
	var jsonOutput = flag.Bool("json", false, "Output results as JSON")
	var dnsOnly = flag.Bool("dns-only", false, "Run only DNS resolution checks")
	flag.Parse()

	// Get region from environment
	region := os.Getenv("AWS_REGION")
	if region == "" {
		if *jsonOutput {
			output := ProbeOutput{
				Checks: []CheckResult{{
					Name:    "AWS_REGION",
					Status:  "fail",
					Message: "AWS_REGION environment variable not set",
					Fix:     "export AWS_REGION=us-east-1",
				}},
			}
			json.NewEncoder(os.Stdout).Encode(output)
		} else {
			fmt.Println("❌ AWS_REGION not set")
		}
		os.Exit(1)
	}

	// Run DNS-only checks for fail-closed operation
	results := runDNSChecks(region)

	if *jsonOutput {
		output := ProbeOutput{Checks: results}
		json.NewEncoder(os.Stdout).Encode(output)
		return
	}

	// Human-readable output
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
		fmt.Println("❌ DNS resolution issues detected")
		os.Exit(1)
	} else if hasWarnings {
		fmt.Println("⚠️  Some warnings detected")
		os.Exit(2)
	} else {
		fmt.Println("✅ All DNS checks passed")
		os.Exit(0)
	}
}