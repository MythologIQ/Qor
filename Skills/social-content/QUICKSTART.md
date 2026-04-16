# Quick Start: Social Media Automation

## Your Setup

| Platform | How It Works |
|----------|---------------|
| **LinkedIn** | Native scheduling (manual, no cost) |
| **Facebook** | Zo Script → Email → Zapier → Buffer (free) |
| **X/Twitter** | Zo Script → Email → Zapier → Buffer (free) |

## Commands

```bash
# See all your posts
python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --list

# Preview what will be sent to Buffer
python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --preview 2026-02-03-5-reasons-ai-fails.md

# Send post to Zapier → Buffer
python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --send 2026-02-03-5-reasons-ai-fails.md

# Configure your Zapier email (one-time setup)
python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --configure --email YOUR_ZAPIER_EMAIL
```

## One-Time Setup

1. **Create Zap in Zapier:**
   - Trigger: Email by Zapier → New Inbound Email
   - Action: Buffer → Add to Queue
   - Copy your Zapier email address

2. **Configure Script:**
   ```bash
   python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --configure --email YOUR_ZAPIER_EMAIL
   ```

3. **Connect Buffer:**
   - Add your Facebook Page and X accounts to Buffer
   - Create queues for each

4. **Publish:**
   ```bash
   python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --send 2026-02-03-5-reasons-ai-fails.md
   ```

## Task Limits (Free)

Zapier Free = 100 tasks/month
- Each Buffer action = 1 task
- 5 posts/week × 2 platforms = 40 tasks/month ✅

## LinkedIn

LinkedIn doesn't support automation via Zapier/Buffer. Use native scheduling:
1. Go to MythologIQ Labs company page
2. Click "Start a post"
3. Paste your LinkedIn content
4. Use built-in scheduler
