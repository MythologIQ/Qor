# Social Media Automation System

Automated content creation, scheduling, and publishing for LinkedIn, X/Twitter, Instagram, and Facebook.

## Important: Company Page Publishing

**MythologIQ Labs Identity**

All posts are published AS the company, not from your personal account:

| Platform | Company Page | Login Method |
|----------|-------------|--------------|
| LinkedIn | [MythologIQ Labs](https://www.linkedin.com/company/107257933/admin/dashboard/) | Log in to personal account, post AS company |
| Facebook | [MythologIQ Labs](https://www.facebook.com/mythologiqlabs/) | Log in to personal account, post AS page |
| X/Twitter | — | Direct posting |
| Instagram | — | Direct posting |

### How It Works

1. **Log in to personal accounts** — Use your credentials to access the platform
2. **Switch to company page mode** — The automation navigates to the company page/posting area
3. **Post AS the company** — Content is published from MythologIQ Labs, not your personal profile

**You remain in control** — Using your personal account is necessary to authenticate, but the content attribution will be "MythologIQ Labs".

---

## Quick Start

### 1. Set Up Your Sessions

Log in to each platform using Zo's browser. The session will persist for publishing:

```bash
# LinkedIn (personal login → post as company)
https://frostwulf.zo.computer/browser?url=https://www.linkedin.com

# Facebook (personal login → post as page)
https://frostwulf.zo.computer/browser?url=https://www.facebook.com

# X/Twitter (direct login)
https://frostwulf.zo.computer/browser?url=https://x.com
```

### 2. List Existing Posts

```bash
cd /home/workspace/Skills/social-content
python3 scripts/social_automation.py list
```

### 3. Create New Content

```bash
# Create a post
python3 scripts/social_automation.py create "Your Title Here" "contrarian" --date 2026-02-04
```

Post types: `contrarian`, `story`, `list`, `howto`, `promo`

### 4. Schedule Posts

```bash
# Schedule for a specific time
python3 scripts/social_automation.py schedule 2026-02-04 posts/2026-02-04-your-title.md --platform linkedin --time 07:00
```

### 5. Publish (Manual)

```bash
# Publish to one platform
python3 scripts/publish_post.py posts/your-post.md --platform linkedin

# Publish to all platforms
python3 scripts/publish_post.py posts/your-post.md --platform all
```

---

## Weekly Workflow

### Generate Weekly Plan

```bash
# Plan for next week
python3 scripts/generate_weekly_plan.py --export

# Create all draft posts for next week
python3 scripts/generate_weekly_plan.py --create
```

### Typical Week Schedule

| Day | Content Type | Platforms | Time (ET) |
|-----|--------------|-----------|-----------|
| Monday | Contrarian | LinkedIn, X, Facebook | 7:00 AM |
| Tuesday | Story | LinkedIn, Instagram, Facebook | 12:00 PM |
| Wednesday | List | LinkedIn, X, Instagram | 7:00 AM |
| Thursday | Howto | LinkedIn, X | 7:00 AM |
| Friday | Promo | LinkedIn, Facebook, Instagram | 7:00 AM |
| Saturday | Behind-the-scenes | X, Instagram | 10:00 AM |
| Sunday | Reflection | X, Facebook | 7:00 PM |

---

## Content Structure

### Post File Format

```markdown
---
title: "Post title"
type: "contrarian|story|list|howto|promo"
primary_platform: "linkedin"
cross_post_to: ["x", "instagram", "facebook"]
status: "draft|scheduled|published"
scheduled_date: "2026-02-04"
scheduled_time: "07:00"
published_date: null
engagement: {"likes": 0, "comments": 0, "shares": 0}
---

Post content here...

[platform_specific content]
```

### Platform Variations

The system automatically adapts content:

- **LinkedIn** — Full content, rich formatting
- **X/Twitter** — Thread format (if needed), hashtags
- **Instagram** — Carousel-friendly, visual emphasis
- **Facebook** — Conversational tone, community focus

---

## Scheduled Automation

### Automatic Daily Publishing

A Zo agent runs daily at 8:00 AM ET to publish scheduled posts:

1. Checks `content-calendar.json` for posts scheduled for today
2. Loads post content
3. Publishes to all configured platforms (as company page for LinkedIn/Facebook)
4. Logs results to `publishing-log.json`
5. Marks post as "published"

### Manage Scheduled Tasks

View and manage your automation at [Scheduled Tasks](/?t=agents).

---

## Content Pillars

### 1. Industry Critique (Contrarian)
- Challenge conventional AI wisdom
- Frame AI failures as design problems
- "Human-at-keyboard" perspective

### 2. Neurodiversity Thesis (Story)
- Founder origin story (ADHD → design insight)
- "Neurotypical is imaginary" thesis
- Personal connection to the problem

### 3. Solution Preview (Howto/Promo)
- Hearthlink feature reveals
- Design principles in action
- "Sovereign AI interfaces" framing

### 4. Behind-the-Scenes (Story)
- Building journey updates
- Product development milestones
- User feedback moments

---

## Configuration

### Brand Identity (`config.json`)

```json
{
  "brand": {
    "name": "MythologIQ Labs",
    "one_liner": "A visionary lab building sovereign AI interfaces for real humans.",
    "product_one_liner": "Hearthlink: A private, auditable AI workspace that adapts to how you think."
  }
}
```

### Company Pages

```json
{
  "company_pages": {
    "linkedin": {
      "url": "https://www.linkedin.com/company/107257933/admin/dashboard/",
      "name": "MythologIQ Labs"
    },
    "facebook": {
      "url": "https://www.facebook.com/mythologiqlabs/",
      "name": "MythologIQ Labs"
    }
  }
}
```

---

## Commands Reference

### Content Management

```bash
# List all posts
python3 scripts/social_automation.py list

# Create new post
python3 scripts/social_automation.py create "Title" "type" --date YYYY-MM-DD

# Schedule post
python3 scripts/social_automation.py schedule YYYY-MM-DD <post_file> --platform <platform> --time HH:MM

# Generate weekly plan
python3 scripts/generate_weekly_plan.py --export
python3 scripts/generate_weekly_plan.py --create

# Preview platform variations
python3 scripts/social_automation.py generate <post_file>
```

### Publishing

```bash
# Publish to specific platform
python3 scripts/publish_post.py <post_file> --platform linkedin|x|facebook|instagram

# Publish to all platforms
python3 scripts/publish_post.py <post_file> --platform all
```

---

## Troubleshooting

### Publishing Fails

1. **Not logged in** — Open the platform in Zo's browser and log in
2. **Session expired** — Log in again to refresh the session
3. **Company page not accessible** — Verify you have admin access to the company page
4. **Content too long** — Check character limits (X: 280, LinkedIn: 3000)

### Cross-Posting Issues

- **Instagram** — Requires mobile app for image uploads; consider manual posting for carousels
- **X/Twitter** — Long posts are automatically split into threads

### Calendar Conflicts

If multiple posts are scheduled for the same time on the same platform, only the first one will publish. Adjust times to avoid conflicts.

---

## Analytics

Track engagement by updating the `engagement` field in post frontmatter:

```yaml
engagement:
  likes: 42
  comments: 8
  shares: 15
```

Use these metrics to refine your content strategy over time.

---

## External Resources

- [LinkedIn Company Page Best Practices](https://business.linkedin.com/marketing-solutions/company-pages)
- [X/Twitter Posting Guide](https://help.twitter.com)
- [Instagram Creator Hub](https://business.instagram.com)
- [Facebook Business Suite](https://business.facebook.com)

---

## Support

Full documentation: `file 'Skills/social-content/QUICKSTART.md'`

For help with this skill or to request features, refer to `file 'Skills/social-content/SKILL.md'` or contact the Zo team.
