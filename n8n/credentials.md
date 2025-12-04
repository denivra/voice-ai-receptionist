# n8n Credentials Configuration

This document lists all required credentials for the Voice AI Receptionist n8n workflows.

## Required Credentials

### 1. Supabase API

**Type:** Supabase
**Used By:** All workflows

| Field | Description | Example |
|-------|-------------|---------|
| Host | Supabase project URL | `https://abc123.supabase.co` |
| Service Role Key | Service role secret key | `eyJhbG...` |

**Setup:**
1. Go to Supabase Dashboard > Project Settings > API
2. Copy the Project URL for Host
3. Copy the `service_role` key (NOT the anon key)

---

### 2. Twilio API

**Type:** Twilio
**Used By:** `booking-confirmation.json`, `voice-ai-webhook.json`

| Field | Description | Example |
|-------|-------------|---------|
| Account SID | Twilio Account SID | `ACxxxxxxxx...` |
| Auth Token | Twilio Auth Token | `xxxxxxxx...` |

**Setup:**
1. Go to Twilio Console > Dashboard
2. Copy Account SID and Auth Token
3. Ensure you have a phone number purchased with SMS capability

---

### 3. Slack API

**Type:** Slack OAuth2
**Used By:** `callback-handler.json`, `voice-ai-webhook.json`

| Field | Description | Example |
|-------|-------------|---------|
| Client ID | OAuth App Client ID | `12345.67890` |
| Client Secret | OAuth App Client Secret | `xxxxxxxx...` |
| Access Token | Bot User OAuth Token | `xoxb-...` |

**Required Scopes:**
- `chat:write`
- `chat:write.public`

**Setup:**
1. Create Slack App at https://api.slack.com/apps
2. Add required OAuth scopes
3. Install to workspace
4. Copy Bot User OAuth Token

**Channels Required:**
- `#voice-ai-alerts` - General alerts and transfers
- `#voice-ai-callbacks` - Callback queue notifications
- `#voice-ai-critical` - Critical alerts (optional)

---

### 4. Header Authentication (Webhook)

**Type:** Header Auth
**Used By:** All webhook triggers

| Field | Description | Example |
|-------|-------------|---------|
| Name | Header name | `X-Vapi-Secret` |
| Value | Secret value | (from .env) |

**Setup:**
1. Generate a secure random string: `openssl rand -hex 32`
2. Store in `.env` as `N8N_WEBHOOK_SECRET`
3. Configure in Vapi assistant settings

---

## Optional Credentials

### OpenAI API (Fallback)

**Type:** OpenAI
**Used By:** Future error recovery workflows

| Field | Description |
|-------|-------------|
| API Key | OpenAI API key |

Only needed if implementing AI-powered error recovery or fallback flows.

---

## Security Notes

1. **Never commit credentials** - All credentials should be configured in n8n's credential store, not in workflow JSON files

2. **Rotate regularly** - API keys should be rotated every 90 days

3. **Least privilege** - Use the minimum required permissions for each credential

4. **Audit access** - Monitor credential usage in n8n execution logs

---

## Credential IDs in Workflows

The workflow JSON files reference credentials by placeholder IDs:

| Placeholder | Replace With |
|-------------|--------------|
| `SUPABASE_CREDENTIAL_ID` | Your Supabase credential ID from n8n |
| `TWILIO_CREDENTIAL_ID` | Your Twilio credential ID from n8n |
| `SLACK_CREDENTIAL_ID` | Your Slack credential ID from n8n |

After importing workflows, update each credential reference in the n8n editor.
