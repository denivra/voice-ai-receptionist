# Vapi Assistant Setup Instructions

This guide walks you through deploying the Restaurant AI Receptionist to Vapi.

## Prerequisites

Before starting, ensure you have:

- [ ] Vapi account with API access (https://vapi.ai)
- [ ] OpenAI API key with GPT-4o access
- [ ] ElevenLabs API key (for voice synthesis)
- [ ] Deepgram API key (for speech-to-text)
- [ ] Twilio account with phone number (for inbound calls)
- [ ] n8n instance running with webhook workflows deployed
- [ ] Supabase project with database schema applied

## Step 1: Configure Vapi Credentials

### 1.1 Log into Vapi Dashboard

Go to https://dashboard.vapi.ai and log in.

### 1.2 Add Provider Credentials

Navigate to **Settings > Credentials** and add each provider:

#### OpenAI
- Click "Add Credential"
- Provider: OpenAI
- API Key: Your OpenAI API key
- Save and note the credential ID

#### ElevenLabs
- Click "Add Credential"
- Provider: ElevenLabs
- API Key: Your ElevenLabs API key
- Save and note the credential ID

#### Deepgram
- Click "Add Credential"
- Provider: Deepgram
- API Key: Your Deepgram API key
- Save and note the credential ID

#### Twilio
- Click "Add Credential"
- Provider: Twilio
- Account SID: Your Twilio Account SID
- Auth Token: Your Twilio Auth Token
- Save and note the credential ID

## Step 2: Prepare Configuration File

### 2.1 Copy the Template

```bash
cp vapi/assistant-config.json vapi/assistant-config.production.json
```

### 2.2 Replace Placeholders

Edit `assistant-config.production.json` and replace all `{{PLACEHOLDER}}` values:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{RESTAURANT_NAME}}` | Your restaurant name | `The Gourmet Kitchen` |
| `{{N8N_WEBHOOK_URL}}` | Your n8n base URL | `https://n8n.yourdomain.com` |
| `{{VAPI_WEBHOOK_SECRET}}` | Shared secret for webhook auth | `vapi_secret_abc123...` |
| `{{DEFAULT_RESTAURANT_ID}}` | UUID from your database | `00000000-0000-0000-0000-000000000001` |
| `{{TWILIO_PHONE_NUMBER}}` | Your Twilio number | `+15551234567` |
| `{{TWILIO_PHONE_NUMBER_ID}}` | Twilio number SID | `PN...` |
| `{{VAPI_OPENAI_CREDENTIAL_ID}}` | From Step 1.2 | `cred_...` |
| `{{VAPI_ELEVENLABS_CREDENTIAL_ID}}` | From Step 1.2 | `cred_...` |
| `{{VAPI_DEEPGRAM_CREDENTIAL_ID}}` | From Step 1.2 | `cred_...` |
| `{{VAPI_TWILIO_CREDENTIAL_ID}}` | From Step 1.2 | `cred_...` |

### 2.3 Remove Comment Fields

The `_comment` fields are for documentation only. Remove them before API import:

```bash
# Using jq to strip comment fields
cat vapi/assistant-config.production.json | \
  jq 'del(._comment, ._comment_1, ._comment_2, ._comment_3, ._comment_4, ._comment_5, ._comment_6, ._comment_7) |
      del(._comment_model, ._comment_model_1, ._comment_model_2, ._comment_model_3) |
      del(._comment_voice, ._comment_voice_1, ._comment_voice_2, ._comment_voice_3, ._comment_voice_4, ._comment_voice_5) |
      del(._comment_transcriber, ._comment_transcriber_1, ._comment_transcriber_2, ._comment_transcriber_3) |
      del(._comment_messages, ._comment_messages_1, ._comment_messages_2) |
      del(._comment_timing, ._comment_timing_1, ._comment_timing_2, ._comment_timing_3, ._comment_timing_4) |
      del(._comment_audio, ._comment_audio_1, ._comment_audio_2, ._comment_audio_3) |
      del(._comment_recording, ._comment_recording_1, ._comment_recording_2, ._comment_recording_3) |
      del(._comment_tools, ._comment_tools_1, ._comment_tools_2, ._comment_tools_3) |
      del(._comment_server, ._comment_server_1, ._comment_server_2, ._comment_server_3) |
      del(._comment_metadata, ._comment_metadata_1, ._comment_metadata_2, ._comment_metadata_3) |
      del(._comment_analysis, ._comment_analysis_1, ._comment_analysis_2, ._comment_analysis_3) |
      del(._comment_transport, ._comment_transport_1, ._comment_transport_2) |
      del(._comment_credentials, ._comment_credentials_1, ._comment_credentials_2) |
      del(.voice._available_voices) |
      del(.transcriber._keywords_note) |
      del(.credentialIds._note)' > vapi/assistant-config.deploy.json
```

## Step 3: Create Assistant via API

### 3.1 Get Your Vapi API Key

Navigate to **Settings > API Keys** in the Vapi dashboard and copy your API key.

### 3.2 Create the Assistant

```bash
# Set your API key
export VAPI_API_KEY="your-vapi-api-key"

# Create the assistant
curl -X POST "https://api.vapi.ai/assistant" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @vapi/assistant-config.deploy.json

# Save the returned assistant ID!
```

### 3.3 Note the Assistant ID

The API will return a response with an `id` field. Save this - you'll need it for:
- Connecting phone numbers
- Making test calls
- Updating the assistant later

## Step 4: Connect Phone Number

### Option A: Use Vapi-Managed Number

1. Go to **Phone Numbers** in Vapi dashboard
2. Click "Buy Number"
3. Select area code and purchase
4. Click the number and set "Assistant" to your new assistant

### Option B: Use Your Twilio Number

1. Go to **Phone Numbers** in Vapi dashboard
2. Click "Import Number"
3. Select "Twilio" provider
4. Enter your Twilio credentials and phone number
5. Set "Assistant" to your new assistant

### Option C: Via API (Twilio)

```bash
# Import Twilio number
curl -X POST "https://api.vapi.ai/phone-number" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "twilio",
    "twilioAccountSid": "YOUR_ACCOUNT_SID",
    "twilioAuthToken": "YOUR_AUTH_TOKEN",
    "number": "+15551234567",
    "assistantId": "YOUR_ASSISTANT_ID"
  }'
```

## Step 5: Test the Setup

### 5.1 Make a Test Call

```bash
# Initiate outbound test call
curl -X POST "https://api.vapi.ai/call/phone" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "YOUR_ASSISTANT_ID",
    "customer": {
      "number": "+1YOUR_PHONE_NUMBER"
    }
  }'
```

### 5.2 Test Checklist

Verify each scenario works correctly:

- [ ] **Happy path booking**: Request a table, provide all details, confirm SMS consent
- [ ] **Unavailable time**: Request a time that's booked, verify alternatives offered
- [ ] **Allergy mention**: Say "I have a peanut allergy" - should trigger transfer
- [ ] **Large party**: Request table for 10+ people - should trigger transfer
- [ ] **FAQ**: Ask "What are your hours?" - should respond without tool call
- [ ] **System error**: (Disconnect n8n temporarily) - should offer callback

### 5.3 Monitor Webhook Logs

Check your n8n execution logs to verify:
- Function calls are being received
- Parameters are parsed correctly
- Responses are returning to Vapi

## Step 6: Production Deployment

### 6.1 Update Environment Variables

Ensure these are set in your n8n environment:

```env
VAPI_WEBHOOK_SECRET=your-webhook-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
DEFAULT_RESTAURANT_ID=your-restaurant-uuid
```

### 6.2 Enable Production Mode

Update the assistant metadata:

```bash
curl -X PATCH "https://api.vapi.ai/assistant/YOUR_ASSISTANT_ID" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "environment": "production"
    }
  }'
```

### 6.3 Set Up Monitoring

1. Enable Vapi call analytics in dashboard
2. Configure Slack alerts for failed calls
3. Set up daily summary emails

## Updating the Assistant

### Update via API

```bash
curl -X PATCH "https://api.vapi.ai/assistant/YOUR_ASSISTANT_ID" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": {
      "messages": [
        {
          "role": "system",
          "content": "Updated system prompt here..."
        }
      ]
    }
  }'
```

### Update System Prompt Only

```bash
# Read prompt from file and update
PROMPT=$(cat vapi/prompts/system-prompt.md | jq -Rs .)

curl -X PATCH "https://api.vapi.ai/assistant/YOUR_ASSISTANT_ID" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": {
      \"messages\": [
        {
          \"role\": \"system\",
          \"content\": $PROMPT
        }
      ]
    }
  }"
```

## Multi-Restaurant Setup

For multiple restaurants sharing one assistant:

### Option 1: Per-Call Overrides

When initiating calls, override the metadata:

```bash
curl -X POST "https://api.vapi.ai/call/phone" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "YOUR_ASSISTANT_ID",
    "assistantOverrides": {
      "firstMessage": "Thank you for calling Joes Pizza. How can I help?",
      "metadata": {
        "restaurantId": "different-restaurant-uuid"
      }
    },
    "customer": {
      "number": "+15551234567"
    }
  }'
```

### Option 2: Separate Assistants

For different branding/prompts per restaurant:
1. Create separate assistant configurations
2. Deploy each with unique assistant IDs
3. Route phone numbers to appropriate assistants

## Troubleshooting

### Call Not Connecting
- Verify Twilio credentials are correct
- Check phone number is properly imported
- Ensure assistant is assigned to phone number

### Webhook Not Receiving Calls
- Verify n8n is running and accessible
- Check webhook URL is correct (no trailing slash)
- Verify X-Vapi-Secret matches in both places

### Voice Sounds Robotic
- Increase `stability` to 0.6-0.7
- Decrease `similarityBoost` to 0.6
- Try different voice ID

### High Latency
- Reduce `maxTokens` to 300
- Increase `optimizeStreamingLatency` to 4
- Check n8n server response times

### Tools Not Working
- Verify tool names match exactly in webhook handler
- Check Supabase functions are deployed
- Review n8n execution logs for errors

## Cost Optimization

### Reduce Per-Call Costs
- Set `maxDurationSeconds` to 300 (5 min)
- Use `nova-2` transcription (cheaper than nova-2-general)
- Disable `recordingEnabled` if not needed

### Monitor Usage
- Set up Vapi spending alerts
- Track average call duration
- Review failed call rate

## Security Checklist

- [ ] Webhook secret is 32+ characters
- [ ] HTTPS only for webhook URLs
- [ ] API keys stored in environment variables
- [ ] Recording consent disclosed (if required by state)
- [ ] PII not logged in plain text
- [ ] Supabase RLS policies enabled

## Support Resources

- Vapi Documentation: https://docs.vapi.ai
- Vapi Discord: https://discord.gg/vapi
- ElevenLabs Voice Library: https://elevenlabs.io/voice-library
- Deepgram Docs: https://developers.deepgram.com
