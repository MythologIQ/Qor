#!/usr/bin/env bash
# Qora Thread Processor - Nuanced quarantine: OP quarantined, replies validated

set -euo pipefail

POST_ID="${1:-}"
if [[ -z "$POST_ID" ]]; then
    echo "Usage: qora-process-thread.sh POST_ID"
    exit 1
fi

CONFIG_FILE="${HOME}/.config/moltbook/credentials.json"
API_KEY="${MOLTBOOK_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$CONFIG_FILE" ]]; then
    API_KEY=$(jq -r '.api_key // empty' "$CONFIG_FILE" 2>/dev/null)
fi

API_BASE="https://www.moltbook.com/api/v1"

echo "🦞 Qora analyzing thread: $POST_ID"

# Fetch post
echo "📥 Fetching OP..."
OP=$(curl -s "$API_BASE/posts/$POST_ID" \
    -H "Authorization: Bearer $API_KEY")

OP_TITLE=$(echo "$OP" | jq -r '.post.title // empty')
OP_CONTENT=$(echo "$OP" | jq -r '.post.content // empty' | head -500)
OP_AUTHOR=$(echo "$OP" | jq -r '.post.author.name // empty')
OP_UPVOTES=$(echo "$OP" | jq -r '.post.upvotes // 0')

echo "   Author: $OP_AUTHOR"
echo "   Upvotes: $OP_UPVOTES"

# Fetch comments
echo "📥 Fetching replies..."
COMMENTS=$(curl -s "$API_BASE/posts/$POST_ID/comments?limit=20" \
    -H "Authorization: Bearer $API_KEY")

# Analyze with Qora
node -e "
const fs = require('fs');

// Ingest OP to shadow genome (quarantine)
const opShadowId = processWithGuard({
    text: '$OP_CONTENT'.replace(/'/g, \"\\'\"),
    metadata: { author: '$OP_AUTHOR', upvotes: $OP_UPVOTES }
}, '$POST_ID', '$OP_TITLE');

console.log('🛡️  OP quarantined:', opShadowId);

// Process replies for counter-arguments
const comments = JSON.parse(process.argv[1]).comments || [];
let validated = 0;

for (const reply of comments) {
    const content = reply.content || '';
    const author = reply.author?.name || 'unknown';
    const id = reply.id;
    const upvotes = reply.upvotes || 0;
    
    // Check for counter-argument signals
    const isCounterArg = 
        content.toLowerCase().includes('interface') ||
        content.toLowerCase().includes('locus error') ||
        content.toLowerCase().includes('behavioral consistency') ||
        content.toLowerCase().includes('multi-context');
    
    if (isCounterArg && upvotes > 5) {
        console.log('✅ Validated reply:', author, '(', upvotes, 'upvotes)');
        validated++;
    }
}

console.log('📊 Summary:', validated, 'replies validated for counter-arguments');
" "$COMMENTS"

echo ""
echo "📝 Qora's response strategy:"
echo "   • OP: Quarantined as cautionary tale (confidence 0.15)"
echo "   • Replies: Selectively promoted based on counter-argument quality"
echo "   • Engagement: Stand WITH counter-arguments, not against OP"
