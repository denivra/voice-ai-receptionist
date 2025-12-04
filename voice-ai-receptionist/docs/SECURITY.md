# Security Procedures

This document outlines security procedures for the Voice AI Receptionist system, including key rotation, PII handling, audit practices, and incident response.

## Table of Contents

1. [API Key Management](#api-key-management)
2. [Webhook Secret Rotation](#webhook-secret-rotation)
3. [PII Handling & Compliance](#pii-handling--compliance)
4. [Audit Log Retention](#audit-log-retention)
5. [Incident Response](#incident-response)
6. [Security Checklist](#security-checklist)

---

## API Key Management

### Overview

The system uses several API keys and secrets that require regular rotation:

| Service | Key Type | Rotation Frequency | Impact of Compromise |
|---------|----------|-------------------|---------------------|
| Supabase | Service Role Key | 90 days | Full database access |
| Supabase | Anon Key | 90 days | Limited public access |
| Vapi | API Key | 90 days | Voice AI control |
| OpenTable | API Key | 90 days | Reservation access |
| Yelp | API Key | 90 days | Review data access |
| Slack | Bot Token | 180 days | Alert channel access |
| n8n | Webhook Secrets | 30 days | Workflow triggers |

### Rotation Procedure

#### 1. Supabase Keys

```bash
# 1. Generate new keys in Supabase Dashboard
# Navigate to: Project Settings > API

# 2. Update n8n credentials
# In n8n: Settings > Credentials > Supabase
# Update both anon key and service role key

# 3. Update portal environment
# In Vercel: Project Settings > Environment Variables
# Update VITE_SUPABASE_ANON_KEY

# 4. Verify connectivity
curl -X GET "https://YOUR_PROJECT.supabase.co/rest/v1/restaurants" \
  -H "apikey: NEW_ANON_KEY" \
  -H "Authorization: Bearer NEW_ANON_KEY"

# 5. Invalidate old keys (after 24h monitoring period)
# Note: Supabase doesn't support key invalidation - regenerating creates new keys
```

#### 2. Vapi API Key

```bash
# 1. Generate new key in Vapi Dashboard
# Navigate to: Dashboard > API Keys > Create New

# 2. Update n8n credentials
# In n8n: Settings > Credentials > HTTP Header Auth
# Update X-Vapi-Secret header value

# 3. Test Vapi connectivity
curl -X GET "https://api.vapi.ai/assistant" \
  -H "Authorization: Bearer NEW_VAPI_KEY"

# 4. Delete old key in Vapi Dashboard (after 24h monitoring)
```

#### 3. Third-Party API Keys (OpenTable, Yelp)

```bash
# 1. Generate new keys in respective dashboards

# 2. Update n8n credentials
# OpenTable: Settings > Credentials > OpenTable API
# Yelp: Settings > Credentials > Yelp API

# 3. Test each integration
# Run test workflow or manual API call

# 4. Revoke old keys in provider dashboards
```

### Key Storage Best Practices

1. **Never commit keys to version control**
   - Use `.env` files locally (in `.gitignore`)
   - Use secure credential managers in production

2. **Principle of least privilege**
   - Use anon keys for public-facing operations
   - Reserve service role keys for admin operations

3. **Environment separation**
   - Maintain separate keys for dev/staging/production
   - Never use production keys in development

4. **Access logging**
   - Enable API access logs in all services
   - Monitor for unusual access patterns

---

## Webhook Secret Rotation

### n8n Webhook Security

All webhook endpoints should be protected with secrets to prevent unauthorized access.

#### Current Webhook Endpoints

| Webhook | Path | Secret Header | Purpose |
|---------|------|---------------|---------|
| Vapi Handler | `/webhook/vapi-handler` | X-Vapi-Secret | Voice AI events |
| Vapi Status | `/webhook/vapi-status` | X-Vapi-Secret | Call status updates |
| Manual Trigger | `/webhook/manual-test` | X-Test-Secret | Testing only |

#### Rotation Procedure (Every 30 Days)

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)
echo "New webhook secret: $NEW_SECRET"

# 2. Update n8n workflow
# Open workflow > Webhook node > Authentication
# Set Header Auth with new secret

# 3. Update Vapi webhook configuration
# In Vapi Dashboard: Assistants > [Your Assistant] > Webhooks
# Update the secret header value

# 4. Test webhook delivery
curl -X POST "https://your-n8n.com/webhook/vapi-handler" \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Secret: $NEW_SECRET" \
  -d '{"type": "test"}'

# 5. Monitor for 24 hours before removing old secret
```

#### Webhook Security Checklist

- [ ] All webhooks require authentication
- [ ] Secrets are at least 32 characters
- [ ] IP allowlisting enabled (if supported)
- [ ] Request logging enabled
- [ ] Rate limiting configured
- [ ] Payload validation in place

---

## PII Handling & Compliance

### Data Classification

| Data Type | Classification | Retention | Encryption |
|-----------|---------------|-----------|------------|
| Phone Numbers | PII | 90 days | At rest + transit |
| Customer Names | PII | 90 days | At rest + transit |
| Reservation Details | Business | 1 year | At rest + transit |
| Call Transcripts | PII | 30 days | At rest + transit |
| Error Logs | Technical | 30 days | At rest + transit |

### Compliance Requirements

#### CCPA (California Consumer Privacy Act)

1. **Right to Know**
   - Provide data export on request
   - Document all data collected

2. **Right to Delete**
   - Implement deletion procedures
   - Cascade deletes to all related records

3. **Right to Opt-Out**
   - Honor do-not-call requests
   - Maintain suppression list

#### PCI-DSS (if handling payments)

1. **Never store payment card data**
   - Use tokenization services
   - Redirect to payment processors

2. **Secure transmission**
   - TLS 1.2+ required
   - Certificate validation enabled

### Data Minimization

```sql
-- Only collect necessary data
-- Example: reservation table schema

CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    -- Required fields
    restaurant_id UUID NOT NULL,
    party_size INTEGER NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,

    -- PII - minimized
    customer_name TEXT NOT NULL,      -- First name + last initial only
    customer_phone TEXT NOT NULL,     -- For confirmation only

    -- No unnecessary PII
    -- customer_email - NOT COLLECTED (not needed for voice)
    -- customer_address - NOT COLLECTED (not needed)
    -- date_of_birth - NOT COLLECTED (not needed)

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Data Retention Automation

```sql
-- Automated PII cleanup (run daily via scheduled job)

-- 1. Anonymize old call transcripts (>30 days)
UPDATE call_logs
SET transcript = NULL,
    customer_phone = 'REDACTED',
    customer_name = 'REDACTED'
WHERE ended_at < NOW() - INTERVAL '30 days'
  AND transcript IS NOT NULL;

-- 2. Delete old callback requests (>90 days)
DELETE FROM callback_requests
WHERE created_at < NOW() - INTERVAL '90 days';

-- 3. Anonymize old reservations (>90 days)
UPDATE reservations
SET customer_name = 'ARCHIVED',
    customer_phone = 'REDACTED'
WHERE reservation_date < NOW() - INTERVAL '90 days'
  AND customer_phone != 'REDACTED';
```

### Data Subject Requests

#### Handling Data Export Requests

```sql
-- Export all data for a phone number
SELECT
    'reservations' as data_type,
    jsonb_build_object(
        'id', id,
        'date', reservation_date,
        'time', reservation_time,
        'party_size', party_size,
        'status', status,
        'created_at', created_at
    ) as data
FROM reservations
WHERE customer_phone = '+1234567890'

UNION ALL

SELECT
    'callbacks' as data_type,
    jsonb_build_object(
        'id', id,
        'reason', reason,
        'status', status,
        'created_at', created_at
    ) as data
FROM callback_requests
WHERE customer_phone = '+1234567890';
```

#### Handling Deletion Requests

```sql
-- Delete all data for a phone number
-- Run in transaction

BEGIN;

DELETE FROM callback_requests WHERE customer_phone = '+1234567890';
DELETE FROM reservations WHERE customer_phone = '+1234567890';
UPDATE call_logs
SET customer_phone = 'DELETED',
    customer_name = 'DELETED',
    transcript = NULL
WHERE customer_phone = '+1234567890';

COMMIT;

-- Log the deletion for compliance
INSERT INTO deletion_log (phone_hash, deleted_at, request_type)
VALUES (
    encode(sha256('+1234567890'::bytea), 'hex'),
    NOW(),
    'customer_request'
);
```

---

## Audit Log Retention

### What to Log

| Event Type | Retention | Storage |
|------------|-----------|---------|
| Authentication events | 1 year | Supabase |
| Data access (PII) | 90 days | Supabase |
| Configuration changes | 2 years | Supabase |
| API calls | 30 days | n8n logs |
| Error events | 90 days | Supabase |

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,        -- 'data_access', 'config_change', 'auth', 'error'
    event_action TEXT NOT NULL,      -- 'read', 'create', 'update', 'delete'
    actor_type TEXT NOT NULL,        -- 'system', 'user', 'api', 'workflow'
    actor_id TEXT,                   -- User ID, API key hash, workflow name
    resource_type TEXT NOT NULL,     -- 'reservation', 'callback', 'settings'
    resource_id TEXT,                -- ID of affected resource
    metadata JSONB,                  -- Additional context
    ip_address INET,                 -- Client IP if applicable
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### Logging Implementation

```typescript
// Audit logging utility

interface AuditEvent {
  eventType: 'data_access' | 'config_change' | 'auth' | 'error';
  eventAction: 'read' | 'create' | 'update' | 'delete';
  actorType: 'system' | 'user' | 'api' | 'workflow';
  actorId?: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

async function logAuditEvent(event: AuditEvent): Promise<void> {
  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      event_type: event.eventType,
      event_action: event.eventAction,
      actor_type: event.actorType,
      actor_id: event.actorId,
      resource_type: event.resourceType,
      resource_id: event.resourceId,
      metadata: event.metadata,
      ip_address: event.ipAddress,
    });

  if (error) {
    console.error('Failed to log audit event:', error);
  }
}

// Usage example
await logAuditEvent({
  eventType: 'data_access',
  eventAction: 'read',
  actorType: 'user',
  actorId: 'user-123',
  resourceType: 'reservation',
  resourceId: 'res-456',
  metadata: { fields: ['customer_name', 'customer_phone'] },
  ipAddress: '192.168.1.1',
});
```

### Log Retention Automation

```sql
-- Automated log cleanup (run weekly)

-- Delete old API logs (>30 days)
DELETE FROM audit_logs
WHERE event_type = 'api_call'
  AND created_at < NOW() - INTERVAL '30 days';

-- Delete old data access logs (>90 days)
DELETE FROM audit_logs
WHERE event_type = 'data_access'
  AND created_at < NOW() - INTERVAL '90 days';

-- Archive configuration change logs (>2 years)
-- First, export to cold storage
INSERT INTO audit_logs_archive
SELECT * FROM audit_logs
WHERE event_type = 'config_change'
  AND created_at < NOW() - INTERVAL '2 years';

-- Then delete from active table
DELETE FROM audit_logs
WHERE event_type = 'config_change'
  AND created_at < NOW() - INTERVAL '2 years';
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P1 - Critical | Service down, data breach | 15 minutes | Complete outage, PII leak |
| P2 - High | Major feature broken | 1 hour | Booking failures, voice AI down |
| P3 - Medium | Degraded service | 4 hours | Slow responses, partial errors |
| P4 - Low | Minor issues | 24 hours | UI bugs, non-critical errors |

### Incident Response Procedure

#### Phase 1: Detection (0-5 minutes)

1. **Alert received** via Slack or monitoring
2. **Acknowledge** the alert
3. **Initial triage**:
   - Is this a security incident?
   - What is the impact scope?
   - What is the severity?

#### Phase 2: Containment (5-30 minutes)

For security incidents:

```bash
# 1. Rotate all potentially compromised credentials
# (Follow API Key Rotation procedures above)

# 2. Revoke suspicious sessions
# In Supabase: Authentication > Users > Revoke all sessions

# 3. Enable additional logging
# In n8n: Enable execution logging for all workflows

# 4. Block suspicious IPs (if applicable)
# In Cloudflare/WAF: Add IP to blocklist
```

For service incidents:

```bash
# 1. Check system health
curl https://your-portal.vercel.app/api/health

# 2. Review recent deployments
vercel ls --recent

# 3. Check n8n workflow status
# In n8n Dashboard: Executions > Filter by failed

# 4. Review database connections
# In Supabase: Database > Connection pooling > Active connections
```

#### Phase 3: Eradication (30 min - 2 hours)

1. **Identify root cause**
   - Review logs in Supabase, n8n, Vercel
   - Check for failed deployments
   - Review code changes

2. **Implement fix**
   - Deploy patch
   - Rollback if necessary (see DEPLOYMENT.md)

3. **Verify fix**
   - Run integration tests
   - Monitor error rates

#### Phase 4: Recovery (2-4 hours)

1. **Restore normal operations**
   - Re-enable any disabled features
   - Clear any rate limits
   - Resume normal monitoring

2. **Communicate resolution**
   - Update status page
   - Notify affected parties

#### Phase 5: Post-Incident (24-48 hours)

1. **Document the incident**
   ```markdown
   ## Incident Report

   **Date:** 2024-XX-XX
   **Duration:** X hours
   **Severity:** P1/P2/P3/P4
   **Summary:** Brief description

   ### Timeline
   - HH:MM - Alert received
   - HH:MM - Investigation started
   - HH:MM - Root cause identified
   - HH:MM - Fix deployed
   - HH:MM - Service restored

   ### Root Cause
   Detailed explanation

   ### Impact
   - X customers affected
   - X reservations delayed

   ### Action Items
   - [ ] Implement additional monitoring
   - [ ] Update runbook
   - [ ] Review security controls
   ```

2. **Conduct post-mortem** (for P1/P2)
3. **Implement preventive measures**

### Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Primary On-Call | [Name] | [Phone/Slack] |
| Secondary On-Call | [Name] | [Phone/Slack] |
| Engineering Lead | [Name] | [Phone/Slack] |
| Security Lead | [Name] | [Phone/Slack] |

### Data Breach Response

If PII is potentially exposed:

1. **Immediately contain** - Rotate all credentials
2. **Document** - What data, how many records, timeline
3. **Legal notification** - Contact legal team within 24 hours
4. **Regulatory notification** - CCPA requires 72-hour notification
5. **Customer notification** - Work with legal on messaging

---

## Security Checklist

### Weekly

- [ ] Review failed login attempts
- [ ] Check for unusual API usage patterns
- [ ] Verify backup integrity
- [ ] Review pending security alerts

### Monthly

- [ ] Rotate webhook secrets
- [ ] Review access permissions
- [ ] Update dependencies (security patches)
- [ ] Review audit logs for anomalies

### Quarterly

- [ ] Rotate API keys
- [ ] Conduct access review
- [ ] Update security documentation
- [ ] Security awareness training
- [ ] Test incident response procedures

### Annually

- [ ] Full security audit
- [ ] Penetration testing
- [ ] Compliance review (CCPA, PCI-DSS if applicable)
- [ ] Update security policies
- [ ] Review and update incident response plan

---

## Appendix: Security Tools & Resources

### Recommended Tools

- **Secret scanning**: GitHub Advanced Security, GitGuardian
- **Dependency scanning**: Snyk, npm audit
- **WAF**: Cloudflare, AWS WAF
- **Monitoring**: Datadog, Grafana

### Useful Commands

```bash
# Check for exposed secrets in git history
git log -p | grep -E "(api_key|secret|password|token)" | head -20

# Audit npm dependencies
npm audit

# Check SSL certificate expiry
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates

# Generate secure random secret
openssl rand -hex 32
```

### Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Vapi Security](https://docs.vapi.ai/security)
- [CCPA Compliance Guide](https://oag.ca.gov/privacy/ccpa)
