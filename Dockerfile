# Zo-Qore Production Container
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    bash \
    curl \
    ca-certificates

WORKDIR /app

# Build stage
FROM base AS builder

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY runtime ./runtime
COPY zo ./zo
COPY policy ./policy
COPY contracts ./contracts

# Build the project
RUN npm run build

# Production stage
FROM base AS production

# Create non-root user
RUN addgroup -g 1001 -S qore && \
    adduser -S qore -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/policy/definitions ./policy/definitions

# Create data directory with proper permissions
RUN mkdir -p /app/data && \
    chown -R qore:qore /app

# Switch to non-root user
USER qore

# Environment variables
ENV NODE_ENV=production \
    QORE_DATA_DIR=/app/data \
    QORE_LOG_LEVEL=info \
    PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3000

# Start the service
CMD ["node", "dist/runtime/service/start.js"]
