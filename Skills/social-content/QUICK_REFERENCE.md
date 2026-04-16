# Social Media Automation — Quick Reference

## Your Current Posts

| Post | Status | Scheduled | Platforms |
|------|--------|-----------|------------|
| 5 reasons AI fails | draft | Feb 3, 7am | LinkedIn, X, Facebook |
| AI aimed wrong problem | scheduled | Jan 30, 2pm | LinkedIn, X, Facebook |
| ADHD diagnosis | draft | — | LinkedIn, Instagram, Facebook |

## Common Commands

```bash
# List all posts
cd /home/workspace/Skills/social-content
python3 scripts/zapier_buffer_publisher.py --list

# Preview a post (don't send)
python3 scripts/zapier_buffer_publisher.py posts/2026-02-03-5-reasons-ai-fails.md --preview

# Publish to Buffer via Zapier
python3 scripts/zapier_buffer_publisher.py posts/2026-02-03-5-reasons-ai-fails.md

# Publish all scheduled posts
python3 scripts/zapier_buffer_publisher.py --all-scheduled

# Create a new post from template
python3 scripts/social_automation.py create "Your Title" list --date 2026-02-04
```

## Post Content Structure

```markdown
---
title: "Post title"
type: "list|story|contrarian|howto|promo"
primary_platform: "linkedin"
cross_post_to: ["x", "facebook", "instagram"]
scheduled_date: "2026-02-03"
scheduled_time: "07:00"
image: "generated/your-image.png"
status: "draft|scheduled|published"
---

## LinkedIn
[Your LinkedIn content here]

## X/Twitter
[Your Twitter thread here]

## Facebook
[Your Facebook content here]

## Instagram
[Your Instagram caption here (carousel/slides format)]
```

## Zapier Setup Steps

1. **Create Zapier account** → https://zapier.com (free)
2. **Create Zap:** Webhooks by Zapier (trigger) → Buffer (action: "Add to Buffer")
3. **Connect Buffer account** in Zapier
4. **Copy webhook URL** from Zapier
5. **Set environment variable:**
   ```bash
   export ZAPIER_BUFFER_WEBHOOK_URL="https://hooks.zapier.com/hooks/catch/xxxxx/xxxxx/"
   ```
6. **Test automation:**
   ```bash
   python3 scripts/zapier_buffer_publisher.py posts/your-post.md
   ```

Full setup guide: `file 'Skills/social-content/ZAPIER_BUFFER_SETUP.md'`

## Buffer Settings

- **Account:** https://app.buffer.com
- **Connected Channels:** LinkedIn (MythologIQ Labs), Facebook (MythologIQ Labs), X/Twitter
- **Queue:** https://publish.buffer.com
- **Free limits:** 10 scheduled posts, 3 channels

## Image Assets

Generated images stored in: `file 'Skills/social-content/generated/'`

To include an image in a post:
1. Add `image: "generated/your-image.png"` to frontmatter
2. Ensure image exists in `generated/` folder
3. Buffer-Zapier integration supports image uploads (see Buffer docs)

## Weekly Workflow (Recommended)

**Monday:**
- Plan 3-5 post topics
- Use `python3 scripts/generate_weekly_plan.py --export`

**Tuesday-Thursday:**
- Write content in markdown files (`posts/YYYY-MM-DD-title.md`)
- Preview with `--preview` flag
- Publish to Buffer via Zapier

**Friday:**
- Review scheduled posts in Buffer
- Adjust timing if needed
- Generate next week's plan

## Troubleshooting

**Script can't find post:**
- Use full path: `python3 scripts/zapier_buffer_publisher.py /home/workspace/Skills/social-content/posts/your-post.md`
- Or run from `social-content` directory

**Webhook not triggering Zapier:**
- Check `ZAPIER_BUFFER_WEBHOOK_URL` is set: `echo $ZAPIER_BUFFER_WEBHOOK_URL`
- Verify Zap is ON in Zapier dashboard
- Check Zapier task history

**Buffer not receiving posts:**
- Verify Buffer account connected in Zapier
- Check Buffer profile selected in Zap action
- Test Zap manually in Zapier

## Platform-Specific Notes

### LinkedIn (Company Page)
- Post as MythologIQ Labs
- Character limit: 3,000
- Rich text supported (bold, bullet points)
- Native scheduling available if needed

### Facebook (Page)
- Post as MythologIQ Labs page
- Character limit: 63,206
- Image posts perform well
- Native scheduling available

### X/Twitter
- Character limit: 280 (use thread format for longer)
- Hashtags: #AI #Neurodiversity #MythologIQ
- Best times: 9am, 2pm, 8pm ET

### Instagram
- Image-first platform (carousel works well)
- Character limit: 2,200 (caption)
- Use carousel format for list-type posts
- Alt text for accessibility

## Support & Documentation

- **Setup Guide:** `file 'Skills/social-content/ZAPIER_BUFFER_SETUP.md'`
- **Main Documentation:** `file 'Skills/social-content/README.md'`
- **Skill Definition:** `file 'Skills/social-content/SKILL.md'`
