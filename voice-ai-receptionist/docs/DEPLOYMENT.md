# Deployment Guide

Complete deployment instructions for the Voice AI Receptionist system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#1-supabase-project-setup)
3. [n8n Deployment](#2-n8n-deployment)
4. [Vapi Assistant Setup](#3-vapi-assistant-creation)
5. [Portal Deployment](#4-portal-deployment-vercel)
6. [DNS and SSL Configuration](#5-dns-and-ssl-configuration)
7. [Environment Variables](#environment-variable-setup-guide)
8. [Post-Deployment Verification](#post-deployment-verification-checklist)
9. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Accounts

- [ ] **Supabase Account** - [supabase.com](https://supabase.com)
- [ ] **Vapi Account** - [vapi.ai](https://vapi.ai)
- [ ] **Twilio Account** - [twilio.com](https://twilio.com) (for SMS)
- [ ] **Vercel Account** - [vercel.com](https://vercel.com) (for portal)
- [ ] **n8n Account** - [n8n.io](https://n8n.io) (cloud or self-hosted)
- [ ] **Slack Workspace** - For alerts (optional but recommended)
- [ ] **GitHub Account** - For CI/CD

### Required Tools

```bash
# Node.js 18+
node --version  # Should be >= 18.0.0

# npm or pnpm
npm --version   # Should be >= 8.0.0

# Git
git --version

# Supabase CLI (optional but recommended)
npm install -g supabase

# Vercel CLI (optional)
npm install -g vercel
```

### Required Information

Before starting, gather:

- [ ] Restaurant name and contact information
- [ ] Business hours for each day of the week
- [ ] Phone number to use (or provision new via Twilio)
- [ ] Manager phone number for transfers
- [ ] Custom domain (if using)
- [ ] Slack webhook URL (for alerts)

---

## 1. Supabase Project Setup

### 1.1 Create Project

1. Log in to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Fill in details:
   - **Name**: `voice-ai-receptionist`
   - **Database Password**: Generate and save securely
   - **Region**: Choose closest to your location
4. Click "Create new project"
5. Wait for project to be ready (~2 minutes)

### 1.2 Get Connection Details

From Project Settings > API:

```bash
# Save these values
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

From Project Settings > Database:

```bash
DATABASE_URL=postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres
```

### 1.3 Run Database Migrations

```bash
# Option 1: Using Supabase CLI
cd supabase
supabase db push

# Option 2: Using SQL Editor in Dashboard
# Copy contents of supabase/migrations/*.sql and run in SQL Editor
```

Migration files to run in order:
1. `001_initial_schema.sql` - Core tables
2. `002_rls_policies.sql` - Row-level security
3. `003_functions.sql` - Database functions

### 1.4 Create Initial Restaurant

```sql
-- Run in SQL Editor
INSERT INTO restaurants (name, phone, timezone, business_hours, settings)
VALUES (
  'Your Restaurant Name',
  '+15551234567',
  'America/New_York',
  '{
    "monday": {"isOpen": true, "openTime": "11:00", "closeTime": "22:00", "lastSeating": "21:00"},
    "tuesday": {"isOpen": true, "openTime": "11:00", "closeTime": "22:00", "lastSeating": "21:00"},
    "wednesday": {"isOpen": true, "openTime": "11:00", "closeTime": "22:00", "lastSeating": "21:00"},
    "thursday": {"isOpen": true, "openTime": "11:00", "closeTime": "22:00", "lastSeating": "21:00"},
    "friday": {"isOpen": true, "openTime": "11:00", "closeTime": "23:00", "lastSeating": "22:00"},
    "saturday": {"isOpen": true, "openTime": "10:00", "closeTime": "23:00", "lastSeating": "22:00"},
    "sunday": {"isOpen": true, "openTime": "10:00", "closeTime": "21:00", "lastSeating": "20:00"}
  }',
  '{
    "maxPartySize": 8,
    "largePartyThreshold": 6,
    "lastSeatingOffset": 60
  }'
);
```

### 1.5 Enable Realtime

1. Go to Database > Replication
2. Enable replication for tables:
   - `call_logs`
   - `reservations`
   - `callbacks`

### 1.6 Verify Setup

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check restaurant created
SELECT id, name FROM restaurants;
```

---

## 2. n8n Deployment

### Option A: n8n Cloud (Recommended)

1. Sign up at [n8n.io](https://n8n.io)
2. Create new instance
3. Note your instance URL: `https://your-instance.n8n.cloud`

### Option B: Self-Hosted (Docker)

```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3'
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=your-secure-password
      - N8N_HOST=n8n.yourdomain.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.yourdomain.com/
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
EOF

# Start n8n
docker-compose up -d
```

### 2.1 Configure Credentials

In n8n, create credentials:

**1. Supabase/Postgres:**
- Name: `Supabase Database`
- Host: `db.[project-id].supabase.co`
- Database: `postgres`
- User: `postgres`
- Password: Your database password
- SSL: `true`

**2. Slack (if using alerts):**
- Create Slack App at [api.slack.com](https://api.slack.com/apps)
- Add OAuth scopes: `chat:write`, `chat:write.public`
- Install to workspace
- Copy OAuth token

### 2.2 Import Workflows

1. Go to Workflows in n8n
2. Click Import from File
3. Import each workflow from `n8n/workflows/`:
   - `vapi-webhook-handler.json`
   - `monitoring-alerts.json`
4. Update credentials in each workflow
5. Activate workflows

### 2.3 Get Webhook URLs

After importing, note your webhook URLs:

```bash
N8N_WEBHOOK_URL=https://your-instance.n8n.cloud/webhook/vapi-restaurant
N8N_MONITORING_URL=https://your-instance.n8n.cloud/webhook/monitoring
```

### 2.4 Generate Webhook Secret

```bash
# Generate secure webhook secret
openssl rand -hex 32

# Save as WEBHOOK_SECRET
```

---

## 3. Vapi Assistant Creation

### 3.1 Create Vapi Account

1. Sign up at [vapi.ai](https://vapi.ai)
2. Navigate to Dashboard
3. Get your API key from Settings > API Keys

```bash
VAPI_API_KEY=your-api-key
```

### 3.2 Create Assistant

1. Go to Assistants > Create Assistant
2. Configure basic settings:
   - **Name**: `Restaurant Receptionist`
   - **Voice**: Choose preferred voice (e.g., "nova")
   - **Model**: `gpt-4o` or `gpt-4-turbo`

### 3.3 Configure System Prompt

Copy the system prompt from `vapi/system-prompt.md`:

```
You are a friendly and professional AI receptionist for {RESTAURANT_NAME}...
```

Replace placeholders:
- `{RESTAURANT_NAME}`
- `{RESTAURANT_PHONE}`
- `{MANAGER_PHONE}`

### 3.4 Configure Tools

Add function tools from `vapi/tools.json`:

1. `check_availability`
2. `create_booking`
3. `get_business_hours`
4. `transfer_to_manager`

For each tool:
- Set Server URL to your n8n webhook URL
- Set Headers:
  ```json
  {
    "X-Vapi-Secret": "your-webhook-secret",
    "Content-Type": "application/json"
  }
  ```

### 3.5 Configure Phone Number

**Option A: Import from Twilio**
1. Go to Phone Numbers in Vapi
2. Click "Import from Twilio"
3. Enter Twilio credentials
4. Select phone number

**Option B: Buy through Vapi**
1. Go to Phone Numbers
2. Click "Buy Number"
3. Search and purchase

### 3.6 Assign Phone Number

1. Go to the phone number settings
2. Assign your assistant
3. Enable inbound calls

### 3.7 Get Assistant ID

```bash
VAPI_ASSISTANT_ID=your-assistant-id
```

---

## 4. Portal Deployment (Vercel)

### 4.1 Prepare Repository

```bash
# Navigate to portal directory
cd portal

# Install dependencies
npm install

# Build to verify
npm run build
```

### 4.2 Deploy to Vercel

**Option A: Via Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Option B: Via GitHub Integration**

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your repository
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `portal`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 4.3 Configure Environment Variables

In Vercel Dashboard > Project Settings > Environment Variables:

```bash
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4.4 Configure Domain (Optional)

1. Go to Project Settings > Domains
2. Add your custom domain
3. Configure DNS (see DNS section below)

### 4.5 Verify Deployment

```bash
# Check deployment URL
curl https://your-app.vercel.app/

# Should return HTML for the app
```

---

## 5. DNS and SSL Configuration

### 5.1 Domain Setup for Portal

If using custom domain with Vercel:

**For apex domain (example.com):**
```
Type: A
Name: @
Value: 76.76.21.21
```

**For subdomain (app.example.com):**
```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

### 5.2 Domain Setup for n8n (Self-Hosted)

If self-hosting n8n with custom domain:

```
Type: A
Name: n8n
Value: your-server-ip
```

### 5.3 SSL Certificates

**Vercel:** Automatic SSL via Let's Encrypt

**n8n Cloud:** Automatic SSL

**n8n Self-Hosted:** Use Caddy or nginx with Let's Encrypt:

```bash
# Using Caddy (recommended)
cat > Caddyfile << 'EOF'
n8n.yourdomain.com {
    reverse_proxy localhost:5678
}
EOF

caddy run
```

---

## Environment Variable Setup Guide

### Complete Environment Variables

Create a `.env` file for local development:

```bash
# ===========================================
# SUPABASE
# ===========================================
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres

# ===========================================
# VAPI
# ===========================================
VAPI_API_KEY=your-vapi-api-key
VAPI_ASSISTANT_ID=your-assistant-id
VAPI_PHONE_NUMBER=+15551234567

# ===========================================
# N8N
# ===========================================
N8N_WEBHOOK_URL=https://your-instance.n8n.cloud/webhook
WEBHOOK_SECRET=your-32-char-hex-secret

# ===========================================
# TWILIO (for SMS)
# ===========================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+15551234567

# ===========================================
# SLACK (for alerts)
# ===========================================
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx
SLACK_CHANNEL=#voice-ai-alerts

# ===========================================
# APP CONFIG
# ===========================================
RESTAURANT_ID=your-restaurant-uuid
RESTAURANT_NAME="Your Restaurant Name"
RESTAURANT_TIMEZONE=America/New_York
MANAGER_PHONE=+15559876543
```

### Environment Variables by Service

**Vercel (Portal):**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

**n8n:**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
WEBHOOK_SECRET
SLACK_WEBHOOK_URL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

**Vapi (configured in dashboard):**
- Webhook URL with secret header
- Assistant system prompt with variables

---

## Post-Deployment Verification Checklist

### 1. Database Verification

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- analytics_daily, call_logs, callbacks, reservations, restaurants

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public';

-- Check restaurant data
SELECT id, name, phone, timezone FROM restaurants;
```

### 2. n8n Verification

```bash
# Test webhook endpoint
curl -X POST https://your-n8n.cloud/webhook/vapi-restaurant \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Secret: your-secret" \
  -d '{"message":{"type":"function-call","functionCall":{"name":"get_business_hours"}}}'

# Expected: 200 response with business hours
```

- [ ] All workflows show "Active" status
- [ ] Credentials are properly configured
- [ ] Test execution succeeds
- [ ] Monitoring workflow runs every 5 minutes

### 3. Vapi Verification

```bash
# Check assistant status
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID

# Expected: {"id": "...", "status": "active", ...}
```

- [ ] Assistant is active
- [ ] Phone number is assigned
- [ ] Test call connects to AI
- [ ] AI responds appropriately
- [ ] Function calls work (check availability)

### 4. Portal Verification

- [ ] Portal loads at deployment URL
- [ ] Login works (if auth configured)
- [ ] Dashboard shows data
- [ ] Real-time updates work
- [ ] All pages load without errors

### 5. Integration Verification

**Test Complete Flow:**

1. [ ] Make test call to Vapi number
2. [ ] AI answers and greets
3. [ ] Request availability check
4. [ ] AI returns available slots
5. [ ] Make a booking
6. [ ] Receive SMS confirmation
7. [ ] Booking appears in portal
8. [ ] Call log appears in portal

**Test Safety Triggers:**

1. [ ] Mention allergy in call
2. [ ] Verify immediate transfer
3. [ ] Callback created if transfer fails

**Test Monitoring:**

1. [ ] Slack alerts received
2. [ ] Metrics logged in database
3. [ ] Dashboard shows system health

### 6. Performance Verification

```bash
# Run quick load test
cd tests/load
k6 run --vus 5 --duration 30s scenarios/concurrent-calls.js

# Expected: p95 < 2s, error rate < 1%
```

---

## Rollback Procedures

### Supabase Rollback

**Schema Rollback:**
```sql
-- List recent migrations
SELECT * FROM supabase_migrations ORDER BY version DESC LIMIT 5;

-- Rollback specific migration (if down migration exists)
-- Apply the down migration SQL manually
```

**Data Rollback:**
1. Go to Supabase Dashboard > Database > Backups
2. Select point-in-time recovery
3. Choose timestamp before issue
4. Restore to new project or replace

**Quick Data Restore:**
```sql
-- If you have backup tables
INSERT INTO reservations SELECT * FROM reservations_backup;
```

### n8n Rollback

**Workflow Rollback:**
1. Open affected workflow
2. Click "Versions" (top right)
3. Select previous version
4. Click "Restore"
5. Verify workflow is active

**Complete Rollback:**
```bash
# If using Docker
docker-compose down
docker volume ls  # Find n8n volume

# Restore from backup
docker run --rm -v n8n_data:/data -v $(pwd):/backup alpine \
  sh -c "rm -rf /data/* && tar -xzf /backup/n8n-backup.tar.gz -C /data"

docker-compose up -d
```

### Vapi Rollback

**System Prompt Rollback:**
```bash
# Get previous prompt from git
git log --oneline vapi/system-prompt.md
git show <commit>:vapi/system-prompt.md

# Update in Vapi dashboard or via API
curl -X PATCH https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"systemPrompt": "previous prompt content"}'
```

**Disable Assistant (Emergency):**
```bash
curl -X PATCH https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'
```

### Portal (Vercel) Rollback

**Via Dashboard:**
1. Go to Vercel Dashboard
2. Select project
3. Go to Deployments
4. Find previous successful deployment
5. Click "..." > "Promote to Production"

**Via CLI:**
```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel rollback [deployment-url]
```

**Via Git:**
```bash
# Revert last commit
git revert HEAD
git push origin main

# Vercel will auto-deploy the revert
```

### Complete System Rollback

For major incidents requiring full rollback:

1. **Disable Vapi** - Stop incoming calls
   ```bash
   curl -X PATCH https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -d '{"status": "inactive"}'
   ```

2. **Deactivate n8n Workflows**
   - Open each workflow
   - Toggle "Active" to off

3. **Rollback Portal**
   ```bash
   vercel rollback [previous-deployment]
   ```

4. **Rollback Database** (if needed)
   - Use Supabase point-in-time recovery

5. **Re-enable in reverse order**
   - Database first
   - n8n workflows
   - Portal
   - Vapi (last)

---

## Troubleshooting Deployment Issues

### Common Issues

**Supabase Connection Failed:**
```bash
# Check if URL is correct
curl https://[project-id].supabase.co/rest/v1/

# Check if key is valid
curl -H "apikey: $SUPABASE_ANON_KEY" \
  https://[project-id].supabase.co/rest/v1/restaurants
```

**n8n Webhook Not Responding:**
```bash
# Check n8n is running
curl https://your-n8n.cloud/

# Check workflow is active
# Go to n8n dashboard and verify

# Check webhook URL is correct
curl -X POST https://your-n8n.cloud/webhook-test/vapi-restaurant
```

**Vapi Not Answering Calls:**
```bash
# Check assistant status
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID | jq '.status'

# Check phone number assignment
curl -H "Authorization: Bearer $VAPI_API_KEY" \
  https://api.vapi.ai/phone-number | jq '.[].assistantId'
```

**Portal Build Failed:**
```bash
# Check for TypeScript errors
cd portal
npm run build

# Check environment variables
echo $VITE_SUPABASE_URL
```

### Getting Help

- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Vapi**: [docs.vapi.ai](https://docs.vapi.ai)
- **n8n**: [docs.n8n.io](https://docs.n8n.io)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
