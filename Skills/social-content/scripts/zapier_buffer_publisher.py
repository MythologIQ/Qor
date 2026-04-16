#!/usr/bin/env python3
"""
Zapier + Buffer Social Publisher
Sends formatted social posts via email to trigger Zapier → Buffer automation
"""

import os
import sys
import smtplib
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import Optional
import json
import re

# Paths
SKILL_DIR = Path("/home/workspace/Skills/social-content")
POSTS_DIR = SKILL_DIR / "posts"
CONFIG_FILE = SKILL_DIR / "zapier_config.json"


def load_zapier_config() -> dict:
    """Load Zapier configuration."""
    if not CONFIG_FILE.exists():
        return {"zapier_email": None}
    
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)


def save_zapier_config(config: dict) -> None:
    """Save Zapier configuration."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)


def load_post(post_file: str) -> Optional[dict]:
    """Load a post file and extract metadata."""
    post_path = Path(post_file)
    if not post_path.is_absolute():
        post_path = POSTS_DIR / post_file
    
    if not post_path.exists():
        print(f"❌ Post file not found: {post_file}")
        return None
    
    with open(post_path, 'r') as f:
        content = f.read()
    
    # Extract frontmatter
    frontmatter_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not frontmatter_match:
        print(f"❌ No frontmatter found in {post_file}")
        return None
    
    try:
        import yaml
        metadata = yaml.safe_load(frontmatter_match.group(1))
        body = content[frontmatter_match.end():]
        
        # Extract platform-specific content
        platforms = {}
        current_platform = None
        current_content = []
        
        for line in body.split('\n'):
            platform_match = re.match(r'^## (LinkedIn|X/Twitter|Instagram|Facebook)$', line)
            if platform_match:
                if current_platform and current_content:
                    platforms[current_platform.lower().replace('/', '').replace('twitter', 'x')] = '\n'.join(current_content).strip()
                current_platform = platform_match.group(1)
                current_content = []
            elif current_platform:
                current_content.append(line)
        
        if current_platform and current_content:
            platforms[current_platform.lower().replace('/', '').replace('twitter', 'x')] = '\n'.join(current_content).strip()
        
        metadata['platforms'] = platforms
        metadata['body'] = body
        metadata['file_path'] = str(post_path)
        return metadata
    except ImportError:
        print("❌ PyYAML not installed. Run: pip install pyyaml")
        return None
    except Exception as e:
        print(f"❌ Error parsing post {post_file}: {e}")
        return None


def format_for_buffer(post: dict, platform: str) -> str:
    """Format post content for Buffer."""
    content = post['platforms'].get(platform, '')
    
    # Add platform-specific hashtags
    if platform == 'facebook':
        hashtags = "#AI #Business #Neurodiversity #MythologIQ"
    elif platform == 'x':
        hashtags = "#AI #Neurodiversity #Tech"
    else:
        hashtags = ""
    
    if hashtags and not content.endswith(hashtags):
        content = f"{content}\n\n{hashtags}"
    
    return content


def send_via_email(to_email: str, subject: str, body: str, platform: str = "buffer") -> bool:
    """Send email to trigger Zapier automation."""
    try:
        msg = MIMEMultipart()
        msg['From'] = "zocomputer@zo.computer"
        msg['To'] = to_email
        msg['Subject'] = f"[{platform.upper()}] {subject}"
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Use system sendmail if available
        if os.path.exists('/usr/sbin/sendmail'):
            with smtplib.SMTP('localhost') as server:
                server.send_message(msg)
            print(f"✅ Email sent to {to_email}")
            return True
        else:
            print(f"📧 Email content ready (sendmail not available):")
            print(f"   To: {to_email}")
            print(f"   Subject: {msg['Subject']}")
            print(f"   Body:\n{body[:200]}...")
            return False
            
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return False


def list_posts() -> None:
    """List all available posts."""
    print("📋 Available Posts:")
    print("=" * 60)
    
    for post_file in sorted(POSTS_DIR.glob("*.md")):
        if post_file.name == ".gitkeep":
            continue
        post = load_post(post_file)
        if post:
            status_emoji = {"draft": "📝", "scheduled": "📅", "published": "✅"}
            print(f"{status_emoji.get(post.get('status'), '❓')} {post.get('title')}")
            print(f"   File: {post.get('file_path')}")
            platforms = post.get('cross_post_to', [])
            print(f"   Platforms: {', '.join(platforms) if platforms else 'None'}")
            print()


def preview_post(post_file: str) -> None:
    """Preview formatted content for Buffer."""
    post = load_post(post_file)
    if not post:
        return
    
    print(f"\n{'='*60}")
    print(f"📝 Preview: {post.get('title')}")
    print(f"{'='*60}\n")
    
    for platform in ['facebook', 'x']:
        if platform in post.get('platforms', {}):
            print(f"\n## {platform.upper()}")
            formatted = format_for_buffer(post, platform)
            print(formatted)
            print()


def send_post(post_file: str) -> None:
    """Send post to Zapier for Buffer."""
    config = load_zapier_config()
    zapier_email = config.get('zapier_email')
    
    if not zapier_email:
        print("❌ Zapier email not configured.")
        print("   Run: python3 scripts/zapier_buffer_publisher.py --configure --email YOUR_ZAPIER_EMAIL")
        return
    
    post = load_post(post_file)
    if not post:
        return
    
    platforms_to_send = ['facebook', 'x']
    
    print(f"\n{'='*60}")
    print(f"📤 Sending post: {post.get('title')}")
    print(f"{'='*60}\n")
    
    for platform in platforms_to_send:
        if platform in post.get('platforms', {}):
            content = format_for_buffer(post, platform)
            subject = post.get('title', 'Social Post')
            
            print(f"Sending to {platform.upper()}...")
            if send_via_email(zapier_email, subject, content, platform):
                print(f"✅ {platform.upper()}: Sent to Zapier")
            else:
                print(f"⚠️  {platform.upper()}: Failed to send")
            print()
    
    print("💡 LinkedIn should be posted separately using native scheduling.")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Zapier + Buffer Social Publisher")
    parser.add_argument("--list", action="store_true", help="List available posts")
    parser.add_argument("--preview", metavar="FILE", help="Preview formatted content")
    parser.add_argument("--send", metavar="FILE", help="Send to Zapier")
    parser.add_argument("--configure", action="store_true", help="Configure Zapier email")
    parser.add_argument("--email", metavar="EMAIL", help="Set Zapier email address")
    
    args = parser.parse_args()
    
    if args.list:
        list_posts()
    elif args.preview:
        preview_post(args.preview)
    elif args.send:
        send_post(args.send)
    elif args.configure:
        if not args.email:
            print("❌ Please provide email: --email YOUR_ZAPIER_EMAIL")
        else:
            config = load_zapier_config()
            config['zapier_email'] = args.email
            save_zapier_config(config)
            print(f"✅ Zapier email configured: {args.email}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
