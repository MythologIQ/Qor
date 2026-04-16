#!/usr/bin/env python3
"""
Social Media Automation System
Manages content calendar, generates platform-specific posts, and automates publishing.
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import re
from typing import Dict, List, Optional

# Paths
SKILL_DIR = Path("/home/workspace/Skills/social-content")
POSTS_DIR = SKILL_DIR / "posts"
CALENDAR_FILE = SKILL_DIR / "content-calendar.json"


def load_calendar() -> dict:
    """Load the content calendar."""
    if not CALENDAR_FILE.exists():
        return {"calendar": {}, "content_types": {}, "posting_schedule": {}}
    with open(CALENDAR_FILE, 'r') as f:
        return json.load(f)


def save_calendar(data: dict) -> None:
    """Save the content calendar."""
    with open(CALENDAR_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def load_post(post_file: Path) -> Optional[dict]:
    """Load a post file and extract metadata."""
    if not post_file.exists():
        return None
    
    with open(post_file, 'r') as f:
        content = f.read()
    
    # Extract frontmatter
    frontmatter_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not frontmatter_match:
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
        metadata['file_path'] = str(post_file)
        return metadata
    except ImportError:
        print("Error: PyYAML not installed. Run: pip install pyyaml")
        return None
    except Exception as e:
        print(f"Error parsing post {post_file}: {e}")
        return None


def list_posts(filter_status: str = None) -> List[dict]:
    """List all posts, optionally filtering by status."""
    posts = []
    for post_file in sorted(POSTS_DIR.glob("*.md")):
        if post_file.name == ".gitkeep":
            continue
        post = load_post(post_file)
        if post:
            if filter_status is None or post.get('status') == filter_status:
                posts.append(post)
    return posts


def generate_post_variations(post: dict) -> dict:
    """
    Generate platform-specific content variations based on LinkedIn source.
    If platform-specific content exists, use it. Otherwise, adapt from LinkedIn.
    """
    variations = {}
    linkedin_content = post['platforms'].get('linkedin', '')
    
    # X/Twitter
    if 'x' not in post['platforms'] and linkedin_content:
        # Convert LinkedIn to thread format
        variations['x'] = linkedin_to_thread(linkedin_content)
    
    # Instagram (carousel caption)
    if 'instagram' not in post['platforms'] and linkedin_content:
        variations['instagram'] = linkedin_to_instagram(linkedin_content)
    
    # Facebook
    if 'facebook' not in post['platforms'] and linkedin_content:
        variations['facebook'] = linkedin_content  # Similar format to LinkedIn
    
    return variations


def linkedin_to_thread(linkedin_content: str) -> str:
    """Convert LinkedIn post to Twitter thread format."""
    lines = linkedin_content.split('\n')
    tweets = []
    current_tweet = []
    char_count = 0
    
    for line in lines:
        if line.startswith('• '):
            # Bullet point - start new tweet if needed
            if current_tweet and char_count + len(line) > 280:
                tweets.append('\n'.join(current_tweet))
                current_tweet = []
                char_count = 0
            current_tweet.append(line)
            char_count += len(line) + 1
        elif line and not line.startswith('#'):
            if current_tweet and char_count + len(line) + 1 > 280:
                tweets.append('\n'.join(current_tweet))
                current_tweet = []
                char_count = 0
            current_tweet.append(line)
            char_count += len(line) + 1
    
    if current_tweet:
        tweets.append('\n'.join(current_tweet))
    
    return '\n\n'.join(tweets)


def linkedin_to_instagram(linkedin_content: str) -> str:
    """Convert LinkedIn post to Instagram caption format."""
    # Similar to LinkedIn but more concise and with hashtags
    lines = linkedin_content.split('\n')
    caption_lines = []
    
    for line in lines:
        if line.strip() and len(line.strip()) < 150:
            caption_lines.append(line)
        elif line.startswith('• '):
            caption_lines.append(line)
    
    # Add relevant hashtags
    hashtags = "#AI #Neurodiversity #MythologIQ #Tech"
    
    caption = '\n'.join(caption_lines[:10]) + '\n\n' + hashtags
    return caption


def schedule_post(post_date: str, post_file: str, platform: str = "linkedin", time: str = "07:00") -> None:
    """Schedule a post for a specific date and time."""
    calendar = load_calendar()
    
    post = load_post(Path(post_file))
    if not post:
        print(f"Error: Could not load post {post_file}")
        return
    
    calendar['calendar'][post_date] = {
        'platform': platform,
        'type': post.get('type'),
        'status': 'scheduled',
        'post_file': post_file,
        'time': time,
        'published': False
    }
    
    save_calendar(calendar)
    print(f"Scheduled post for {post_date} at {time} on {platform}")


def get_scheduled_posts() -> List[dict]:
    """Get all scheduled posts that haven't been published."""
    calendar = load_calendar()
    scheduled = []
    
    for date, entry in calendar['calendar'].items():
        if entry.get('status') == 'scheduled' and not entry.get('published'):
            post = load_post(Path(entry.get('post_file')))
            if post:
                scheduled.append({
                    'date': date,
                    'time': entry.get('time', '07:00'),
                    'platform': entry.get('platform'),
                    'post': post
                })
    
    return sorted(scheduled, key=lambda x: x['date'])


def generate_post_from_template(template_type: str, topic: str) -> dict:
    """Generate a new post from a template."""
    templates = {
        'contrarian': """
Unpopular opinion: [YOUR CONTRARIAN CLAIM]

Here's why:

[REASON 1]
[REASON 2]
[REASON 3]

[WHAT YOU RECOMMEND INSTEAD]

[INVITE DISCUSSION]
""",
        'story': """
[HOOK: UNEXPECTED OUTCOME OR LESSON]

[SET THE SCENE]

[THE CHALLENGE YOU FACED]

[WHAT YOU TRIED]

[THE TURNING POINT]

[THE RESULT]

[THE LESSON FOR READERS]

[QUESTION TO PROMPT ENGAGEMENT]
""",
        'list': """
[X THINGS I LEARNED ABOUT [TOPIC]:

1. [POINT] — [BRIEF EXPLANATION]

2. [POINT] — [BRIEF EXPLANATION]

3. [POINT] — [BRIEF EXPLANATION]

[WRAP-UP INSIGHT]

WHICH RESONATES MOST WITH YOU?
""",
        'howto': """
HOW TO [ACHIEVE OUTCOME]:

STEP 1: [ACTION]
↳ [WHY THIS MATTERS]

STEP 2: [ACTION]
↳ [KEY DETAIL]

STEP 3: [ACTION]
↳ [COMMON MISTAKE TO AVOID]

[RESULT YOU CAN EXPECT]

[CTA OR QUESTION]
"""
    }
    
    return {
        'title': topic,
        'type': template_type,
        'primary_platform': 'linkedin',
        'template': templates.get(template_type, '')
    }


def create_new_post(title: str, post_type: str, date: str = None) -> str:
    """Create a new post file from template."""
    if date is None:
        date = datetime.now().strftime('%Y-%m-%d')
    
    slug = title.lower().replace(' ', '-')[:30]
    filename = f"{date}-{slug}.md"
    filepath = POSTS_DIR / filename
    
    # Generate from template
    template_data = generate_post_from_template(post_type, title)
    
    # Create file with frontmatter
    frontmatter = f"""---
title: "{title}"
type: "{post_type}"
primary_platform: "linkedin"
cross_post_to: ["x", "facebook"]
status: "draft"
scheduled_date: "{date}"
published_date: null
engagement: {"likes": 0, "comments": 0, "shares": 0}
---

## LinkedIn

{template_data['template']}

## X/Twitter

[Generated from LinkedIn content]

## Facebook

[Generated from LinkedIn content]

## Instagram

[Generated from LinkedIn content with hashtags]
"""
    
    with open(filepath, 'w') as f:
        f.write(frontmatter)
    
    print(f"Created new post: {filepath}")
    return str(filepath)


def main():
    parser = argparse.ArgumentParser(description="Social Media Automation")
    subparsers = parser.add_subparsers(dest="command")

    # List posts
    list_parser = subparsers.add_parser("list", help="List posts")
    list_parser.add_argument("--status", choices=["draft", "scheduled", "published"], help="Filter by status")
    
    # Create new post
    create_parser = subparsers.add_parser("create", help="Create new post")
    create_parser.add_argument("title", help="Post title")
    create_parser.add_argument("type", choices=["contrarian", "story", "list", "howto", "promo"], help="Post type")
    create_parser.add_argument("--date", help="Schedule date (YYYY-MM-DD)")
    
    # Schedule post
    schedule_parser = subparsers.add_parser("schedule", help="Schedule existing post")
    schedule_parser.add_argument("date", help="Date (YYYY-MM-DD)")
    schedule_parser.add_argument("file", help="Post file")
    schedule_parser.add_argument("--platform", default="linkedin", choices=["linkedin", "x", "instagram", "facebook"])
    schedule_parser.add_argument("--time", default="07:00", help="Time (HH:MM)")
    
    # Show scheduled
    subparsers.add_parser("scheduled", help="Show scheduled posts")
    
    # Generate variations
    gen_parser = subparsers.add_parser("generate", help="Generate platform variations")
    gen_parser.add_argument("file", help="Post file")
    
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if args.command == "list":
        posts = list_posts(args.status)
        for post in posts:
            status_emoji = {"draft": "📝", "scheduled": "📅", "published": "✅"}
            print(f"{status_emoji.get(post.get('status'), '❓')} {post.get('title')} ({post.get('status')})")
            print(f"   File: {post.get('file_path')}")
            if post.get('scheduled_date'):
                print(f"   Scheduled: {post.get('scheduled_date')} at {post.get('scheduled_time', '07:00')}")
            print()

    elif args.command == "create":
        create_new_post(args.title, args.type, args.date)

    elif args.command == "schedule":
        schedule_post(args.date, args.file, args.platform, args.time)

    elif args.command == "scheduled":
        scheduled = get_scheduled_posts()
        for item in scheduled:
            print(f"📅 {item['date']} at {item['time']}")
            print(f"   Platform: {item['platform']}")
            print(f"   Post: {item['post'].get('title')}")
            print()

    elif args.command == "generate":
        post = load_post(Path(args.file))
        if post:
            variations = generate_post_variations(post)
            for platform, content in variations.items():
                print(f"\n## {platform.upper()}")
                print(content[:200] + "...")


if __name__ == "__main__":
    main()
