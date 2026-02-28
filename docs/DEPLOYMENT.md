# Zo-Qore Deployment Guide

## Quick Start

### Docker Deployment (Recommended)

```bash
# Build and run with docker-compose
npm run docker:build
npm run docker:run

# Check status
npm run docker:logs

# Health check
curl http://localhost:3000/health
```

### Manual Deployment

```bash
# Install dependencies
npm ci --omit=dev

# Build the project
npm run build

# Start the service
npm run start:standalone
```

## Production Deployment

### Prerequisites

- Node.js 20+
- Docker and Docker Compose (for containerized deployment)
- SQLite3 command-line tools (for backups)
- 2GB+ RAM recommended
- 10GB+ disk space for data and backups

### Environment Variables

```bash
# Service Configuration
NODE_ENV=production
PORT=3000
QORE_DATA_DIR=/app/data
QORE_LOG_LEVEL=info

# Security (Optional)
RATE_LIMIT_PRESET=standard  # strict|standard|relaxed
SECURITY_HEADERS_PRESET=standard  # strict|standard|relaxed|apiOnly
```

### Deployment Steps

#### 1. Build Docker Image

```bash
docker build -t zo-qore:latest .
```

The Dockerfile includes:
- Multi-stage build for smaller image size
- Non-root user (qore:1001) for security
- Health checks built-in
- Automatic dependency installation

#### 2. Deploy with Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### 3. Deploy with Bash Script

```bash
# Deploy to production
./scripts/deploy.sh production

# Deploy to staging
./scripts/deploy.sh staging
```

The deploy script:
- Builds fresh Docker image
- Stops old container gracefully
- Starts new container
- Waits for health check confirmation
- Shows recent logs

### Health Monitoring

Zo-Qore provides three health endpoints:

#### `/health` - Full Health Check
Returns overall system health including memory and database status.

```bash
curl http://localhost:3000/health | jq
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-28T20:00:00.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "checks": {
    "memory": {
      "status": "pass",
      "used": 52428800,
      "limit": 134217728
    },
    "database": {
      "status": "pass"
    }
  }
}
```

Status codes:
- `200` - Healthy
- `503` - Degraded or Unhealthy

#### `/readiness` - Readiness Probe
Checks if service is ready to accept traffic (for Kubernetes).

```bash
curl http://localhost:3000/readiness
```

#### `/liveness` - Liveness Probe
Checks if service is alive (not deadlocked).

```bash
curl http://localhost:3000/liveness
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zo-qore
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: zo-qore
        image: zo-qore:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: QORE_DATA_DIR
          value: "/app/data"
        livenessProbe:
          httpGet:
            path: /liveness
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /readiness
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: qore-data
```

## Operations

### Database Migrations

```bash
# Check migration status
npm run ops:migrate status

# Apply all pending migrations
npm run ops:migrate up

# Rollback last migration
npm run ops:migrate down

# Rollback last 3 migrations
npm run ops:migrate down 3

# Create new migration
npm run ops:migrate create add_user_preferences
```

Migration files are stored in `migrations/` directory with the format:
`{timestamp}_{name}.sql`

### Backup & Restore

```bash
# Create backup (compressed)
npm run ops:backup create

# Create uncompressed backup
npm run ops:backup create --no-compress

# List all backups
npm run ops:backup list

# Restore from backup
npm run ops:backup restore backup-2026-02-28T20-00-00-000Z.db.gz

# Clean old backups (keep last 7)
npm run ops:backup clean 7
```

#### Scheduled Backups

Backups can be automated in production:

```typescript
import { scheduleBackup } from "./runtime/ops/backup";

// Backup every 24 hours, keep last 7 backups
await scheduleBackup(
  "/app/data/qore.db",
  "/app/data/backups",
  24,  // interval in hours
  7    // number of backups to keep
);
```

### Monitoring

#### Metrics Endpoint

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# JSON metrics
curl http://localhost:3000/metrics/json
```

Available metrics:
- `http_requests_total` - Total HTTP requests by method/path/status
- `http_request_duration_seconds` - Request duration histogram
- `planning_projects_total` - Total planning domain projects
- `planning_thoughts_total` - Total thoughts created
- `store_operations_total` - Store operations by operation type
- `circuit_breaker_state` - Current circuit breaker state
- `retry_attempts_total` - Total retry attempts

#### Log Aggregation

Logs are written to stdout/stderr and can be collected with standard tools:

```bash
# Docker logs
docker logs -f zo-qore

# With log driver
docker run \
  --log-driver=syslog \
  --log-opt syslog-address=udp://logs.example.com:514 \
  zo-qore:latest
```

## Security

### Rate Limiting

Three presets available:
- `strict`: 10 requests/minute
- `standard`: 60 requests/minute (default)
- `relaxed`: 300 requests/minute

Configure via environment variable:
```bash
RATE_LIMIT_PRESET=strict
```

### Security Headers

Four presets available:
- `strict`: Maximum security (recommended for production)
- `standard`: Balanced security (default)
- `relaxed`: Minimal restrictions
- `apiOnly`: API-optimized headers

Configure via environment variable:
```bash
SECURITY_HEADERS_PRESET=strict
```

### Input Validation

All API inputs are validated and sanitized:
- XSS prevention
- Path traversal protection
- Type validation
- Schema enforcement

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker logs zo-qore

# Check health endpoint
curl http://localhost:3000/health

# Verify database
sqlite3 /app/data/qore.db "PRAGMA integrity_check;"
```

### High Memory Usage

```bash
# Check current memory status
curl http://localhost:3000/health | jq '.checks.memory'

# Adjust container memory limit
docker run -m 1g zo-qore:latest
```

### Database Corruption

```bash
# Run integrity check
sqlite3 /app/data/qore.db "PRAGMA integrity_check;"

# Restore from backup
npm run ops:backup restore backup-2026-02-28T20-00-00-000Z.db.gz

# Rebuild database with VACUUM
sqlite3 /app/data/qore.db "VACUUM;"
```

### Migration Failures

```bash
# Check migration status
npm run ops:migrate status

# Rollback failed migration
npm run ops:migrate down 1

# Fix migration SQL and retry
npm run ops:migrate up
```

## Performance Tuning

### Docker Resource Limits

```yaml
# docker-compose.yml
services:
  zo-qore:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### SQLite Optimization

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;

-- Increase cache size (in pages)
PRAGMA cache_size=-64000;  -- 64MB

-- Optimize on startup
PRAGMA optimize;
```

## Monitoring Integration

### Prometheus

Add Zo-Qore to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'zo-qore'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import the provided Grafana dashboard template from `docs/grafana-dashboard.json` for pre-configured visualizations.

## Rollback Procedures

### Quick Rollback

```bash
# Stop current version
docker stop zo-qore

# Start previous version
docker run -d \
  --name zo-qore \
  -p 3000:3000 \
  -v qore-data:/app/data \
  zo-qore:previous
```

### Database Rollback

```bash
# Restore from backup before upgrade
npm run ops:backup restore backup-before-upgrade.db.gz

# Rollback migrations
npm run ops:migrate down 3
```

## Upgrade Procedures

1. **Create backup**
   ```bash
   npm run ops:backup create
   ```

2. **Check migration status**
   ```bash
   npm run ops:migrate status
   ```

3. **Deploy new version**
   ```bash
   npm run ops:deploy production
   ```

4. **Apply migrations**
   ```bash
   npm run ops:migrate up
   ```

5. **Verify health**
   ```bash
   curl http://localhost:3000/health
   ```

6. **Monitor logs**
   ```bash
   npm run docker:logs
   ```
