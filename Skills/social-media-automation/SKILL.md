---
name: social-media-automation
description: "Automated social media posting for Facebook, X/Twitter, Instagram using official APIs. Manages content, scheduling, and cross-platform publishing."
metadata:
  author: frostwulf.zo.computer
  category: Skills
  display-name: Social Media Automation
---
# Social Media Automation

Automated social media posting system for Facebook, X/Twitter, and Instagram.

## Setup Requirements

### 1. Facebook (Free)
- Create Meta for Developers account: https://developers.facebook.com/
- Create an app and add Facebook Login product
- Generate access token with `pages_manage_posts` permission
- Page ID: 107257933 (MythologIQ Labs)

### 2. X/Twitter (Free - Limited)
- Create X Developer account: https://developer.twitter.com/
- Create a new project and app
- Get API Key, API Secret, Bearer Token
- Note: Free tier has ~500 posts/mo limit and may have 403 errors

### 3. Instagram (Via Facebook)
- Convert Instagram to Business account
- Link to Facebook Page
- Use same Facebook access token

## Credentials Storage

Add credentials to Settings > Developers:
- `FACEBOOK_ACCESS_TOKEN`: Your long-lived access token
- `FACEBOOK_PAGE_ID`: 107257933
- `TWITTER_API_KEY`: Your API key
- `TWITTER_API_SECRET`: Your API secret
- `TWITTER_BEARER_TOKEN`: Your bearer token

## Usage

### Publish to all platforms:
```bash
python3 scripts/publish.py --post path/to/post.md
```

### Publish to specific platform:
```bash
python3 scripts/publish.py --post path/to/post.md --platform facebook
```

### Schedule a post:
```bash
python3 scripts/schedule.py --post path/to/post.md --platform all --time "14:00"
```
