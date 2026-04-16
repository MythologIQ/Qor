# Zapier + Buffer Automation Setup

Complete setup guide for automated social media posting via email.

## Architecture

```
Your Script → Email → Zapier Trigger → Buffer Action → Scheduled Posts
```

## Step 1: Create Zap in Zapier

1. Log into [Zapier](https://zapier.com)
2. Create new Zap
3. **Trigger:** Select "Email by Zapier" → "New Inbound Email"
4. **Action:** Select "Buffer" → "Add to Queue"
5. Connect your Buffer account
6. Choose your queues (Facebook Page, X/Twitter)

## Step 2: Get Your Zapier Email Address

1. After setting up the trigger, Zapier provides a unique email
2. Copy this email (format: `yourname@zapier.zapier.com`)

## Step 3: Add Email to Your Script

Run: `python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --configure --email YOUR_ZAPIER_EMAIL`

## Step 4: Publish Posts

Run: `python3 /home/workspace/Skills/social-content/scripts/zapier_buffer_publisher.py --file posts/your-post.md --send`

The script will:
- Format content for Buffer (Facebook + X)
- Send email to your Zapier address
- Zapier automatically adds posts to Buffer queues

## Usage

| Command | What it does |
|---------|---------------|
| `--list` | List available posts |
| `--preview FILE` | Preview formatted content |
| `--send FILE` | Send to Zapier (triggers Buffer) |
| `--configure --email EMAIL` | Save your Zapier email |

## Task Limits

Zapier Free = 100 tasks/month
- Each Buffer action = 1 task
- 5 posts/week × 2 platforms = 40 tasks/month ✅

LinkedIn is handled separately (native scheduling).
