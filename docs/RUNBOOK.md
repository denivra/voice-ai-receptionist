# Operational Runbook

## Overview

This runbook provides procedures for operating and troubleshooting the Voice AI Receptionist system.

---

## Key Performance Indicators (KPIs)

Based on Section 6.1 of the Restaurant AI Automation Master Guide.

### Primary KPIs

| KPI | Target | Warning | Critical | Measurement |
|-----|--------|---------|----------|-------------|
| Call Completion Rate | ≥ 95% | < 90% | < 85% | Calls ending normally / Total calls |
| Booking Success Rate | ≥ 85% | < 80% | < 70% | Successful bookings / Booking attempts |
| Error Rate | < 5% | > 10% | > 20% | Failed calls / Total calls |
| Average Handle Time | < 3 min | > 4 min | > 5 min | Average call duration |
| Transfer Rate | < 15% | > 20% | > 30% | Transfers / Total calls |
| Callback Resolution | < 30 min | > 1 hour | > 2 hours | Avg time to resolve callbacks |

### Latency KPIs

| KPI | Target | Warning | Critical | Measurement |
|-----|--------|---------|----------|-------------|
| Webhook Response Time (p50) | < 500ms | > 1s | > 2s | Median webhook latency |
| Webhook Response Time (p95) | < 2s | > 3s | > 4s | 95th percentile latency |
| Database Query Time | < 100ms | > 250ms | > 500ms | Avg query execution |
| SMS Delivery Time | < 30s | > 60s | > 2 min | Time from booking to SMS |

### Reliability KPIs

| KPI | Target | Warning | Critical | Measurement |
|-----|--------|---------|----------|-------------|
| System Uptime | ≥ 99.9% | < 99.5% | < 99% | Available time / Total time |
| n8n Workflow Success | ≥ 99% | < 98% | < 95% | Successful executions / Total |
| SMS Delivery Rate | ≥ 98% | < 95% | < 90% | Delivered / Sent |
| Data Accuracy | 100% | < 99% | < 98% | Correct bookings / Total |

### Safety KPIs

| KPI | Target | Threshold | Measurement |
|-----|--------|-----------|-------------|
| Allergy Transfer Rate | 100% | < 100% | Allergy calls transferred / Allergy calls |
| Large Party Transfer | 100% | < 100% | 6+ party calls transferred / 6+ calls |
| Safety Response Time | < 5s | > 10s | Time to transfer after keyword |

---

## System Health Check Procedures

### Quick Health Check (2 minutes)

```bash
# 1. Check Vapi Assistant Status
curl -s -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID | jq '.status'

# 2. Check n8n Workflow Status
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  $N8N_URL/api/v1/workflows | jq '.data[] | {name, active}'

# 3. Check Supabase Connection
curl -s -H "apikey: $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/restaurants?select=id&limit=1"

# 4. Check Recent Error Rate (last hour)
psql $DATABASE_URL -c "
  SELECT
    COUNT(*) FILTER (WHERE status = 'failed') as errors,
    COUNT(*) as total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 1) as error_rate
  FROM call_logs
  WHERE started_at > NOW() - INTERVAL '1 hour';
"
```

### Comprehensive Health Check (10 minutes)

1. **Voice AI System**
   - [ ] Vapi assistant is active and responding
   - [ ] Test call connects and AI responds
   - [ ] All tool functions return expected responses
   - [ ] Transfer to manager works correctly

2. **n8n Workflows**
   - [ ] All workflows showing "Active" status
   - [ ] No queued executions backing up
   - [ ] Recent executions showing success
   - [ ] Monitoring workflow running every 5 minutes

3. **Database**
   - [ ] Supabase dashboard accessible
   - [ ] Connection pool healthy (< 80% utilization)
   - [ ] No slow queries (> 500ms average)
   - [ ] Realtime subscriptions working

4. **External Services**
   - [ ] Twilio SMS sending successfully
   - [ ] Slack webhook delivering messages
   - [ ] All API keys valid and not expired

5. **Metrics Review**
   - [ ] Error rate within target (< 5%)
   - [ ] Latency within target (p95 < 2s)
   - [ ] Pending callbacks < 5
   - [ ] No critical alerts in last 24 hours

---

## Daily Operations

### Morning Checklist (9:00 AM)

1. **Verify System Health**
   - [ ] Run quick health check script
   - [ ] Check n8n workflow status (all workflows active)
   - [ ] Verify Vapi assistant is online
   - [ ] Confirm Supabase is accessible
   - [ ] Check Twilio SMS balance (> $50)

2. **Review Overnight Activity**
   - [ ] Check Slack for any critical alerts
   - [ ] Review callback queue for pending items
   - [ ] Scan call logs for anomalies
   - [ ] Check for any failed SMS deliveries

3. **Verify Availability Data**
   - [ ] Confirm today's availability slots are synced
   - [ ] Check for any manual overrides needed
   - [ ] Verify special event blocks are in place
   - [ ] Confirm business hours are correct

### End-of-Day Checklist (9:00 PM)

1. **Clear Callback Queue**
   - [ ] Resolve all pending callbacks (target: 0 pending)
   - [ ] Mark completed items in system
   - [ ] Escalate any unresolved urgent callbacks

2. **Review Metrics**
   - [ ] Call completion rate (target: ≥ 95%)
   - [ ] Booking success rate (target: ≥ 85%)
   - [ ] Average handle time (target: < 3 min)
   - [ ] Error rate (target: < 5%)

3. **Prepare for Next Day**
   - [ ] Verify tomorrow's availability is synced
   - [ ] Check for any scheduled maintenance
   - [ ] Update on-call schedule if needed

---

## Monitoring & Alerts

### Alert Severity Levels

| Level | Response Time | Notification | Auto-Actions |
|-------|--------------|--------------|--------------|
| CRITICAL | Immediate (< 5 min) | @channel + Phone + PagerDuty | Enable fallback mode |
| HIGH | Within 30 min | Slack DM + Email | Log to incident tracker |
| MEDIUM | Within 2 hours | Slack channel | Add to daily review |
| LOW | Within 24 hours | Daily digest | Track for trends |

### Alert Thresholds (Section 6.1)

#### CRITICAL Alerts (Immediate Response)

| Alert | Threshold | Auto-Action | Manual Action |
|-------|-----------|-------------|---------------|
| Error Rate > 20% | > 20% in 10 min window | Enable callback mode | Check Vapi/n8n status |
| CRM Unreachable | 3 consecutive failures | Enable callback mode | Check Supabase status |
| Safety Mishandled | Any occurrence | Alert management | Review transcript |
| System Down | No responses for 2 min | Route to overflow | Full system check |

#### HIGH Alerts (30-minute Response)

| Alert | Threshold | Action |
|-------|-----------|--------|
| Latency > 4s | p95 > 4s for 5 min | Check n8n/DB performance |
| Booking Conflict Rate > 10% | > 10% in 1 hour | Check availability sync |
| Callback Queue > 10 | > 10 pending | Assign staff to callbacks |
| SMS Failure Rate > 5% | > 5% failures | Check Twilio status |

#### MEDIUM Alerts (2-hour Response)

| Alert | Threshold | Action |
|-------|-----------|--------|
| Call Completion Rate < 85% | < 85% daily | Review call transcripts |
| SMS Delivery Rate < 95% | < 95% daily | Check phone formats |
| Avg Handle Time > 4 min | > 4 min average | Optimize prompts |
| Transfer Rate > 20% | > 20% daily | Review transfer triggers |

---

## Troubleshooting Procedures

### Issue: Calls Not Being Answered

**Symptoms:**
- Calls going to voicemail
- Vapi dashboard shows no incoming calls
- Customer reports ringing with no answer

**Diagnosis Steps:**
1. Verify phone number is assigned to assistant in Vapi
2. Check Vapi assistant status (active/inactive)
3. Verify Twilio number is correctly forwarded
4. Check for any Twilio service issues

**Resolution:**
```bash
# Check Vapi assistant status
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID | jq '.status'

# Check Vapi phone number assignment
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/phone-number | jq '.[] | {number, assistantId}'

# Test inbound call routing
# Make test call to the number and verify it appears in Vapi logs
```

**Escalation:** If unresolved in 15 minutes, forward all calls to backup human line.

---

### Issue: Webhook Timeouts

**Symptoms:**
- AI says "I'm having trouble accessing our calendar"
- n8n logs show execution timeouts
- Long pauses during calls

**Diagnosis Steps:**
1. Check n8n workflow execution logs
2. Verify Supabase connection
3. Check for slow database queries
4. Verify n8n has sufficient resources

**Resolution:**
```bash
# Check n8n execution logs
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "$N8N_URL/api/v1/executions?limit=10&status=error" | jq '.data[] | {id, startedAt, stoppedAt, finished}'

# Check Supabase connection pool
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Find slow queries
psql $DATABASE_URL -c "
  SELECT query, calls, mean_time
  FROM pg_stat_statements
  ORDER BY mean_time DESC
  LIMIT 10;
"
```

**Escalation:** If database is overwhelmed, enable read replica for queries.

---

### Issue: SMS Not Sending

**Symptoms:**
- Bookings complete but no SMS received
- Twilio logs show failures
- Customer complaints about missing confirmations

**Diagnosis Steps:**
1. Check Twilio account balance
2. Verify phone number format (E.164)
3. Check for carrier blocks
4. Verify Twilio webhook status

**Resolution:**
```bash
# Check Twilio balance
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Balance.json"

# Test Twilio SMS
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "From=$TWILIO_PHONE_NUMBER" \
  -d "To=+1234567890" \
  -d "Body=Test message from Voice AI system"

# Check recent SMS failures
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json?Status=failed&PageSize=10"
```

**Escalation:** If Twilio is down, send email confirmations as backup.

---

### Issue: Incorrect Availability Shown

**Symptoms:**
- AI offers slots that are actually booked
- AI says unavailable when slots exist
- Double bookings occurring

**Diagnosis Steps:**
1. Check reservations table for correct data
2. Verify timezone handling
3. Check for race conditions in booking
4. Verify availability calculation logic

**Resolution:**
```sql
-- Check reservations for specific time
SELECT * FROM reservations
WHERE reservation_time BETWEEN '2024-03-15 17:00' AND '2024-03-15 23:00'
  AND restaurant_id = 'xxx'
  AND status IN ('confirmed', 'pending')
ORDER BY reservation_time;

-- Check for double bookings
SELECT reservation_time, COUNT(*) as count
FROM reservations
WHERE restaurant_id = 'xxx'
  AND status = 'confirmed'
GROUP BY reservation_time
HAVING COUNT(*) > 1;

-- Verify timezone
SELECT NOW() AT TIME ZONE 'America/New_York' as restaurant_time;
```

**Escalation:** If double bookings found, contact affected customers immediately.

---

### Issue: Transfer Not Working

**Symptoms:**
- Caller stuck after transfer initiated
- Transfer loops back to AI
- Manager never receives call

**Diagnosis Steps:**
1. Verify transfer phone numbers in config
2. Check Vapi transfer settings
3. Verify receiving line can accept transfers
4. Check for network issues

**Resolution:**
1. Test transfer number directly (call from personal phone)
2. Verify number format in Vapi configuration
3. Check call forwarding settings on manager line
4. Update fallback behavior if transfer fails

```bash
# Check Vapi transfer configuration
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID | \
  jq '.model.tools[] | select(.function.name | contains("transfer"))'
```

**Escalation:** If transfers failing, provide direct callback number to callers.

---

## Recovery Procedures

### Enable Callback-Only Mode

**When to use:** System cannot process bookings in real-time (database down, severe latency, critical errors).

**Steps:**

1. **Notify Team**
   ```
   @channel CALLBACK MODE ACTIVATED
   Reason: [describe issue]
   Estimated resolution: [time estimate]
   ```

2. **Update Vapi Assistant** (via dashboard or API)
   - Change system prompt to callback mode:
   ```
   SYSTEM IS IN CALLBACK MODE. Do not attempt to check availability or create bookings.

   Instead, collect the following information:
   - Customer name
   - Phone number
   - Preferred date and time
   - Party size
   - Any special requests

   Say: "Our booking system is temporarily undergoing maintenance. I've noted your
   information and a team member will call you back within 15 minutes to confirm
   your reservation. Is there anything else I can help you with?"
   ```

3. **Activate Callback Monitoring**
   - Open callbacks dashboard
   - Set up 5-minute refresh
   - Assign staff to process callbacks

4. **Resolve Callbacks**
   - Process callbacks in order of creation
   - Target: All callbacks resolved within 15 minutes
   - Escalate if queue exceeds 10

5. **Restore Normal Operations**
   - Verify system health
   - Revert Vapi prompt
   - Send all-clear notification

---

### Rollback Procedure

**When to use:** Recent deployment caused issues.

#### n8n Workflows

1. Go to n8n dashboard
2. Open affected workflow
3. Click "Versions" (top right)
4. Select previous working version
5. Click "Restore"
6. Verify workflow is active
7. Test with sample request

#### Vapi Assistant

1. Locate previous prompt in git history:
   ```bash
   git log --oneline vapi/system-prompt.md
   git show <commit>:vapi/system-prompt.md
   ```
2. Update assistant via Vapi dashboard
3. Test with sample call

#### Database

1. Identify rollback point:
   ```sql
   SELECT * FROM supabase_migrations ORDER BY version DESC LIMIT 5;
   ```
2. For schema changes, apply down migration
3. For data issues, restore from Supabase backup

---

### Emergency Shutdown

**When to use:** System is causing harm (safety issues, data corruption, severe errors).

**Immediate Actions (< 2 minutes):**

1. **Disable Vapi Assistant**
   ```bash
   curl -X PATCH "https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID" \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"status": "inactive"}'
   ```

2. **Redirect Phone to Human Line**
   - Update Twilio call routing
   - Or enable voicemail with callback promise

3. **Notify Stakeholders**
   ```
   @channel EMERGENCY SHUTDOWN
   Voice AI has been disabled due to: [reason]
   All calls routing to: [backup number]
   Investigation in progress.
   ```

**Investigation (< 30 minutes):**

4. Export recent call logs and transcripts
5. Identify root cause
6. Document affected customers

**Remediation:**

7. Fix identified issue
8. Test thoroughly in staging
9. Get approval from management

**Restoration:**

10. Re-enable with intensive monitoring
11. Send post-incident report
12. Update runbook if needed

---

## Maintenance Procedures

### Weekly Maintenance (Monday 9 AM)

1. **Review Performance Metrics**
   - Export weekly KPI report
   - Compare against targets
   - Identify trends and issues
   - Document anomalies

2. **Update Knowledge Base**
   - Review call transcripts for new FAQs
   - Update answers for accuracy
   - Add new common questions
   - Remove outdated information

3. **Test Safety Triggers**
   - Make test call mentioning allergies
   - Verify immediate transfer
   - Test large party detection
   - Document results

4. **Clear Old Data**
   ```sql
   -- Archive old call logs (> 90 days)
   INSERT INTO call_logs_archive SELECT * FROM call_logs WHERE started_at < NOW() - INTERVAL '90 days';
   DELETE FROM call_logs WHERE started_at < NOW() - INTERVAL '90 days';
   ```

### Monthly Maintenance (First Monday)

1. **Security Review**
   - Rotate API keys if policy requires
   - Review access logs
   - Audit user permissions
   - Verify PII handling compliance

2. **Load Testing**
   ```bash
   cd tests/load
   k6 run scenarios/concurrent-calls.js
   k6 run scenarios/webhook-stress.js
   ```
   - Document results
   - Identify bottlenecks
   - Plan capacity if needed

3. **Backup Verification**
   - Test database restore procedure
   - Verify workflow backups are current
   - Update disaster recovery docs
   - Test failover procedures

4. **Integration Health Check**
   - Verify all API integrations
   - Check for deprecated endpoints
   - Update to latest API versions
   - Test all external services

### Quarterly Maintenance

1. **Prompt Optimization**
   - Analyze call transcripts (sample 100)
   - Identify confusion points
   - A/B test prompt variations
   - Update based on performance

2. **Capacity Planning**
   - Review growth trends
   - Project next quarter load
   - Plan infrastructure scaling
   - Budget for increased usage

3. **Compliance Review**
   - Verify PCI compliance (if taking payments)
   - Check accessibility requirements
   - Review data retention policies
   - Update privacy documentation

---

## Contacts & Escalation

### On-Call Schedule

| Day | Primary | Backup |
|-----|---------|--------|
| Mon-Fri | Slack: @oncall-primary | @oncall-backup |
| Weekend | Slack: @weekend-oncall | PagerDuty rotation |

### Escalation Path

```
Level 1: On-Call Engineer (Slack #voice-ai-oncall)
    ↓ (15 min no response)
Level 2: Engineering Manager (Phone)
    ↓ (30 min unresolved)
Level 3: VP Engineering + Restaurant Manager
    ↓ (Critical safety issue)
Level 4: Executive Team
```

### External Contacts

| Service | Contact | SLA |
|---------|---------|-----|
| Vapi Support | support@vapi.ai | 24h response |
| Supabase Support | support@supabase.io | 24h response |
| Twilio Support | support@twilio.com | 4h critical |
| n8n Cloud | support@n8n.io | 24h response |

### Internal Contacts

| Role | Contact | When to Reach |
|------|---------|---------------|
| Restaurant Manager | [phone] | Customer escalations |
| Engineering Manager | [phone] | Technical escalations |
| Operations Lead | [phone] | Operational issues |

---

## Appendix: Useful Queries

### Real-time Dashboard Queries

```sql
-- Current hour stats
SELECT
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(AVG(duration_seconds)) as avg_duration,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'booking_made') / NULLIF(COUNT(*), 0), 1) as booking_rate
FROM call_logs
WHERE started_at > NOW() - INTERVAL '1 hour';

-- Pending callbacks
SELECT
  priority,
  COUNT(*) as count,
  MIN(created_at) as oldest
FROM callbacks
WHERE status IN ('pending', 'in_progress')
GROUP BY priority
ORDER BY
  CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END;

-- Today's bookings
SELECT
  DATE_TRUNC('hour', reservation_time) as hour,
  COUNT(*) as bookings,
  SUM(party_size) as total_covers
FROM reservations
WHERE DATE(reservation_time) = CURRENT_DATE
  AND status = 'confirmed'
GROUP BY DATE_TRUNC('hour', reservation_time)
ORDER BY hour;
```

### Troubleshooting Queries

```sql
-- Find failed calls with details
SELECT
  id,
  caller_phone,
  started_at,
  duration_seconds,
  outcome,
  summary
FROM call_logs
WHERE status = 'failed'
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Check for booking conflicts
SELECT
  reservation_time,
  COUNT(*) as bookings,
  STRING_AGG(customer_name, ', ') as customers
FROM reservations
WHERE status = 'confirmed'
GROUP BY reservation_time
HAVING COUNT(*) > 1;

-- Error rate by hour (last 24h)
SELECT
  DATE_TRUNC('hour', started_at) as hour,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'failed') as errors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 1) as error_rate
FROM call_logs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', started_at)
ORDER BY hour;

-- Webhook latency analysis
SELECT
  DATE_TRUNC('hour', started_at) as hour,
  ROUND(AVG(webhook_latency_ms)) as avg_latency,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY webhook_latency_ms)) as p95_latency
FROM call_logs
WHERE started_at > NOW() - INTERVAL '24 hours'
  AND webhook_latency_ms IS NOT NULL
GROUP BY DATE_TRUNC('hour', started_at)
ORDER BY hour;
```

### Cleanup Queries

```sql
-- Remove test data
DELETE FROM call_logs WHERE caller_phone LIKE '+1555%';
DELETE FROM reservations WHERE customer_phone LIKE '+1555%';
DELETE FROM callbacks WHERE customer_phone LIKE '+1555%';

-- Archive old analytics
INSERT INTO analytics_daily_archive
SELECT * FROM analytics_daily WHERE date < CURRENT_DATE - INTERVAL '365 days';
DELETE FROM analytics_daily WHERE date < CURRENT_DATE - INTERVAL '365 days';
```
