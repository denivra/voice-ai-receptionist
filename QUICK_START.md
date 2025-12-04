# Voice AI Receptionist - Quick Start Guide

## Prerequisites

Before running these prompts with Claude Code, ensure you have:

### Accounts & Services
- [ ] **Supabase** account with a new project created
- [ ] **Vapi.ai** account with API access
- [ ] **Twilio** account with a phone number
- [ ] **n8n** instance (self-hosted or cloud)
- [ ] **OpenAI** API key
- [ ] **Slack** workspace with incoming webhook configured
- [ ] **Vercel** account (for portal deployment)

### Local Environment
- [ ] Node.js 18+ installed
- [ ] npm or pnpm installed
- [ ] Claude Code CLI installed and authenticated
- [ ] Git initialized in project folder

### Files Required
- [ ] `Restaurant_AI_Automation_Master_Guide_v2.docx` in project root

---

## Directory Setup

```bash
# Create project directory
mkdir voice-ai-receptionist
cd voice-ai-receptionist

# Copy the guide document here
cp /path/to/Restaurant_AI_Automation_Master_Guide_v2.docx .

# Copy prompt files
cp -r /path/to/prompts .

# Initialize git
git init
echo ".env" >> .gitignore
echo "node_modules" >> .gitignore
```

---

## Running the Prompts

### Method 1: Interactive (Recommended)

Open Claude Code and run prompts one at a time:

```bash
# Start Claude Code in project directory
cd voice-ai-receptionist
claude

# Then paste each prompt from CLAUDE_CODE_PROMPTS.md
# Verify output before proceeding to next prompt
```

### Method 2: File-Based

```bash
# Run individual prompt files
claude < prompts/phase0-setup.md
claude < prompts/phase1-database.md
# ... etc
```

### Method 3: Batch (Advanced)

```bash
# Run all prompts in sequence (use with caution)
for file in prompts/phase*.md; do
  echo "Running: $file"
  claude < "$file"
  echo "Press Enter to continue or Ctrl+C to stop"
  read
done
```

---

## Phase Execution Order

| Phase | Prompts | Est. Time | Dependencies |
|-------|---------|-----------|--------------|
| **0** | 0.1, 0.2 | 15 min | None |
| **1** | 1.1, 1.2 | 30 min | Supabase project |
| **2** | 2.1, 2.2, 2.3 | 45 min | Phase 1, n8n instance |
| **3** | 3.1, 3.2, 3.3, 3.4 | 30 min | Vapi account |
| **4** | 4.1, 4.2, 4.3, 4.4, 4.5 | 2 hrs | Phase 1 |
| **5** | 5.1, 5.2 | 1 hr | Phases 1-4 |
| **6** | 6.1, 6.2 | 30 min | All phases |

**Total estimated time: 5-6 hours**

---

## Validation Between Phases

### After Phase 0
```bash
# Verify structure created
tree -L 2
# Should show all directories from prompt 0.1
```

### After Phase 1
```bash
# Test database connection
npx supabase db push
# Run seed data
npx supabase db reset --seed
```

### After Phase 2
```bash
# Import workflows to n8n
# Test webhook endpoint:
curl -X POST https://your-n8n.com/webhook/vapi-restaurant \
  -H "X-Vapi-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### After Phase 3
```bash
# Test Vapi assistant via dashboard
# Make test call to Vapi phone number
```

### After Phase 4
```bash
# Build portal
cd portal && npm run build
# Run locally
npm run dev
# Open http://localhost:5173
```

### After Phase 5
```bash
# Run integration tests
npm run test:integration
# Run load tests
npm run test:load
```

---

## Environment Variables Template

Create `.env` in project root:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Vapi
VAPI_API_KEY=vapi_xxxxx
VAPI_ASSISTANT_ID=asst_xxxxx

# n8n
N8N_WEBHOOK_URL=https://your-n8n.com/webhook
N8N_WEBHOOK_SECRET=your-secure-secret-here

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890

# OpenAI (for n8n fallback)
OPENAI_API_KEY=sk-xxxxx

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx

# Portal
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## Troubleshooting

### Claude Code Issues

**"File not found" errors**
- Ensure you're in the correct directory
- Check that the guide document is present

**"Context too long" errors**
- Run prompts individually, not combined
- Clear conversation with `/clear`

**Generated code has errors**
- Ask Claude to fix: "The generated code has this error: [paste error]. Please fix."
- Provide the specific file and line number

### Integration Issues

**n8n webhook not responding**
- Check n8n is running and accessible
- Verify webhook path matches configuration
- Check authentication header

**Vapi not calling webhook**
- Verify serverUrl in assistant config
- Check serverUrlSecret matches n8n expectation
- Review Vapi logs for errors

**Supabase connection errors**
- Verify URL and keys are correct
- Check RLS policies aren't blocking
- Ensure functions are deployed

---

## Support

For issues with:
- **This implementation**: Review the master guide document
- **Claude Code**: Check Anthropic documentation
- **Vapi**: https://docs.vapi.ai
- **n8n**: https://docs.n8n.io
- **Supabase**: https://supabase.com/docs
