# On-Call Runbook

**Version:** 1.0  
**Date:** February 28, 2026  
**System:** Zo-Qore Runtime & Operations

---

## Overview

This runbook provides guidance for engineers on-call for the Zo-Qore system, including responsibilities, escalation procedures, common scenarios, and handoff processes.

---

## On-Call Responsibilities

### Primary Duties

1. **Respond to alerts** within defined SLAs:
   - P0 (Critical): < 5 minutes
   - P1 (High): < 15 minutes
   - P2 (Medium): < 1 hour
   - P3 (Low): Next business day

2. **Investigate and resolve incidents** using established runbooks

3. **Escalate when necessary** following escalation procedures

4. **Document all incidents** with clear summaries and resolutions

5. **Perform handoffs** to next on-call engineer with full context

### Secondary Duties

1. **Monitor system health** proactively during shifts
2. **Review and update runbooks** based on new issues encountered
3. **Participate in post-incident reviews** for incidents that occurred during shift
4. **Maintain alerting tools** (PagerDuty, Slack, monitoring dashboards)

---

## On-Call Schedule

### Rotation Schedule

**Primary On-Call:**
- **Duration:** 1 week (Monday 9:00 AM → Monday 9:00 AM)
- **Handoff:** Monday morning standup
- **Coverage:** 24/7 for P0/P1 alerts, business hours for P2/P3

**Secondary On-Call:**
- **Role:** Backup for primary escalations
- **Duration:** Same week as primary
- **Availability:** Best-effort outside business hours

### Schedule Management

**Tool:** PagerDuty (or equivalent)  
**Schedule URL:** https://oncall.example.com/schedule  
**Override Requests:** Submit at least 48 hours in advance

---

## Alert Response Workflow

### Step 1: Acknowledge Alert (< 5 minutes)

1. **Receive alert** via PagerDuty/Slack/SMS
2. **Acknowledge in PagerDuty** to stop escalation
3. **Check Grafana dashboard** for system overview
4. **Review alert details** and recent logs

### Step 2: Initial Triage (< 10 minutes)

1. **Classify severity** using incident classification guide
2. **Determine impact:**
   - How many users affected?
   - What functionality is impaired?
   - Is data at risk?
3. **Identify urgency:**
   - Is issue getting worse?
   - Is immediate action required?
4. **Create incident ticket** with initial findings

### Step 3: Investigation (< 30 minutes for P0/P1)

1. **Follow relevant runbook:**
   - See [MONITORING_ALERTS.md](MONITORING_ALERTS.md) for specific runbooks
   - See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) for procedures

2. **Gather evidence:**
   - Export relevant logs
   - Take screenshots of dashboards
   - Document timeline of events

3. **Identify root cause** if possible

### Step 4: Mitigation

1. **Apply temporary fix** if root cause requires longer resolution:
   - Restart service
   - Rollback deployment
   - Scale resources
   - Enable fallback mechanisms

2. **Verify mitigation:**
   - Check health endpoints
   - Monitor metrics for improvement
   - Test affected functionality

3. **Update incident ticket** with actions taken

### Step 5: Communication

1. **Notify stakeholders:**
   - Update Slack #incidents channel
   - Email status update if customer-facing
   - Post to status page for major outages

2. **Update every 30-60 minutes** until resolved

3. **Send final update** when incident is closed

### Step 6: Resolution & Handoff

1. **Verify full resolution:**
   - All systems healthy
   - Monitoring shows normal metrics
   - No recurring alerts

2. **Document resolution:**
   - Root cause identified
   - Fix applied
   - Lessons learned
   - Follow-up tasks created

3. **Close incident ticket**

4. **Hand off follow-up work** to responsible team

---

## Common On-Call Scenarios

### Scenario 1: Service Down (P0)

**Alert:** `ServiceUnavailable`  
**Symptoms:** Health check failing, service unreachable  
**Runbook:** [Service Down Runbook](MONITORING_ALERTS.md#service-down-runbook)

**Quick Actions:**
```bash
# 1. Check service status
docker ps | grep zo-qore
curl http://localhost:3000/health

# 2. Review logs
docker logs zo-qore --tail 100

# 3. Restart if needed
docker restart zo-qore

# 4. Verify recovery
sleep 10
curl http://localhost:3000/health
```

**Escalate if:**
- Restart doesn't resolve issue
- Database is corrupted
- Infrastructure-level problem suspected

### Scenario 2: High Error Rate (P1)

**Alert:** `HighErrorRate`  
**Symptoms:** Elevated 5xx responses, errors in logs  
**Runbook:** [High Error Rate Runbook](MONITORING_ALERTS.md#high-error-rate-runbook)

**Quick Actions:**
```bash
# 1. Identify error types
docker logs zo-qore --tail 500 | grep ERROR

# 2. Check recent deployments
git log --oneline -n 10

# 3. Check database connectivity
curl http://localhost:3000/health | jq '.checks.database'

# 4. Rollback if recent deployment
./scripts/deploy.sh production --version previous
```

**Escalate if:**
- Errors affect critical functionality
- Root cause unclear after 30 minutes
- Rollback doesn't resolve issue

### Scenario 3: High Memory Usage (P1)

**Alert:** `HighMemoryUsage`  
**Symptoms:** Memory usage > 80%, potential OOM  
**Runbook:** [High Memory Runbook](MONITORING_ALERTS.md#high-memory-runbook)

**Quick Actions:**
```bash
# 1. Check current memory
curl http://localhost:3000/health | jq '.checks.memory'
docker stats zo-qore --no-stream

# 2. Identify memory growth pattern
# Check Grafana for memory trend

# 3. Temporary fix - restart
docker restart zo-qore

# 4. Scale up if needed
# Update docker-compose.yml memory limits
docker-compose up -d
```

**Escalate if:**
- Memory leak suspected (steady growth)
- Restart provides only temporary relief
- Memory usage critical (> 95%)

### Scenario 4: Database Issues (P0/P1)

**Alert:** `DatabaseUnavailable` or `HighStoreErrors`  
**Symptoms:** Database errors, corruption, unavailability  
**Runbook:** [Database Unavailable Runbook](MONITORING_ALERTS.md#database-unavailable-runbook)

**Quick Actions:**
```bash
# 1. Check database health
sqlite3 /app/data/qore.db "PRAGMA integrity_check;"

# 2. Check disk space
df -h /app/data

# 3. If corrupted, restore from backup
npm run ops:backup list
npm run ops:backup restore <latest-backup>

# 4. Verify restoration
curl http://localhost:3000/health | jq '.checks.database'
```

**Escalate if:**
- Database corruption extensive
- No recent backups available
- Data loss suspected

### Scenario 5: Rate Limiting Attack (P2)

**Alert:** `HighRateLimitRejections`  
**Symptoms:** Many 429 responses, potential DoS  
**Runbook:** [Rate Limiting Runbook](MONITORING_ALERTS.md#rate-limiting-runbook)

**Quick Actions:**
```bash
# 1. Identify source IPs
docker logs zo-qore | grep "rate limit exceeded" | \
  awk '{print $NF}' | sort | uniq -c | sort -rn

# 2. Check if legitimate or attack
# Review IP patterns and request patterns

# 3. Block malicious IPs (if attack)
# At infrastructure level (firewall, load balancer)

# 4. Adjust rate limits if legitimate traffic
# Update RATE_LIMIT_PRESET environment variable
```

**Escalate if:**
- Large-scale distributed DoS
- Infrastructure protection needed
- Business impact significant

---

## Escalation Procedures

### When to Escalate

**Immediate Escalation (P0):**
- Service down for > 15 minutes
- Data breach confirmed or suspected
- Database corruption with no backup
- Security incident in progress

**Timely Escalation (P1):**
- Root cause not identified within 1 hour
- Fix requires code changes
- Third-party service dependency issue
- Resource scaling beyond current capacity

### Escalation Contacts

**Level 1: Secondary On-Call**
- **Who:** Backup engineer on rotation
- **When:** Primary needs assistance or consultation
- **How:** PagerDuty escalation or direct message
- **Response Time:** < 15 minutes

**Level 2: Engineering Lead**
- **Who:** Engineering manager or tech lead
- **When:** Complex issues requiring architectural decisions
- **How:** PagerDuty escalation or phone call
- **Response Time:** < 30 minutes

**Level 3: CTO/VP Engineering**
- **Who:** Engineering executive leadership
- **When:** Major outage, data breach, business-critical
- **How:** Direct phone call
- **Response Time:** Immediate

**Security Team:**
- **Who:** Security engineer or CISO
- **When:** Security incident confirmed or suspected
- **How:** Direct phone call + Slack #security-incidents
- **Response Time:** Immediate for P0, < 1 hour for P1

### Escalation Communication Template

```
ESCALATION: [Incident ID] - [Brief Description]

Severity: P0/P1/P2
Impact: [Number of users, functionality affected]
Duration: [Time since incident started]
Actions Taken: [List of troubleshooting steps]
Current Status: [Current state of system]
Assistance Needed: [Specific help required]

[Link to incident ticket]
[Link to relevant dashboard]
```

---

## Handoff Procedures

### Shift Start Handoff (Receiving)

**Before Shift Starts:**
1. Review handoff notes from previous on-call
2. Check for open incidents
3. Review recent alerts and trends
4. Test PagerDuty/alerting connectivity

**During Handoff Meeting (15 minutes):**
1. Receive verbal summary of previous shift
2. Review any ongoing incidents
3. Discuss any system changes or maintenance
4. Clarify any questions about recent issues

**After Handoff:**
1. Confirm PagerDuty active
2. Monitor dashboards for first hour
3. Acknowledge handoff received

### Shift End Handoff (Handing Off)

**Preparation (30 minutes before handoff):**
1. Compile handoff notes document
2. Review all incidents from your shift
3. Identify any ongoing issues or trends
4. Prepare summary for next on-call

**Handoff Notes Template:**
```markdown
# On-Call Handoff - [Date]

## Shift Summary
- Start: [Date/Time]
- End: [Date/Time]
- Total Incidents: [Count by severity]

## Active Incidents
[List any unresolved incidents with current status]

## Resolved Incidents
[Brief list of major incidents resolved during shift]

## System Changes
- Deployments: [List any deployments]
- Configuration changes: [List changes]
- Maintenance performed: [List maintenance]

## Trends & Observations
- [Any patterns noticed]
- [Potential issues to watch]
- [Performance observations]

## Action Items for Next Shift
- [ ] Monitor [specific metric/service]
- [ ] Follow up on [incident/issue]
- [ ] Review [specific logs/alerts]

## Notes
[Any additional context or information]
```

**During Handoff:**
1. Walk through handoff notes
2. Answer questions from incoming on-call
3. Provide context on any complex issues
4. Confirm next on-call has access to all tools

---

## Tools & Access

### Required Access

**Monitoring & Alerting:**
- PagerDuty account with mobile app configured
- Grafana dashboard access
- Prometheus metrics access
- Slack #incidents and #alerts channels

**Infrastructure:**
- Docker/container access to zo-qore service
- SSH access to production servers (if applicable)
- Cloud platform access (AWS/GCP/Azure)

**Incident Management:**
- Incident ticketing system (Jira/Linear)
- Documentation wiki access
- Runbook repository access

**Communication:**
- Slack workspace access
- Email distribution lists
- Status page admin (for major incidents)

### Tool Quicklinks

**Dashboards:**
- Grafana: https://grafana.example.com/d/zo-qore
- Prometheus: https://prometheus.example.com
- PagerDuty: https://example.pagerduty.com

**Logs:**
- Centralized logging: https://logs.example.com
- Docker logs: `docker logs zo-qore`

**Runbooks:**
- This document: [ONCALL_RUNBOOK.md](ONCALL_RUNBOOK.md)
- Monitoring alerts: [MONITORING_ALERTS.md](MONITORING_ALERTS.md)
- Incident response: [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)
- Deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Proactive Monitoring

### Daily Health Checks

Perform these checks at least once per shift:

1. **Service Health**
   ```bash
   curl http://localhost:3000/health
   ```
   - Verify status: "healthy"
   - Check all components green
   - Review memory usage

2. **Error Rates**
   - Check Grafana error rate panel
   - Verify < 1% error rate
   - Investigate any spikes

3. **Performance**
   - Check P95 latency < 2s
   - Review request rate trends
   - Identify slow endpoints

4. **Resource Usage**
   - Memory usage < 80%
   - Disk usage < 80%
   - CPU usage < 70%

5. **Backups**
   - Verify recent backup exists (< 24 hours)
   - Check backup size is reasonable
   - Spot-check backup integrity

### Weekly Tasks (Monday Shift)

1. **Review previous week's incidents**
   - Identify recurring issues
   - Update runbooks if needed
   - Create follow-up tasks

2. **Check for pending updates**
   - Security patches available?
   - Dependency updates needed?
   - System maintenance scheduled?

3. **Verify backup rotation**
   - Confirm automated backups running
   - Check retention policy working
   - Test backup restore (monthly)

---

## Self-Care During On-Call

### Managing Alerts

**Configure Notifications:**
- Set up distinct ringtones for P0 vs P1 alerts
- Use quiet hours for P3 alerts
- Enable Do Not Disturb for non-alert apps

**Sleep Hygiene:**
- Keep laptop/phone near bed during night shifts
- Have charger accessible
- Keep runbook printed or easily accessible

### Burnout Prevention

**During Shift:**
- Take breaks between incidents
- Don't investigate P3s during night hours (unless urgent)
- Ask for help early if overwhelmed

**After Shift:**
- Decompress after high-stress incidents
- Document learnings while fresh
- Hand off cleanly to avoid lingering responsibility

**Long-term:**
- Rotate on-call fairly across team
- Limit consecutive on-call weeks
- Address systemic issues causing frequent alerts

---

## Post-Incident Procedures

After resolving any P0 or P1 incident:

1. **Document thoroughly:**
   - Complete incident ticket with all details
   - Attach relevant logs and screenshots
   - Record timeline of events

2. **Create follow-up tasks:**
   - Fix root cause (if temporary mitigation applied)
   - Update monitoring/alerting
   - Add test cases to prevent recurrence

3. **Update runbooks:**
   - Add new scenarios encountered
   - Refine existing procedures
   - Document what worked and what didn't

4. **Schedule post-incident review:**
   - For P0: Within 48 hours
   - For P1: Within 1 week
   - Invite all stakeholders

---

## Emergency Contacts

### Internal Contacts

**Primary On-Call:**
- PagerDuty: Automatic routing
- Slack: @oncall-primary
- Phone: [FROM PAGERDUTY]

**Secondary On-Call:**
- PagerDuty: Automatic escalation
- Slack: @oncall-secondary
- Phone: [FROM PAGERDUTY]

**Engineering Lead:**
- Slack: @eng-lead
- Phone: [REDACTED]
- Email: [REDACTED]

**Security Team:**
- Slack: #security-incidents
- Phone: [REDACTED]
- Email: security@example.com

### External Contacts

**Infrastructure Provider:**
- AWS Support: [ACCOUNT-SPECIFIC]
- Support Level: Business/Enterprise
- Account ID: [REDACTED]

**Database Vendor:**
- SQLite: Community support (no SLA)
- Consulting: [VENDOR CONTACT if applicable]

**Security Incident Response:**
- Local CSIRT: [CONTACT]
- Legal Counsel: [CONTACT]
- PR Firm: [CONTACT] (for major public incidents)

---

## FAQ

**Q: What if I'm genuinely stumped and can't resolve an issue?**  
A: Escalate early! It's better to escalate at 30 minutes than struggle alone for 2 hours. See [Escalation Procedures](#escalation-procedures).

**Q: Can I ignore P3 alerts at 3 AM?**  
A: Yes. P3s can wait until business hours unless they're symptoms of a larger issue.

**Q: What if I need to hand off mid-incident?**  
A: Brief the next on-call thoroughly, update the incident ticket with current status, and remain available for questions during transition.

**Q: Should I fix root cause or just mitigate during an incident?**  
A: Mitigate first to restore service, then create a follow-up task to fix root cause properly.

**Q: What if PagerDuty fails or I don't receive an alert?**  
A: Test PagerDuty at shift start. If it fails mid-shift, notify team in Slack and use phone/SMS as backup. Create incident for PagerDuty failure.

**Q: How do I handle multiple simultaneous incidents?**  
A: Triage by severity (P0 > P1 > P2). Escalate immediately to get help. Focus on highest impact first.

---

## Appendix: Quick Reference Commands

### Health Check
```bash
curl http://localhost:3000/health | jq .
```

### View Recent Logs
```bash
docker logs zo-qore --tail 100 --follow
```

### Check Resource Usage
```bash
docker stats zo-qore --no-stream
```

### Restart Service
```bash
docker restart zo-qore
```

### Check Metrics
```bash
curl http://localhost:3000/metrics | grep -E "http_requests_total|http_request_duration"
```

### Database Integrity
```bash
sqlite3 /app/data/qore.db "PRAGMA integrity_check;"
```

### Create Backup
```bash
npm run ops:backup create
```

### Restore Backup
```bash
npm run ops:backup restore <backup-file>
```

### Deploy Previous Version
```bash
./scripts/deploy.sh production --version previous
```

### View Migration Status
```bash
npm run ops:migrate status
```

---

**Document Owner:** Engineering Team  
**Last Updated:** February 28, 2026  
**Next Review:** Quarterly or after major incident

**Questions?** Contact the engineering team in #eng-support or see [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).
