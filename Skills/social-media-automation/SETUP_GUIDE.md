# Social Media Automation Setup Guide

Complete system for publishing to **LinkedIn, X, Facebook, and Instagram** from MythologIQ Labs.

---

## Overview

This automation system has three components:

1. **Facebook Graph API** — Posts to Facebook Page ✅
2. **Instagram Business Setup** — API access for posting ✅
3. **Content Prep Workflow** — Formats posts for all 4 platforms ✅

---

## Quick Start

### 1. Set Up Facebook API Access

**What you need:**
- Facebook Developer account (free)
- MythologIQ Labs Facebook Page
- Page Access Token

**Steps:**

1. Go to https://developers.facebook.com/apps/
2. Click **Create App** → Type: **Business**
3. In App Dashboard → **App Review** → **Permissions and Features**
4. Request these permissions:
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_content_publish`

5. **Generate Page Access Token:**
   - Go to **Tools** → **Graph API Explorer**
   - Select your app in "Application" dropdown
   - In "User or Page" dropdown, select **MythologIQ Labs Page**
   - Under "Permissions", check the 5 permissions above
   - Click **Generate Access Token**

6. **Copy the token** — it will look like: `EAA...`

7. **Add to Zo Settings:**
   - Go to [Settings > Developers](/?t=settings&s=developers)
   - Add secret: `FACEBOOK_PAGE_ACCESS_TOKEN = EAA...`
   - Add secret: `FACEBOOK_PAGE_ID = mythologiqlabs` (or numeric ID)

**Verify:**
```bash
python3 /home/workspace/Skills/social-media-automation/scripts/facebook_poster.py --verify
```

Should show: `✅ Connected to Facebook Page: MythologIQ Labs`

---

### 2. Set Up Instagram Business Account

**Instagram MUST be a Business account** to use API.

**Steps:**

1. **Convert to Business Account:**
   - Open Instagram app
   - Profile → Settings (⋮) → **Account type and tools**
   - Tap **Switch to Professional Account** → **Business**
   - Category: "Technology" or "Software Company"

2. **Connect to Facebook Page:**
   - Instagram → Settings → **Linked Accounts** → **Facebook**
   - Select **MythologIQ Labs** page
   - Confirm connection

3. **Get Instagram Business ID:**
   - Go to https://business.facebook.com/settings
   - Click **Instagram Accounts**
   - Find your account — copy the ID (looks like: `178414...`)

4. **Add to Zo Settings:**
   - Add secret: `INSTAGRAM_BUSINESS_ID = 178414...`

**Full guide:** `file 'Skills/social-media-automation/INSTAGRAM_SETUP.md'`

---

### 3. Prepare Content for All Platforms

**Create your post** in markdown with sections for each platform:

```markdown
---
title: "Your Post Title"
---

## LinkedIn

[LinkedIn-specific content here...]

## X/Twitter

[Twitter-specific content here...]

## Facebook

[Facebook-specific content here...]

## Instagram

[Instagram caption here...]
```

**Generate formatted versions:**

```bash
# Preview all platforms
python3 /home/workspace/Skills/social-media-automation/scripts/content_prep.py /path/to/post.md --preview

# Save formatted files
python3 /home/workspace/Skills/social-media-automation/scripts/content_prep.py /path/to/post.md
```

This creates:
- `post_linkedin.txt` — LinkedIn-ready content
- `post_x.txt` — Twitter-ready content (thread if needed)
- `post_facebook.txt` — Facebook-ready content
- `post_instagram.txt` — Instagram caption + hashtags
- `post_summary.json` — All formats in JSON

---

## Posting to Each Platform

### Facebook (API — Automated)

```bash
python3 /home/workspace/Skills/social-media-automation/scripts/facebook_poster.py \
  --message "Your post content" \
  --image /path/to/image.png
```

### Instagram (API — After setup)

Coming soon — script will be created once Instagram is converted to Business account.

### X/Twitter (API — Bearer Token Required)

Coming soon — need to set up X Developer access and get Bearer Token.

### LinkedIn (Manual — Browser Automation)

Use LinkedIn's native scheduler:
1. Go to MythologIQ Labs page → Start a post
2. Click "Schedule" button (clock icon)
3. Set date/time

---

## File Locations

| File/Script | Location |
|--------------|-----------|
| Content prep workflow | `file 'Skills/social-media-automation/scripts/content_prep.py'` |
| Facebook poster | `file 'Skills/social-media-automation/scripts/facebook_poster.py'` |
| Instagram setup guide | `file 'Skills/social-media-automation/INSTAGRAM_SETUP.md'` |
| Main documentation | `file 'Skills/social-media-automation/SKILL.md'` |
| Source posts | `file 'Skills/social-content/posts/'` |

---

## Workflow Summary

```
1. Write post in markdown (all platforms in one file)
   ↓
2. Run content_prep.py → Generates platform-specific versions
   ↓
3. For Facebook: Run facebook_poster.py → Posts automatically
   ↓
4. For Instagram: (Coming soon) → Posts automatically
   ↓
5. For X/Twitter: (Coming soon) → Posts automatically
   ↓
6. For LinkedIn: Use browser → Schedule manually
```

---

## Next Steps

1. ✅ Set up Facebook Developer account + tokens
2. ✅ Convert Instagram to Business account
3. ⏳ Set up X/Twitter Developer access
4. ✅ Create posts using content_prep.py workflow
5. ✅ Start posting to Facebook automatically
6. ⏳ Post to Instagram automatically (after Business account)

---

## Troubleshooting

**Facebook: "Invalid token" error**
- Regenerate Page Access Token
- Ensure permissions include `pages_manage_posts`

**Instagram: "Account not found"**
- Verify Instagram is Business account
- Check connection to MythologIQ Labs Facebook Page

**Content prep: "No frontmatter found"**
- Ensure markdown has `---\n` at start and end of frontmatter
- Check YAML syntax in metadata section

---

## Support

For questions or issues, refer to:
- Instagram setup: `file 'Skills/social-media-automation/INSTAGRAM_SETUP.md'`
- Social content skill: `file 'Skills/social-content/SKILL.md'`
