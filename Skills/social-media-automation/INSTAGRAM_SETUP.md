# Instagram Business Account Setup Guide

To post to Instagram via API, you need a **Business Account** (not personal).

---

## Why Business Account?

Only Instagram Business accounts can access the Graph API for posting. Personal accounts cannot be automated.

---

## Setup Checklist

### 1. Connect to Facebook Page
Instagram Business accounts must be linked to a Facebook Page.

**Steps:**
1. Open Instagram app on your phone
2. Go to your profile → Settings (⋮) → **Account type and tools**
3. Tap **Switch to Professional Account**
4. Choose **Business** (not Creator)
5. Select a category: "Technology" or "Software Company"
6. Enter contact email
7. Tap **Done**

### 2. Connect to Facebook Page
Still in Instagram settings:

1. Go to **Settings** → **Linked Accounts**
2. Tap **Facebook**
3. Sign in to your Facebook account
4. Select **MythologIQ Labs** page
5. Confirm connection

### 3. Get Instagram Business ID
You'll need your Instagram Business Account ID for the API.

**Option A: Via Facebook Business Manager (Easiest)**
1. Go to https://business.facebook.com/settings
2. Click **Instagram Accounts** in left sidebar
3. Find your account — the ID is displayed

**Option B: Via API (Once you have token)**
```
GET https://graph.facebook.com/v19.0/me?fields=instagram_business_account&access_token=YOUR_TOKEN
```

### 4. Verify Business Status
In Instagram app → Settings → **Account type and tools**
You should see: "Account type: Business Account"

---

## For API Posting

Once your account is Business:

1. **Facebook App:** Create at https://developers.facebook.com/apps/
   - Type: Business
   - Add product: **Instagram Graph API**

2. **Permissions needed:**
   - `instagram_basic` — Read account info
   - `instagram_content_publish` — Create posts
   - `pages_show_list` — List your pages
   - `pages_read_engagement` — Read engagement metrics

3. **Get Page Access Token:**
   - In your Facebook app → Tools → Graph API Explorer
   - Select your page and permissions
   - Generate token
   - This token will also work for Instagram

4. **Environment variables for Zo:**
   ```
   FACEBOOK_PAGE_ACCESS_TOKEN=<your_page_token>
   FACEBOOK_PAGE_ID=mythologiqlabs
   INSTAGRAM_BUSINESS_ID=<your_instagram_id>
   ```

---

## Troubleshooting

**"Account not found" error**
- Verify you're connected to MythologIQ Labs Facebook page
- Check that your Instagram account type is "Business" not "Creator"

**"Permission denied" error**
- Ensure `instagram_content_publish` permission is in your app
- Use a long-lived Page Access Token (not short-lived user token)

**"Media not found" error**
- Images must be uploaded via API first, then published
- Video uploads require additional steps

---

## Next Steps

After setup, use the Instagram poster script:
```bash
python3 scripts/instagram_poster.py --message "Your post" --image /path/to/image.jpg
```

See `file 'Skills/social-media-automation/SKILL.md'` for full documentation.
