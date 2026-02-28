#!/bin/bash
set -e

# Zo-Qore Deployment Script
# Usage: ./scripts/deploy.sh [production|staging]

ENVIRONMENT=${1:-production}
DOCKER_IMAGE="zo-qore:latest"
CONTAINER_NAME="zo-qore-${ENVIRONMENT}"

echo "🚀 Deploying Zo-Qore to ${ENVIRONMENT}..."

# Build Docker image
echo "📦 Building Docker image..."
docker build -t ${DOCKER_IMAGE} .

# Stop existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "🛑 Stopping existing container..."
    docker stop ${CONTAINER_NAME} || true
    docker rm ${CONTAINER_NAME} || true
fi

# Run new container
echo "🏃 Starting new container..."
docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p 3000:3000 \
    -v qore-data-${ENVIRONMENT}:/app/data \
    -v qore-logs-${ENVIRONMENT}:/app/logs \
    -e NODE_ENV=${ENVIRONMENT} \
    -e QORE_LOG_LEVEL=info \
    ${DOCKER_IMAGE}

# Wait for health check
echo "⏳ Waiting for service to be healthy..."
sleep 5

for i in {1..30}; do
    if docker exec ${CONTAINER_NAME} node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" 2>/dev/null; then
        echo "✅ Service is healthy!"
        docker logs --tail 20 ${CONTAINER_NAME}
        echo ""
        echo "🎉 Deployment complete!"
        echo "   Container: ${CONTAINER_NAME}"
        echo "   Logs: docker logs -f ${CONTAINER_NAME}"
        echo "   Health: curl http://localhost:3000/health"
        exit 0
    fi
    echo "   Attempt $i/30..."
    sleep 2
done

echo "❌ Health check failed!"
docker logs --tail 50 ${CONTAINER_NAME}
exit 1
