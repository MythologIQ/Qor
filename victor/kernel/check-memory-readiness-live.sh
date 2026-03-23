#!/usr/bin/env bash
set -euo pipefail

cd /home/workspace/Projects/continuous/Victor/kernel

export NEO4J_URI="${NEO4J_URI:-bolt://127.0.0.1:7687}"
export NEO4J_USERNAME="${NEO4J_USERNAME:-neo4j}"
export NEO4J_PASSWORD="${NEO4J_PASSWORD:-victor-memory-dev}"
export NEO4J_DATABASE="${NEO4J_DATABASE:-neo4j}"

bun run readiness:memory-automation
