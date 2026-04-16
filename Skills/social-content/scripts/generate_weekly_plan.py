#!/usr/bin/env python3
"""
Generate weekly content plan based on content pillars and optimal schedule.
"""

import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

# Paths
SKILL_DIR = Path("/home/workspace/Skills/social-content")
sys.path.insert(0, str(SKILL_DIR / "scripts"))
from social_automation import create_new_post

# Content pillars and post types
WEEKLY_SCHEDULE = {
    "Monday": {
        "type": "contrarian",
        "pillar": "Industry critique",
        "platforms": ["linkedin", "x", "facebook"],
        "time": "07:00",
        "suggested_topics": [
            "AI bubble narrative analysis",
            "Contrarian take on industry trend",
            "Why AI projects fail (reframed)",
            "The problem with 'average user' design"
        ]
    },
    "Tuesday": {
        "type": "story",
        "pillar": "Neurodiversity thesis",
        "platforms": ["linkedin", "instagram", "facebook"],
        "time": "12:00",
        "suggested_topics": [
            "ADHD origin story",
            "Tool frustration moment",
            "Design epiphany",
            "Personal workflow discovery"
        ]
    },
    "Wednesday": {
        "type": "list",
        "pillar": "Industry critique",
        "platforms": ["linkedin", "x", "instagram"],
        "time": "07:00",
        "suggested_topics": [
            "5 reasons AI fails in business",
            "7 UX patterns that exclude neurodiverse users",
            "3 design principles for human-centered AI",
            "10 things I learned building Hearthlink"
        ]
    },
    "Thursday": {
        "type": "howto",
        "pillar": "Solution preview",
        "platforms": ["linkedin", "x"],
        "time": "07:00",
        "suggested_topics": [
            "How to identify AI that adapts to you",
            "Designing for neurodiversity in AI",
            "Building tools that respect cognitive patterns",
            "Evaluating AI tools for human-centered design"
        ]
    },
    "Friday": {
        "type": "promo",
        "pillar": "Solution preview",
        "platforms": ["linkedin", "facebook", "instagram"],
        "time": "07:00",
        "suggested_topics": [
            "What if AI learned your thinking patterns?",
            "Hearthlink: AI that adapts to how you think",
            "The end of one-size-fits-all AI",
            "Preview: Sovereign AI interfaces"
        ]
    },
    "Saturday": {
        "type": "story",
        "pillar": "Behind-the-scenes",
        "platforms": ["x", "instagram"],
        "time": "10:00",
        "suggested_topics": [
            "Building journey update",
            "Product development milestone",
            "User feedback moment",
            "Design iteration story"
        ]
    },
    "Sunday": {
        "type": "story",
        "pillar": "Behind-the-scenes",
        "platforms": ["x", "facebook"],
        "time": "19:00",
        "suggested_topics": [
            "Weekly reflection",
            "Lesson learned this week",
            "Industry observation",
            "Looking forward to next week"
        ]
    }
}


def get_monday_of_week(start_date: datetime) -> datetime:
    """Get Monday of the given week."""
    return start_date - timedelta(days=start_date.weekday())


def generate_weekly_plan(start_date: datetime = None) -> List[dict]:
    """
    Generate a weekly content plan starting from given date (or next Monday).
    
    Returns: List of post dicts with day, date, type, topics
    """
    if start_date is None:
        start_date = datetime.now()
    
    # Start from next Monday
    monday = get_monday_of_week(start_date)
    if start_date > monday:
        monday += timedelta(days=7)
    
    plan = []
    for i in range(7):
        day = monday + timedelta(days=i)
        day_name = day.strftime("%A")
        date_str = day.strftime("%Y-%m-%d")
        
        if day_name in WEEKLY_SCHEDULE:
            schedule = WEEKLY_SCHEDULE[day_name]
            plan.append({
                "day": day_name,
                "date": date_str,
                "type": schedule["type"],
                "pillar": schedule["pillar"],
                "platforms": schedule["platforms"],
                "time": schedule["time"],
                "suggested_topics": schedule["suggested_topics"]
            })
    
    return plan


def create_weekly_posts(start_date: datetime = None, topics: dict = None) -> List[str]:
    """
    Create post files for the entire week.
    
    Args:
        start_date: Week start date (defaults to next Monday)
        topics: Dict mapping day_name to topic string
    
    Returns: List of created file paths
    """
    if start_date is None:
        start_date = datetime.now()
    
    monday = get_monday_of_week(start_date)
    if start_date > monday:
        monday += timedelta(days=7)
    
    created_files = []
    topics = topics or {}
    
    for i in range(7):
        day = monday + timedelta(days=i)
        day_name = day.strftime("%A")
        date_str = day.strftime("%Y-%m-%d")
        
        if day_name in WEEKLY_SCHEDULE:
            schedule = WEEKLY_SCHEDULE[day_name]
            topic = topics.get(day_name, schedule["suggested_topics"][0])
            
            # Create post file
            file_path = create_new_post(topic, schedule["type"], date_str)
            if file_path:
                created_files.append(file_path)
    
    return created_files


def print_weekly_plan(plan: List[dict]) -> None:
    """Print weekly content plan in readable format."""
    print("="*70)
    print(f"WEEKLY CONTENT PLAN")
    print("="*70)
    print()
    
    for entry in plan:
        print(f"📅 {entry['day']} — {entry['date']}")
        print(f"   Type: {entry['type'].upper()}")
        print(f"   Pillar: {entry['pillar']}")
        print(f"   Platforms: {', '.join(entry['platforms'])}")
        print(f"   Time: {entry['time']}")
        print(f"   Suggested topics:")
        for topic in entry['suggested_topics']:
            print(f"      • {topic}")
        print()


def export_plan_to_json(plan: List[dict], output_file: Path = None) -> Path:
    """Export weekly plan to JSON file."""
    if output_file is None:
        output_file = SKILL_DIR / f"weekly-plan-{datetime.now().strftime('%Y%m%d')}.json"
    
    with open(output_file, 'w') as f:
        json.dump(plan, f, indent=2)
    
    print(f"✅ Weekly plan exported to: {output_file}")
    return output_file


def main():
    parser = argparse.ArgumentParser(description="Generate weekly content plan")
    parser.add_argument("--date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--create", action="store_true", help="Create post files for the week")
    parser.add_argument("--export", action="store_true", help="Export plan to JSON")
    
    args = parser.parse_args()

    # Parse date if provided
    start_date = None
    if args.date:
        try:
            start_date = datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            print(f"Error: Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)
    
    # Generate plan
    plan = generate_weekly_plan(start_date)
    
    # Print plan
    print_weekly_plan(plan)
    
    # Export if requested
    if args.export:
        export_plan_to_json(plan)
    
    # Create posts if requested
    if args.create:
        print("\n" + "="*70)
        print("CREATING POST FILES")
        print("="*70)
        print()
        
        created_files = create_weekly_posts(start_date)
        
        print("\n" + "="*70)
        print(f"✅ Created {len(created_files)} post files")
        print("="*70)
        print("\nNext steps:")
        print("1. Edit post files in posts/ directory")
        print("2. Add platform-specific content variations")
        print("3. Schedule posts:")
        print("   python3 scripts/social_automation.py schedule <date> <post_file>")
        print()


if __name__ == "__main__":
    main()
