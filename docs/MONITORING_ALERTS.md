# Monitoring Alert Definitions

**Version:** 1.0  
**Date:** February 28, 2026  
**System:** Zo-Qore Runtime & Operations

---

## Overview

This document defines monitoring alerts, thresholds, and escalation procedures for the Zo-Qore system. Alerts are designed to detect issues before they impact users and enable proactive incident response.

---

## Alert Categories

### Critical Alerts (P0)
- **Response Time:** Immediate (< 5 minutes)
- **Escalation:** Page on-call engineer
- **Examples:** Service down, data loss, security breach

### High Priority Alerts (P1)
- **Response Time:** < 15 minutes
- **Escalation:** Notify on-call engineer
- **Examples:** Performance degradation, high error rate, resource exhaustion

### Medium Priority Alerts (P2)
- **Response Time:** < 1 hour
- **Escalation:** Create incident ticket
- **Examples:** Elevated error rate, approaching capacity, failed backup

### Low Priority Alerts (P3)
- **Response Time:** Next business day
- **Escalation:** Log for review
- **Examples:** Minor performance issues, configuration warnings

---

## Health Check Alerts

### Service Unavailable
**Metric:** `http_health_status`  
**Condition:** Health check returns non-200 status  
**Threshold:** 3 consecutive failures  
**Severity:** P0 - Critical  
**Action:** Page on-call immediately

**Alert Rule (Prometheus):**
```yaml
- alert: ServiceUnavailable
  expr: probe_success{job="zo-qore"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Zo-Qore service is unavailable"
    description: "Health check has failed for {{ $value }} consecutive checks"
```

**Runbook:** [Service Down Runbook](#service-down-runbook)

### Service Degraded
**Metric:** `/health` response  
**Condition:** `status != "healthy"`  
**Threshold:** Any degraded component  
**Severity:** P1 - High  
**Action:** Notify on-call

**Alert Rule (Prometheus):**
```yaml
- alert: ServiceDegraded
  expr: health_status{status!="healthy"} == 1
  for: 5m
  labels:
    severity: high
  annotations:
    summary: "Zo-Qore service is degraded"
    description: "{{ $labels.component }} is unhealthy: {{ $labels.reason }}"
```

**Runbook:** [Service Degraded Runbook](#service-degraded-runbook)

---

## Memory Alerts

### High Memory Usage
**Metric:** `process_resident_memory_bytes`  
**Condition:** Memory usage > 80% of container limit  
**Threshold:** Sustained for 10 minutes  
**Severity:** P1 - High  
**Action:** Investigate memory leak, consider scaling

**Alert Rule (Prometheus):**
```yaml
- alert: HighMemoryUsage
  expr: (process_resident_memory_bytes / container_memory_limit_bytes) > 0.8
  for: 10m
  labels:
    severity: high
  annotations:
    summary: "High memory usage detected"
    description: "Memory usage is {{ $value | humanizePercentage }} of container limit"
```

**Runbook:** [High Memory Runbook](#high-memory-runbook)

### Critical Memory Usage
**Metric:** `process_resident_memory_bytes`  
**Condition:** Memory usage > 95% of container limit  
**Threshold:** Sustained for 2 minutes  
**Severity:** P0 - Critical  
**Action:** Immediate restart or scale-up

**Alert Rule (Prometheus):**
```yaml
- alert: CriticalMemoryUsage
  expr: (process_resident_memory_bytes / container_memory_limit_bytes) > 0.95
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Critical memory usage - OOM imminent"
    description: "Memory usage is {{ $value | humanizePercentage }} - restart required"
```

**Runbook:** [Critical Memory Runbook](#critical-memory-runbook)

---

## HTTP Request Alerts

### High Error Rate
**Metric:** `http_requests_total{status=~"5.."}`  
**Condition:** Error rate > 5% of total requests  
**Threshold:** Over 5-minute window  
**Severity:** P1 - High  
**Action:** Investigate errors, check logs

**Alert Rule (Prometheus):**
```yaml
- alert: HighErrorRate
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
    ) > 0.05
  for: 5m
  labels:
    severity: high
  annotations:
    summary: "High HTTP error rate detected"
    description: "Error rate is {{ $value | humanizePercentage }} over last 5 minutes"
```

**Runbook:** [High Error Rate Runbook](#high-error-rate-runbook)

### Elevated 4xx Rate
**Metric:** `http_requests_total{status=~"4.."}`  
**Condition:** 4xx rate > 20% of total requests  
**Threshold:** Over 10-minute window  
**Severity:** P2 - Medium  
**Action:** Check for client issues or API changes

**Alert Rule (Prometheus):**
```yaml
- alert: Elevated4xxRate
  expr: |
    (
      sum(rate(http_requests_total{status=~"4.."}[10m]))
      /
      sum(rate(http_requests_total[10m]))
    ) > 0.20
  for: 10m
  labels:
    severity: medium
  annotations:
    summary: "Elevated 4xx error rate"
    description: "Client error rate is {{ $value | humanizePercentage }}"
```

**Runbook:** [Client Error Runbook](#client-error-runbook)

### Slow Response Time
**Metric:** `http_request_duration_seconds`  
**Condition:** P95 latency > 2 seconds  
**Threshold:** Over 5-minute window  
**Severity:** P1 - High  
**Action:** Investigate slow queries, check database

**Alert Rule (Prometheus):**
```yaml
- alert: SlowResponseTime
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
    ) > 2
  for: 5m
  labels:
    severity: high
  annotations:
    summary: "Slow API response times"
    description: "P95 latency is {{ $value }}s (threshold: 2s)"
```

**Runbook:** [Slow Response Runbook](#slow-response-runbook)

---

## Circuit Breaker Alerts

### Circuit Breaker Open
**Metric:** `circuit_breaker_state`  
**Condition:** Circuit breaker in OPEN state  
**Threshold:** Immediate  
**Severity:** P1 - High  
**Action:** Investigate dependent service failures

**Alert Rule (Prometheus):**
```yaml
- alert: CircuitBreakerOpen
  expr: circuit_breaker_state{state="OPEN"} == 1
  for: 1m
  labels:
    severity: high
  annotations:
    summary: "Circuit breaker is open for {{ $labels.circuit }}"
    description: "Dependent service {{ $labels.circuit }} is failing"
```

**Runbook:** [Circuit Breaker Runbook](#circuit-breaker-runbook)

---

## Database Alerts

### Database Unavailable
**Metric:** Database connection check  
**Condition:** Cannot connect to database  
**Threshold:** 3 consecutive failures  
**Severity:** P0 - Critical  
**Action:** Check database process, restore from backup if needed

**Alert Rule (Prometheus):**
```yaml
- alert: DatabaseUnavailable
  expr: database_connection_status == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Database connection failed"
    description: "Cannot connect to SQLite database"
```

**Runbook:** [Database Unavailable Runbook](#database-unavailable-runbook)

### High Store Operation Errors
**Metric:** `store_operations_total{status="error"}`  
**Condition:** Error rate > 1% of total operations  
**Threshold:** Over 5-minute window  
**Severity:** P1 - High  
**Action:** Check database integrity, review error logs

**Alert Rule (Prometheus):**
```yaml
- alert: HighStoreErrors
  expr: |
    (
      sum(rate(store_operations_total{status="error"}[5m]))
      /
      sum(rate(store_operations_total[5m]))
    ) > 0.01
  for: 5m
  labels:
    severity: high
  annotations:
    summary: "High database operation error rate"
    description: "Store error rate is {{ $value | humanizePercentage }}"
```

**Runbook:** [Store Error Runbook](#store-error-runbook)

---

## Rate Limiting Alerts

### High Rate Limit Rejections
**Metric:** `http_requests_total{status="429"}`  
**Condition:** > 100 429 responses per minute  
**Threshold:** Sustained for 5 minutes  
**Severity:** P2 - Medium  
**Action:** Review rate limit settings, check for DoS

**Alert Rule (Prometheus):**
```yaml
- alert: HighRateLimitRejections
  expr: rate(http_requests_total{status="429"}[1m]) > 100
  for: 5m
  labels:
    severity: medium
  annotations:
    summary: "High rate of rate limit rejections"
    description: "{{ $value }} requests/min being rate limited"
```

**Runbook:** [Rate Limiting Runbook](#rate-limiting-runbook)

---

## Backup Alerts

### Backup Failed
**Metric:** Backup script exit code  
**Condition:** Non-zero exit code  
**Threshold:** Any failure  
**Severity:** P2 - Medium  
**Action:** Investigate backup failure, ensure disk space

**Alert Rule (cron + monitoring):**
```bash
# In backup cron job
if ! npm run ops:backup create; then
  curl -X POST https://alerts.example.com/webhook \
    -d '{"alert":"BackupFailed","severity":"medium"}'
fi
```

**Runbook:** [Backup Failure Runbook](#backup-failure-runbook)

### No Recent Backup
**Metric:** File modification time of latest backup  
**Condition:** No backup in last 48 hours  
**Threshold:** 48 hours  
**Severity:** P2 - Medium  
**Action:** Check backup cron job, manual backup if needed

**Runbook:** [Missing Backup Runbook](#missing-backup-runbook)

---

## Runbooks

### Service Down Runbook

1. **Verify the issue**
   ```bash
   curl http://localhost:3000/health
   docker ps | grep zo-qore
   ```

2. **Check logs**
   ```bash
   docker logs zo-qore --tail 100
   ```

3. **Check container status**
   ```bash
   docker inspect zo-qore
   ```

4. **Restart service if needed**
   ```bash
   docker restart zo-qore
   # Wait for health check
   sleep 10
   curl http://localhost:3000/health
   ```

5. **If restart fails, redeploy**
   ```bash
   ./scripts/deploy.sh production
   ```

6. **Create incident** if issue persists

### Service Degraded Runbook

1. **Check specific component**
   ```bash
   curl http://localhost:3000/health | jq '.checks'
   ```

2. **For memory issues:**
   - See [High Memory Runbook](#high-memory-runbook)

3. **For database issues:**
   - See [Database Unavailable Runbook](#database-unavailable-runbook)

4. **Monitor recovery**
   ```bash
   watch -n 5 'curl -s http://localhost:3000/health | jq .status'
   ```

### High Memory Runbook

1. **Check current memory usage**
   ```bash
   curl http://localhost:3000/health | jq '.checks.memory'
   docker stats zo-qore --no-stream
   ```

2. **Review memory trends**
   - Check Grafana dashboard for memory growth pattern
   - Look for memory leaks (steady growth over time)

3. **Identify high-memory operations**
   ```bash
   # Check recent logs for large operations
   docker logs zo-qore --tail 1000 | grep -i "large\|memory\|limit"
   ```

4. **Temporary mitigation:**
   ```bash
   # Restart to clear memory
   docker restart zo-qore
   ```

5. **Long-term fix:**
   - Scale up container memory limit
   - Investigate memory leak in code
   - Implement pagination for large queries

### Critical Memory Runbook

1. **Immediate action - restart service**
   ```bash
   docker restart zo-qore
   ```

2. **Scale up memory limit**
   ```yaml
   # docker-compose.yml
   services:
     zo-qore:
       deploy:
         resources:
           limits:
             memory: 4G  # Increase from 2G
   ```

3. **Redeploy with new limits**
   ```bash
   docker-compose up -d
   ```

4. **Create P0 incident** for investigation

### High Error Rate Runbook

1. **Identify error types**
   ```bash
   # Check recent errors
   docker logs zo-qore --tail 500 | grep ERROR
   
   # Query metrics by status code
   curl http://localhost:3000/metrics | grep http_requests_total
   ```

2. **Check for specific failing endpoints**
   ```bash
   # Look for patterns in error logs
   docker logs zo-qore --tail 1000 | grep "500\|502\|503" | awk '{print $7}' | sort | uniq -c
   ```

3. **Common causes:**
   - Database connection issues → See [Database Unavailable Runbook](#database-unavailable-runbook)
   - Circuit breaker open → See [Circuit Breaker Runbook](#circuit-breaker-runbook)
   - Recent deployment → Rollback if needed

4. **Rollback if recent deployment**
   ```bash
   # Restore previous version
   docker stop zo-qore
   docker run -d --name zo-qore -p 3000:3000 -v qore-data:/app/data zo-qore:previous
   ```

### Client Error Runbook

1. **Identify 4xx error patterns**
   ```bash
   # Group by status code
   docker logs zo-qore --tail 1000 | grep '"status":4' | \
     jq -r '.status' | sort | uniq -c
   ```

2. **Common 4xx errors:**
   - **400 Bad Request**: Input validation failure → Check API changes
   - **401 Unauthorized**: Auth issues → Verify API keys
   - **404 Not Found**: Missing endpoints → Check API changes
   - **429 Too Many Requests**: Rate limiting → See [Rate Limiting Runbook](#rate-limiting-runbook)

3. **Check for API contract changes**
   ```bash
   git log --oneline --grep="API\|endpoint" -n 20
   ```

4. **Review input validation logs**
   ```bash
   docker logs zo-qore | grep "validation failed"
   ```

### Slow Response Runbook

1. **Identify slow endpoints**
   ```bash
   # Check P95 latency by path
   curl http://localhost:3000/metrics | grep http_request_duration_seconds
   ```

2. **Check database performance**
   ```bash
   # SQLite query performance
   sqlite3 /app/data/qore.db "EXPLAIN QUERY PLAN SELECT * FROM projects;"
   
   # Check for missing indexes
   sqlite3 /app/data/qore.db ".schema"
   ```

3. **Common causes:**
   - Missing database indexes
   - Large result sets without pagination
   - N+1 query problems
   - Lock contention

4. **Temporary mitigation:**
   ```bash
   # Optimize database
   sqlite3 /app/data/qore.db "PRAGMA optimize; VACUUM;"
   ```

5. **Long-term fixes:**
   - Add database indexes
   - Implement query result caching
   - Add pagination to large queries

### Circuit Breaker Runbook

1. **Identify failing dependency**
   ```bash
   curl http://localhost:3000/metrics | grep circuit_breaker_state
   ```

2. **Check circuit breaker details**
   ```bash
   # Review recent circuit breaker transitions
   docker logs zo-qore | grep "circuit breaker"
   ```

3. **Verify dependency health**
   - Check dependent service status
   - Test connectivity manually
   - Review dependency logs

4. **Reset circuit breaker (if dependency recovered)**
   ```bash
   # Circuit breaker will auto-recover after timeout
   # Monitor for HALF_OPEN → CLOSED transition
   ```

5. **If dependency remains unhealthy:**
   - Escalate to dependency owner
   - Consider fallback mechanisms
   - Update circuit breaker thresholds if needed

### Database Unavailable Runbook

1. **Check database file**
   ```bash
   # Verify database exists and is readable
   ls -lh /app/data/qore.db
   sqlite3 /app/data/qore.db "PRAGMA integrity_check;"
   ```

2. **Check file permissions**
   ```bash
   # Ensure qore user can access database
   docker exec zo-qore ls -l /app/data/qore.db
   ```

3. **Verify database integrity**
   ```bash
   sqlite3 /app/data/qore.db "PRAGMA quick_check;"
   ```

4. **If database is corrupted:**
   ```bash
   # Restore from latest backup
   npm run ops:backup list
   npm run ops:backup restore <latest-backup>
   ```

5. **If no backup available:**
   ```bash
   # Attempt recovery
   sqlite3 /app/data/qore.db ".recover" | sqlite3 /app/data/qore-recovered.db
   ```

### Store Error Runbook

1. **Identify error patterns**
   ```bash
   # Check store operation errors
   docker logs zo-qore | grep "store operation failed"
   ```

2. **Common store errors:**
   - SQLITE_BUSY: Lock contention → Increase timeout
   - SQLITE_CORRUPT: Database corruption → Restore from backup
   - SQLITE_FULL: Disk full → Free up space

3. **Check disk space**
   ```bash
   df -h /app/data
   ```

4. **For lock contention:**
   ```bash
   # Enable WAL mode for better concurrency
   sqlite3 /app/data/qore.db "PRAGMA journal_mode=WAL;"
   ```

5. **Monitor recovery**
   ```bash
   curl http://localhost:3000/metrics | grep store_operations_total
   ```

### Rate Limiting Runbook

1. **Identify rate-limited clients**
   ```bash
   # Check rate limiting logs
   docker logs zo-qore | grep "rate limit exceeded" | \
     awk '{print $NF}' | sort | uniq -c | sort -rn
   ```

2. **Determine if legitimate or attack:**
   - **Legitimate**: High-volume client → Adjust rate limits or provide API key
   - **Attack**: DoS attempt → Block IP at firewall level

3. **Adjust rate limits temporarily:**
   ```bash
   # Increase rate limit preset
   docker run -e RATE_LIMIT_PRESET=relaxed ...
   ```

4. **Block malicious IPs:**
   ```bash
   # At infrastructure level (iptables, cloud firewall, etc.)
   iptables -A INPUT -s <malicious-ip> -j DROP
   ```

5. **Monitor for resolution**
   ```bash
   watch -n 5 'curl -s http://localhost:3000/metrics | grep "status=\"429\""'
   ```

### Backup Failure Runbook

1. **Check backup logs**
   ```bash
   # Review recent backup attempts
   tail -n 100 /var/log/cron.log | grep backup
   ```

2. **Verify disk space**
   ```bash
   df -h /app/data/backups
   ```

3. **Test manual backup**
   ```bash
   npm run ops:backup create
   ```

4. **Common issues:**
   - Disk full → Clean old backups: `npm run ops:backup clean 3`
   - Permission denied → Check backup directory permissions
   - Database locked → Retry during low-traffic period

5. **Verify backup integrity**
   ```bash
   # Test restore in temporary location
   npm run ops:backup restore <backup-file> --verify-only
   ```

### Missing Backup Runbook

1. **Verify backup schedule**
   ```bash
   # Check cron job
   crontab -l | grep backup
   ```

2. **Check for backup process running**
   ```bash
   ps aux | grep backup
   ```

3. **Create immediate backup**
   ```bash
   npm run ops:backup create
   ```

4. **Fix backup schedule if broken:**
   ```bash
   # Re-enable backup cron job
   # 0 2 * * * cd /app && npm run ops:backup create
   ```

---

## Alert Aggregation

### Alert Routing

**Critical (P0):**
- PagerDuty immediate page
- Slack #incidents channel
- SMS to on-call engineer

**High (P1):**
- PagerDuty notification (no page)
- Slack #alerts channel
- Email to on-call

**Medium (P2):**
- Slack #alerts channel
- Email to team

**Low (P3):**
- Daily digest email
- Weekly review meeting

### Alert Suppression

Suppress alerts during:
- Scheduled maintenance windows
- Known deployment periods
- Testing environments

**Example (Prometheus):**
```yaml
inhibit_rules:
  - source_match:
      alertname: ServiceUnavailable
    target_match_re:
      alertname: "HighErrorRate|SlowResponseTime"
    equal: ['instance']
```

---

## Monitoring Dashboard

### Key Metrics Dashboard (Grafana)

**Panel 1: Health Status**
- Service health (healthy/degraded/unhealthy)
- Memory usage (current, limit, percentage)
- Uptime

**Panel 2: Request Metrics**
- Request rate (req/s)
- Error rate (%)
- P50/P95/P99 latency

**Panel 3: Database**
- Store operations (total, errors)
- Circuit breaker state
- Database size

**Panel 4: Resource Usage**
- CPU usage
- Memory usage trend
- Disk usage

**Import Dashboard:**
```bash
# Import from docs/grafana-dashboard.json
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @docs/grafana-dashboard.json
```

---

## Contact Information

**On-Call Rotation:** See [On-Call Runbook](ONCALL_RUNBOOK.md)  
**Incident Response:** See [Incident Response](INCIDENT_RESPONSE.md)  
**Escalation Procedures:** See [Incident Response - Escalation](INCIDENT_RESPONSE.md#escalation-procedures)

---

**Document Owner:** Operations Team  
**Last Updated:** February 28, 2026  
**Next Review:** Monthly or after major incident
