#!/usr/bin/env python3
"""
n8n Social Media Automation Interface
Manages n8n workflows for social media posting.
"""

import os
import sys
import json
import requests
import argparse
from datetime import datetime
from pathlib import Path

# Configuration
N8N_URL = os.environ.get("N8N_URL", "http://localhost:5678")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")

POSTS_DIR = Path("/home/workspace/Skills/social-content/posts")
WORKFLOW_DIR = Path("/home/workspace/Skills/social-content/n8n-workflows")


class N8NClient:
    """Simple client for n8n REST API."""
    
    def __init__(self, base_url=N8N_URL, api_key=N8N_API_KEY):
        self.base_url = base_url
        self.api_key = api_key
        self.session = requests.Session()
        if api_key:
            self.session.headers.update({"X-N8N-API-KEY": api_key})
    
    def import_workflow(self, workflow_file: str) -> dict:
        """Import a workflow JSON into n8n."""
        with open(workflow_file, 'r') as f:
            workflow_data = json.load(f)
        
        url = f"{self.base_url}/rest/workflows/import"
        response = self.session.post(url, json=workflow_data)
        
        if response.status_code == 201:
            print(f"✅ Workflow imported: {workflow_data.get('name')}")
            return response.json()
        else:
            print(f"❌ Failed to import workflow: {response.status_code}")
            print(response.text)
            return None
    
    def list_workflows(self) -> list:
        """List all workflows in n8n."""
        url = f"{self.base_url}/rest/workflows"
        response = self.session.get(url)
        
        if response.status_code == 200:
            return response.json().get('data', [])
        return []
    
    def trigger_workflow(self, workflow_id: str, data: dict = None) -> dict:
        """Execute a workflow by ID."""
        url = f"{self.base_url}/rest/workflows/{workflow_id}/execute"
        
        if data:
            response = self.session.post(url, json={"data": data})
        else:
            response = self.session.post(url)
        
        if response.status_code == 200 or response.status_code == 201:
            print(f"✅ Workflow {workflow_id} triggered")
            return response.json()
        else:
            print(f"❌ Failed to trigger workflow: {response.status_code}")
            print(response.text)
            return None


def import_main_workflow():
    """Import the main social media automation workflow."""
    workflow_file = WORKFLOW_DIR / "linkedin-x-social-automation.json"
    
    if not workflow_file.exists():
        print(f"❌ Workflow file not found: {workflow_file}")
        return False
    
    client = N8NClient()
    result = client.import_workflow(str(workflow_file))
    
    if result:
        workflow_id = result.get('id')
        print(f"Workflow ID: {workflow_id}")
        print(f"n8n Dashboard: {N8N_URL}")
        return True
    return False


def get_ready_posts() -> list:
    """Get posts that are ready to be published."""
    posts = []
    
    for post_file in sorted(POSTS_DIR.glob("*.md")):
        if post_file.name == ".gitkeep":
            continue
        
        with open(post_file, 'r') as f:
            content = f.read()
        
        # Extract frontmatter
        import yaml
        frontmatter_match = content.split('---')[1]
        
        try:
            metadata = yaml.safe_load(frontmatter_match)
            
            # Check if scheduled for today and not yet published
            scheduled_date = metadata.get('scheduled_date')
            published_date = metadata.get('published_date')
            status = metadata.get('status')
            
            if scheduled_date and status == 'draft':
                scheduled_dt = datetime.strptime(scheduled_date, '%Y-%m-%d')
                today = datetime.now().date()
                
                # Check if scheduled for today or past
                if scheduled_dt <= today and not published_date:
                    posts.append({
                        'file': str(post_file),
                        'metadata': metadata
                    })
        except Exception as e:
            print(f"Error parsing {post_file}: {e}")
            continue
    
    return posts


def main():
    parser = argparse.ArgumentParser(description="n8n Social Media Automation")
    subparsers = parser.add_subparsers(dest="command")
    
    # Import workflow command
    import_parser = subparsers.add_parser("import", help="Import workflow to n8n")
    
    # List workflows command
    list_parser = subparsers.add_parser("list", help="List n8n workflows")
    
    # Check ready posts command
    check_parser = subparsers.add_parser("check", help="Check for posts ready to publish")
    
    # Trigger workflow command
    trigger_parser = subparsers.add_parser("trigger", help="Trigger a workflow")
    trigger_parser.add_argument("workflow_id", help="Workflow ID to trigger")
    
    args = parser.parse_args()
    
    client = N8NClient()
    
    if args.command == "import":
        import_main_workflow()
    elif args.command == "list":
        workflows = client.list_workflows()
        print(f"Found {len(workflows)} workflows:")
        for wf in workflows:
            print(f"  - {wf.get('name')} (ID: {wf.get('id')})")
    elif args.command == "check":
        posts = get_ready_posts()
        if posts:
            print(f"Found {len(posts)} posts ready to publish:")
            for post in posts:
                print(f"  - {post['metadata'].get('title')} ({post['file']})")
        else:
            print("No posts ready to publish.")
    elif args.command == "trigger":
        result = client.trigger_workflow(args.workflow_id)
        if result:
            print("Workflow triggered successfully.")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
