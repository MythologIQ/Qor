#!/usr/bin/env python3
"""
Social Media Publishing Script
Uses browser automation to publish posts to social platforms.

NOTE: For LinkedIn, you need to be logged in via Zo's browser:
https://frostwulf.zo.computer/browser?url=https://www.linkedin.com
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Optional

# Paths
SKILL_DIR = Path("/home/workspace/Skills/social-content")
POSTS_DIR = SKILL_DIR / "posts"

# Import social automation utilities
sys.path.insert(0, str(SKILL_DIR / "scripts"))
from social_automation import load_post, load_calendar


def publish_to_linkedin(post_file: str) -> bool:
    """Publish post to LinkedIn Company Page as MythologIQ Labs."""
    print("📝 Publishing to LinkedIn Company Page: MythologIQ Labs...")
    
    try:
        # Load post data
        post = load_post(Path(post_file))
        if not post:
            print("❌ Could not load post")
            return False
        
        # Get LinkedIn content or fall back to body
        content = post['platforms'].get('linkedin', '')
        if not content:
            content = post.get('body', '')
        
        if not content:
            print("❌ No content found for LinkedIn")
            return False
        
        # Navigate to LinkedIn
        print("   Opening LinkedIn...")
        open_webpage("https://www.linkedin.com/feed/")
        
        # Wait for login prompt or check if logged in
        print("   Checking login status...")
        view_webpage()
        
        # Navigate to company page admin dashboard
        print("   Navigating to MythologIQ Labs company page...")
        use_webpage(
            task="Navigate to the MythologIQ Labs company page dashboard at https://www.linkedin.com/company/107257933/admin/dashboard/. "
            "Look for the 'Start a post' or 'Create post' button specifically for the company page (not personal feed). "
            "Click it to open the post composer."
        )
        
        # Wait for composer to load
        print("   Opening post composer...")
        
        # Fill in content
        print("   Adding post content...")
        use_webpage(
            task=f"Type the following post content into the LinkedIn post composer:\n\n{content}\n\n"
            "Make sure all formatting (line breaks, spacing) is preserved."
        )
        
        # Submit post
        print("   Submitting post...")
        use_webpage(
            task="Review the post content, then click the 'Post' button to publish. "
            "Verify that the post will be published as 'MythologIQ Labs' company page, not as personal account."
        )
        
        # Verify post was published
        print("   Verifying publication...")
        view_webpage()
        
        print("✅ LinkedIn post published as MythologIQ Labs company page!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to publish to LinkedIn: {e}")
        return False


def publish_to_x(post_file: str) -> bool:
    """
    Publish post to X/Twitter using browser automation.

    Prerequisites:
    1. Log in to X via Zo's browser
    2. Post content must be formatted as thread

    Returns: True if successful, False otherwise
    """
    try:
        from zo_browser import publish_x_thread
        
        post = load_post(Path(post_file))
        if not post:
            print(f"Error: Could not load post {post_file}")
            return False
        
        x_content = post['platforms'].get('x', '')
        if not x_content:
            print("Error: No X/Twitter content found in post")
            return False
        
        print(f"Publishing to X/Twitter: {post.get('title')}")
        
        result = publish_x_thread(x_content)
        
        if result:
            print("✅ Published to X/Twitter successfully!")
            return True
        else:
            print("❌ Failed to publish to X/Twitter")
            return False
            
    except ImportError:
        print("Error: Zo browser tools not available.")
        print("This script requires integration with Zo's browser automation.")
        print("For now, please manually publish posts.")
        return False
    except Exception as e:
        print(f"Error publishing to X/Twitter: {e}")
        return False


def publish_to_facebook(post_file: str) -> bool:
    """Publish post to Facebook Page as MythologIQ Labs."""
    print("📝 Publishing to Facebook Page: MythologIQ Labs...")
    
    try:
        # Load post data
        post = load_post(Path(post_file))
        if not post:
            print("❌ Could not load post")
            return False
        
        # Get Facebook content
        content = post['platforms'].get('facebook', '')
        if not content:
            # Fall back to LinkedIn content if Facebook content doesn't exist
            content = post['platforms'].get('linkedin', '')
            if not content:
                print("❌ No Facebook or LinkedIn content found in post")
                return False
        
        # Navigate to Facebook
        print("   Opening Facebook...")
        open_webpage("https://www.facebook.com")
        
        # Wait for login
        print("   Checking login status...")
        view_webpage()
        
        # Navigate to MythologIQ Labs page
        print("   Navigating to MythologIQ Labs page...")
        use_webpage(
            task="Navigate to the MythologIQ Labs Facebook page at https://www.facebook.com/mythologiqlabs/. "
            "Look for the 'Write a post' or 'Create post' option on the page. "
            "Verify you are posting AS the page (posting as MythologIQ Labs), not as your personal profile."
        )
        
        # Click to create post
        print("   Opening post composer...")
        
        # Fill in content
        print("   Adding post content...")
        use_webpage(
            task=f"Type the following post content into the Facebook post composer:\n\n{content}\n\n"
            "Make sure all formatting is preserved."
        )
        
        # Submit post
        print("   Submitting post...")
        use_webpage(
            task="Review the post content, then click the 'Post' button to publish. "
            "Verify that the post will be published as 'MythologIQ Labs' page, not as your personal profile."
        )
        
        # Verify post was published
        print("   Verifying publication...")
        view_webpage()
        
        print("✅ Facebook post published as MythologIQ Labs page!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to publish to Facebook: {e}")
        return False


def publish_to_instagram(post_file: str) -> bool:
    """
    Publish post to Instagram using browser automation.

    Prerequisites:
    1. Log in to Instagram via Zo's browser
    2. For carousel posts, images need to be prepared separately

    Returns: True if successful, False otherwise
    """
    try:
        from zo_browser import publish_instagram_post
        
        post = load_post(Path(post_file))
        if not post:
            print(f"Error: Could not load post {post_file}")
            return False
        
        insta_content = post['platforms'].get('instagram', '')
        if not insta_content:
            print("Error: No Instagram content found in post")
            return False
        
        print(f"Publishing to Instagram: {post.get('title')}")
        
        result = publish_instagram_post(insta_content)
        
        if result:
            print("✅ Published to Instagram successfully!")
            return True
        else:
            print("❌ Failed to publish to Instagram")
            return False
            
    except ImportError:
        print("Error: Zo browser tools not available.")
        print("This script requires integration with Zo's browser automation.")
        print("For now, please manually publish posts.")
        print("Instagram posts typically require the mobile app for image uploads.")
        return False
    except Exception as e:
        print(f"Error publishing to Instagram: {e}")
        return False


def publish_all_platforms(post_file: str) -> dict:
    """
    Publish post to all configured platforms.

    Returns: dict with platform: result (bool) pairs
    """
    post = load_post(Path(post_file))
    if not post:
        print(f"Error: Could not load post {post_file}")
        return {}
    
    results = {}
    platforms_to_publish = post.get('cross_post_to', [])
    
    # Always publish to primary platform
    primary_platform = post.get('primary_platform', 'linkedin')
    if primary_platform not in platforms_to_publish:
        platforms_to_publish.append(primary_platform)
    
    for platform in platforms_to_publish:
        print(f"\n{'='*50}")
        print(f"Publishing to {platform.upper()}")
        print('='*50)
        
        if platform == 'linkedin':
            results['linkedin'] = publish_to_linkedin(post_file)
        elif platform == 'x':
            results['x'] = publish_to_x(post_file)
        elif platform == 'facebook':
            results['facebook'] = publish_to_facebook(post_file)
        elif platform == 'instagram':
            results['instagram'] = publish_to_instagram(post_file)
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Publish social media posts")
    parser.add_argument("file", help="Post file to publish")
    parser.add_argument("--platform", 
                       choices=["linkedin", "x", "facebook", "instagram", "all"],
                       default="linkedin",
                       help="Platform to publish to (default: linkedin)")
    
    args = parser.parse_args()

    post_file = args.file
    
    # If file is relative, resolve to posts directory
    if not Path(post_file).exists():
        post_file = str(POSTS_DIR / post_file)
    
    if not Path(post_file).exists():
        print(f"Error: Post file not found: {post_file}")
        sys.exit(1)
    
    if args.platform == "all":
        results = publish_all_platforms(post_file)
        
        print(f"\n{'='*50}")
        print("PUBLISHING SUMMARY")
        print('='*50)
        
        for platform, success in results.items():
            status = "✅ Success" if success else "❌ Failed"
            print(f"{platform.upper()}: {status}")
    else:
        if args.platform == 'linkedin':
            publish_to_linkedin(post_file)
        elif args.platform == 'x':
            publish_to_x(post_file)
        elif args.platform == 'facebook':
            publish_to_facebook(post_file)
        elif args.platform == 'instagram':
            publish_to_instagram(post_file)


if __name__ == "__main__":
    main()
