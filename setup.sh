#!/bin/bash
echo "🍴 Voice AI Receptionist Setup"
echo "=============================="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm required"; exit 1; }

echo "✅ Node.js $(node --version)"
echo "✅ npm $(npm --version)"

# Create project structure
echo "📁 Creating project structure..."
mkdir -p {docs,database,n8n/workflows,vapi/{tools,prompts},portal,tests/{integration,load/scenarios},.github/workflows}

# Create .env template if it doesn't exist
if [ ! -f .env.example ]; then
cat > .env.example << 'ENVEOF'
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Vapi
VAPI_API_KEY=your-vapi-key
VAPI_ASSISTANT_ID=your-assistant-id
VAPI_PHONE_NUMBER_ID=your-phone-number-id

# n8n
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/vapi-restaurant
N8N_WEBHOOK_SECRET=your-webhook-secret

# Portal (Vite)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Slack (for alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx

# Third-party APIs
OPENTABLE_API_KEY=your-opentable-key
YELP_API_KEY=your-yelp-key
ENVEOF
echo "✅ Created .env.example"
else
echo "ℹ️  .env.example already exists"
fi

echo "✅ Project structure verified"
echo ""
echo "📋 Next steps:"
echo "1. Create Supabase project at https://supabase.com"
echo "2. Run database migrations: database/migrations/*.sql"
echo "3. Create Vapi account at https://vapi.ai"
echo "4. Import n8n workflows from n8n/workflows/"
echo "5. Copy .env.example to .env and fill in values"
echo "6. Deploy portal: cd portal && npm install && npm run build"
echo ""
echo "📚 Documentation:"
echo "- README.md - Project overview"
echo "- docs/DEPLOYMENT.md - Deployment guide"
echo "- docs/SECURITY.md - Security procedures"
echo "- docs/RUNBOOK.md - Operations runbook"
