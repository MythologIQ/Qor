#!/usr/bin/env bash
set -euo pipefail

# Victor Kernel - Zo Deployment Script
# Deploy Victor as a deterministic service in Zo ecosystem

echo "=== Victor Kernel Deployment ==="
echo "Mode: Deterministic (no LLM dependency for core functions)"
echo ""

if [[ -z "${NEO4J_PASSWORD:-}" ]]; then
  echo "NEO4J_PASSWORD is required."
  echo "Start Neo4j first and export NEO4J_PASSWORD before deploying Victor."
  exit 1
fi

# Configuration
VICTOR_LABEL="${VICTOR_LABEL:-victor-kernel}"
VICTOR_PORT="${VICTOR_PORT:-9500}"
NEO4J_URI="${NEO4J_URI:-neo4j://127.0.0.1:7687}"
NEO4J_USERNAME="${NEO4J_USERNAME:-neo4j}"
NEO4J_DATABASE="${NEO4J_DATABASE:-neo4j}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
OPENAI_EMBEDDING_MODEL="${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}"
OPENAI_EMBEDDING_DIMENSIONS="${OPENAI_EMBEDDING_DIMENSIONS:-1536}"
WORKDIR="$(pwd)"

EMBEDDINGS_STATUS="disabled"
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  EMBEDDINGS_STATUS="enabled"
fi

echo "Configuration:"
echo "  Label: $VICTOR_LABEL"
echo "  Port: $VICTOR_PORT"
echo "  Directory: $WORKDIR"
echo "  Neo4j URI: $NEO4J_URI"
echo "  Neo4j User: $NEO4J_USERNAME"
echo "  Neo4j DB: $NEO4J_DATABASE"
echo "  Embeddings: $EMBEDDINGS_STATUS"
echo ""

# Install dependencies
echo "Installing dependencies..."
bun install

# Deploy service
echo ""
echo "Registering Victor service with Zo..."
register_user_service \
  --label "$VICTOR_LABEL" \
  --protocol http \
  --local_port "$VICTOR_PORT" \
  --entrypoint "bun run server.ts" \
  --env_vars "NEO4J_URI=$NEO4J_URI
NEO4J_USERNAME=$NEO4J_USERNAME
NEO4J_PASSWORD=$NEO4J_PASSWORD
NEO4J_DATABASE=$NEO4J_DATABASE
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_BASE_URL=$OPENAI_BASE_URL
OPENAI_EMBEDDING_MODEL=$OPENAI_EMBEDDING_MODEL
OPENAI_EMBEDDING_DIMENSIONS=$OPENAI_EMBEDDING_DIMENSIONS" \
  --workdir "$WORKDIR"

echo ""
echo "=== Victor Kernel Deployed ==="
echo ""
echo "Service Information:"
echo "  Label: $VICTOR_LABEL"
echo "  Local URL: http://127.0.0.1:$VICTOR_PORT"
echo "  Public URL: https://${VICTOR_LABEL}-frostwulf.zocomputer.io"
echo ""
echo "API Endpoints:"
echo "  Health:  GET  /health"
echo "  Memory:  GET  /api/victor/memory/status"
echo "  Ingest:  POST /api/victor/memory/ingest"
echo "  Query:   POST /api/victor/memory/query"
echo "  Process: POST /api/victor/process"
echo "  Tasks:   GET/POST /api/tasks"
echo "  Stance:  POST /api/victor/stance"
echo "  Audit:   GET /api/audit"
echo ""
echo "Victor operates in deterministic mode - rules are evaluated without LLM"
echo "The memory kernel requires Neo4j connectivity before startup"
echo "Vector retrieval is enabled only when OPENAI_API_KEY is configured"
