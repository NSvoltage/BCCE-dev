#!/usr/bin/env python3
"""
Create a simple ASCII animation demo for BCCE
"""

import time
import os

def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

def demo_animation():
    frames = [
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany",
                "Region: us-east-1",
                "Environment: production",
                "",
                "[ ] Validate environment",
                "[ ] Create Cognito User Pool", 
                "[ ] Setup IAM roles",
                "[ ] Create S3 analytics bucket",
                "[ ] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany", 
                "Region: us-east-1",
                "Environment: production",
                "",
                "[✅] Validate environment",
                "[ ] Create Cognito User Pool",
                "[ ] Setup IAM roles", 
                "[ ] Create S3 analytics bucket",
                "[ ] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany",
                "Region: us-east-1", 
                "Environment: production",
                "",
                "[✅] Validate environment",
                "[✅] Create Cognito User Pool",
                "[ ] Setup IAM roles",
                "[ ] Create S3 analytics bucket",
                "[ ] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo", 
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany",
                "Region: us-east-1",
                "Environment: production",
                "",
                "[✅] Validate environment",
                "[✅] Create Cognito User Pool", 
                "[✅] Setup IAM roles",
                "[ ] Create S3 analytics bucket",
                "[ ] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany",
                "Region: us-east-1",
                "Environment: production", 
                "",
                "[✅] Validate environment",
                "[✅] Create Cognito User Pool",
                "[✅] Setup IAM roles",
                "[✅] Create S3 analytics bucket",
                "[ ] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🚀 Starting deployment...",
                "",
                "Organization: YourCompany",
                "Region: us-east-1",
                "Environment: production",
                "",
                "[✅] Validate environment", 
                "[✅] Create Cognito User Pool",
                "[✅] Setup IAM roles",
                "[✅] Create S3 analytics bucket",
                "[✅] Configure budgets"
            ]
        },
        {
            "title": "BCCE Enterprise Deployment Demo",
            "content": [
                "🎉 Deployment completed successfully!",
                "",
                "Resources created:",
                "✅ Cognito User Pool: bcce-yourcompany-pool",
                "✅ IAM Roles: Engineering, DataScience, Product",
                "✅ S3 Bucket: bcce-analytics-12345",
                "✅ Department Budgets: $500-$1000/month",
                "",
                "Next steps:",
                "1. Configure identity provider", 
                "2. Onboard developers",
                "3. Access dashboard at localhost:8081"
            ]
        }
    ]
    
    print("BCCE Demo Animation")
    print("===================")
    print("(This will show a deployment simulation)")
    print("")
    input("Press Enter to start...")
    
    for i, frame in enumerate(frames):
        clear_screen()
        print("=" * 50)
        print(f" {frame['title']}")
        print("=" * 50)
        print()
        
        for line in frame['content']:
            print(f"  {line}")
        
        print()
        print(f"Frame {i+1}/{len(frames)}")
        
        if i < len(frames) - 1:
            time.sleep(2)
        else:
            print()
            print("Demo complete! 🎉")

if __name__ == "__main__":
    demo_animation()