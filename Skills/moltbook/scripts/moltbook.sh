#!/usr/bin/env bash

set -euo pipefail

CONFIG_FILE="${HOME}/.config/moltbook/credentials.json"
OPENCLAW_AUTH="${HOME}/.openclaw/auth-profiles.json"
API_BASE="https://www.moltbook.com/api/v1"
STATE_DIR="${HOME}/.local/state/moltbook"
REPLIES_LOG="${MOLTBOOK_REPLY_LOG:-${STATE_DIR}/replies.txt}"

COMMAND="${1:-}"
API_KEY="${MOLTBOOK_API_KEY:-}"
AGENT_NAME="${MOLTBOOK_AGENT_NAME:-}"

mkdir -p "$STATE_DIR"

json_string() {
    local value="${1:-}"
    if command -v jq &> /dev/null; then
        jq -Rn --arg value "$value" '$value'
    else
        printf '"%s"' "$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    fi
}

json_payload() {
    local raw="${1:-}"
    if command -v jq &> /dev/null; then
        jq -cn "$raw"
    else
        echo "Error: jq is required to build Moltbook request payloads" >&2
        exit 1
    fi
}

if [[ -z "$API_KEY" && -f "$OPENCLAW_AUTH" ]]; then
    if command -v jq &> /dev/null; then
        API_KEY=$(jq -r '.moltbook.api_key // empty' "$OPENCLAW_AUTH" 2>/dev/null)
        if [[ -z "$AGENT_NAME" ]]; then
            AGENT_NAME=$(jq -r '.moltbook.agent_name // empty' "$OPENCLAW_AUTH" 2>/dev/null)
        fi
    fi
fi

if [[ -z "$API_KEY" && -f "$CONFIG_FILE" ]]; then
    if command -v jq &> /dev/null; then
        API_KEY=$(jq -r '.api_key // empty' "$CONFIG_FILE")
        if [[ -z "$AGENT_NAME" ]]; then
            AGENT_NAME=$(jq -r '.agent_name // empty' "$CONFIG_FILE")
        fi
    else
        API_KEY=$(grep '"api_key"' "$CONFIG_FILE" | sed 's/.*"api_key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        if [[ -z "$AGENT_NAME" ]]; then
            AGENT_NAME=$(grep '"agent_name"' "$CONFIG_FILE" | sed 's/.*"agent_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        fi
    fi
fi

if [[ "$COMMAND" == "config" || -z "$COMMAND" ]]; then
    echo "Config file: ${CONFIG_FILE}"
    echo "Reply log: ${REPLIES_LOG}"
    if [[ -n "$AGENT_NAME" && "$AGENT_NAME" != "null" ]]; then
        echo "Agent name: ${AGENT_NAME}"
    else
        echo "Agent name: not set"
    fi
    if [[ -n "$API_KEY" && "$API_KEY" != "null" && "$API_KEY" != "replace-with-your-moltbook-api-key" ]]; then
        echo "API key: configured"
    else
        echo "API key: not configured"
    fi
    if [[ "$COMMAND" == "config" ]]; then
        exit 0
    fi
fi

if [[ -z "$API_KEY" || "$API_KEY" == "null" || "$API_KEY" == "replace-with-your-moltbook-api-key" ]]; then
    echo "Error: Moltbook credentials not found"
    echo ""
    echo "Option 1 - OpenClaw auth (recommended):"
    echo "  openclaw agents auth add moltbook --token your_api_key"
    echo ""
    echo "Option 2 - Credentials file:"
    echo "  mkdir -p ~/.config/moltbook"
    echo "  echo '{\"api_key\":\"your_key\",\"agent_name\":\"YourName\"}' > ~/.config/moltbook/credentials.json"
    exit 1
fi

api_call() {
    local method=$1
    local endpoint=$2
    local data=${3:-}
    
    if [[ -n "$data" ]]; then
        curl -s -X "$method" "${API_BASE}${endpoint}" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "${API_BASE}${endpoint}" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json"
    fi
}

reply_logged() {
    local post_id="$1"
    [[ -f "$REPLIES_LOG" ]] && grep -Fxq "$post_id" "$REPLIES_LOG"
}

log_reply() {
    local post_id="$1"
    touch "$REPLIES_LOG"
    if ! reply_logged "$post_id"; then
        printf '%s\n' "$post_id" >> "$REPLIES_LOG"
    fi
}

case "$COMMAND" in
    hot)
        limit="${2:-10}"
        echo "Fetching hot posts..."
        api_call GET "/posts?sort=hot&limit=${limit}"
        ;;
    new)
        limit="${2:-10}"
        echo "Fetching new posts..."
        api_call GET "/posts?sort=new&limit=${limit}"
        ;;
    post)
        post_id="$2"
        if [[ -z "$post_id" ]]; then
            echo "Usage: moltbook post POST_ID"
            exit 1
        fi
        api_call GET "/posts/${post_id}"
        ;;
    reply)
        post_id="$2"
        content="$3"
        if [[ -z "$post_id" || -z "$content" ]]; then
            echo "Usage: moltbook reply POST_ID CONTENT"
            exit 1
        fi
        if reply_logged "$post_id"; then
            echo "Skipping reply: post ${post_id} is already logged in ${REPLIES_LOG}"
            exit 0
        fi
        echo "Posting reply..."
        payload=$(jq -cn --arg content "$content" '{content:$content}')
        result=$(api_call POST "/posts/${post_id}/comments" "$payload")
        echo "$result"
        if [[ "$result" == *'"success":true'* ]]; then
            log_reply "$post_id"
        fi
        ;;
    create)
        title="$2"
        content="$3"
        submolt="${4:-29beb7ee-ca7d-4290-9c2f-09926264866f}"
        if [[ -z "$title" || -z "$content" ]]; then
            echo "Usage: moltbook create TITLE CONTENT [SUBMOLT_ID]"
            exit 1
        fi
        echo "Creating post..."
        payload=$(jq -cn --arg title "$title" --arg content "$content" --arg submolt "$submolt" '{title:$title,content:$content,submolt_id:$submolt}')
        api_call POST "/posts" "$payload"
        ;;
    test)
        echo "Testing Moltbook API connection..."
        result=$(api_call GET "/posts?sort=hot&limit=1")
        if [[ "$result" == *"success\":true"* ]]; then
            echo "✅ API connection successful"
            post_count=$(echo "$result" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
            echo "Found $post_count posts in feed"
            exit 0
        else
            echo "❌ API connection failed"
            echo "$result" | head -100
            exit 1
        fi
        ;;
    config)
        exit 0
        ;;
    *)
        echo "Moltbook CLI - Interact with Moltbook social network"
        echo ""
        echo "Usage: moltbook [command] [args]"
        echo ""
        echo "Commands:"
        echo "  hot [limit]              Get hot posts"
        echo "  new [limit]              Get new posts"
        echo "  post ID                  Get specific post"
        echo "  reply POST_ID TEXT       Reply to a post"
        echo "  create TITLE CONTENT     Create new post"
        echo "  test                     Test API connection"
        echo "  config                   Show local config paths"
        echo ""
        echo "Examples:"
        echo "  moltbook hot 5"
        echo "  moltbook reply abc-123 Great post!"
        ;;
esac
