# Claude Code Implementation Prompts
## Voice AI Receptionist - "Never-Miss-A-Table" System

> **Usage:** Run these prompts sequentially in Claude Code CLI from the project root directory.
> Each phase builds on the previous. Complete all validation steps before proceeding.

---

## Pre-Implementation Assessment

### Portal Requirement Analysis

**VERDICT: YES - A Management Portal IS Required**

| Stakeholder Need | Without Portal | With Portal | Decision |
|-----------------|----------------|-------------|----------|
| View call logs & transcripts | Direct DB queries / n8n logs | Dashboard with search/filter | **Portal needed** |
| Update business hours | Edit n8n workflow / Vapi config | Simple form interface | **Portal needed** |
| Manage daily specials / menu changes | Edit knowledge base JSON | CMS-like editor | **Portal needed** |
| Override availability (private events) | Manual calendar blocks | Calendar UI with overrides | **Portal needed** |
| View booking analytics | Export from CRM | Real-time dashboard | **Portal needed** |
| Handle failed callbacks | Check Slack notifications only | Task queue with actions | **Portal needed** |
| Train staff on system | N/A | Demo mode / documentation | **Portal helpful** |
| Adjust AI behavior | Edit Vapi system prompt | Templated prompt builder | **Portal helpful** |

**Minimum Viable Portal Features:**
1. Dashboard: Today's calls, bookings, completion rate
2. Call Log: Searchable list with audio playback and transcripts
3. Settings: Business hours, policies, contact info
4. Calendar: View/override availability
5. Callbacks: Queue of failed bookings requiring follow-up
6. Analytics: Weekly trends, peak hours, common questions

**Recommended Stack for Portal:**
- Frontend: React + TypeScript + Tailwind (aligns with your LuxeSalon stack)
- Backend: Supabase (auth, database, real-time subscriptions)
- Hosting: Vercel
- Why: Consistent with your existing expertise, rapid development, built-in auth

---

## Prompt Sequence Overview

```
Phase 0: Project Setup & Environment
Phase 1: Database Schema & Supabase Setup  
Phase 2: n8n Workflow Implementation
Phase 3: Vapi Voice Agent Configuration
Phase 4: Management Portal MVP
Phase 5: Integration Testing
Phase 6: Monitoring & Alerting
```

---

## PHASE 0: Project Setup & Environment

### Prompt 0.1 - Initialize Project Structure

```
Read the file "Restaurant_AI_Automation_Master_Guide_v2.docx" in this directory to understand the complete technical specification for the Voice AI Receptionist system.

Based on Section 2 of the guide (The "Never-Miss-A-Table" Voice AI Receptionist), create the following project structure:

voice-ai-receptionist/
├── README.md                    # Project overview, setup instructions
├── .env.example                 # Template for environment variables
├── .gitignore                   # Standard ignores + .env
├── docs/
│   ├── ARCHITECTURE.md          # System architecture diagram
│   ├── API_REFERENCE.md         # Webhook endpoints documentation
│   └── RUNBOOK.md               # Operational procedures
├── database/
│   ├── schema.sql               # Supabase SQL schema
│   ├── seed.sql                 # Initial data (test restaurant)
│   └── migrations/              # Future schema changes
├── n8n/
│   ├── workflows/
│   │   ├── voice-ai-webhook.json        # Main webhook handler
│   │   ├── booking-confirmation.json    # SMS confirmation flow
│   │   └── callback-handler.json        # Failed booking recovery
│   └── credentials.md           # Required n8n credentials list
├── vapi/
│   ├── assistant-config.json    # Vapi assistant configuration
│   ├── tools/
│   │   ├── check-availability.json
│   │   ├── book-appointment.json
│   │   └── transfer-call.json
│   ├── prompts/
│   │   └── system-prompt.md     # Production system prompt
│   └── knowledge-base/
│       └── restaurant-policies.json
├── portal/                      # React management portal
│   ├── package.json
│   ├── src/
│   └── ... (will scaffold later)
└── tests/
    ├── integration/
    └── load/

Create all directories and placeholder files. For README.md, include:
1. Project description referencing the automation guide
2. Prerequisites (Node.js, n8n, Vapi account, Supabase project)
3. Quick start instructions
4. Architecture overview diagram (mermaid)
5. Environment variables needed

For .env.example, include all required variables:
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- VAPI_API_KEY, VAPI_ASSISTANT_ID
- N8N_WEBHOOK_SECRET
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- OPENAI_API_KEY (for n8n fallback)
- SLACK_WEBHOOK_URL (for alerts)
```

### Prompt 0.2 - Create Architecture Documentation

```
Create docs/ARCHITECTURE.md with a comprehensive system architecture document including:

1. High-Level Architecture Diagram (Mermaid)
   - Show: Caller → Phone System → Vapi → n8n Webhook → Supabase/CRM
   - Include: SMS confirmation path via Twilio
   - Show: Portal ↔ Supabase ↔ n8n bidirectional

2. Component Responsibilities
   - Vapi: Voice processing, conversation management, tool calling
   - n8n: Business logic orchestration, API integrations, error handling
   - Supabase: Data persistence, real-time subscriptions, auth
   - Portal: Staff management interface, analytics, configuration

3. Data Flow Diagrams
   - Inbound call flow (step by step)
   - Booking creation flow
   - Error/fallback flow
   - SMS confirmation flow

4. State Machine Diagram (from the guide's Section 2.1.2)
   - GREETING → QUALIFICATION → AVAILABILITY_CHECK → NEGOTIATION → CONFIRMATION → END_CALL
   - Include HANDOFF state

5. Security Architecture
   - Webhook authentication
   - API key management
   - PII handling

Reference Section 2 of the Restaurant AI Automation Master Guide for technical details.
```

---

## PHASE 1: Database Schema & Supabase Setup

### Prompt 1.1 - Create Database Schema

```
Create database/schema.sql with a complete Supabase/PostgreSQL schema for the Voice AI Receptionist system.

Based on the data requirements in the guide, create tables for:

1. restaurants
   - id (uuid, PK)
   - name, phone, address
   - timezone
   - business_hours (jsonb) - e.g., {"monday": {"open": "17:00", "close": "22:00"}, ...}
   - settings (jsonb) - vapi_assistant_id, default_party_max, sms_enabled, etc.
   - created_at, updated_at

2. calls
   - id (uuid, PK)
   - restaurant_id (FK)
   - vapi_call_id (unique)
   - caller_phone (encrypted or masked for display)
   - caller_phone_hash (for deduplication)
   - started_at, ended_at
   - duration_seconds
   - status (enum: completed, transferred, abandoned, error)
   - outcome (enum: booking_made, callback_requested, faq_answered, transferred_safety, transferred_large_party, no_availability, caller_hangup)
   - transcript (text)
   - recording_url
   - metadata (jsonb) - raw vapi data
   - created_at

3. bookings
   - id (uuid, PK)
   - restaurant_id (FK)
   - call_id (FK, nullable - can be manual)
   - customer_name
   - customer_phone
   - customer_email (nullable)
   - booking_datetime
   - party_size
   - seating_preference (enum: indoor, outdoor, bar, any)
   - special_requests (text)
   - status (enum: confirmed, cancelled, no_show, completed)
   - confirmation_sent_at
   - confirmation_method (enum: sms, email, none)
   - source (enum: voice_ai, manual, online)
   - notes (text)
   - created_at, updated_at

4. callbacks
   - id (uuid, PK)
   - restaurant_id (FK)
   - call_id (FK)
   - customer_name
   - customer_phone
   - reason (enum: crm_error, no_availability, customer_request, safety_transfer, large_party)
   - priority (enum: urgent, normal, low)
   - status (enum: pending, in_progress, completed, cancelled)
   - assigned_to (text, nullable)
   - notes (text)
   - resolved_at
   - created_at, updated_at

5. availability_overrides
   - id (uuid, PK)
   - restaurant_id (FK)
   - date
   - override_type (enum: closed, limited, extended)
   - available_slots (jsonb, nullable) - for limited days
   - reason (text)
   - created_by
   - created_at

6. knowledge_base
   - id (uuid, PK)
   - restaurant_id (FK)
   - category (enum: dietary, parking, hours, cancellation, large_party, other)
   - question_patterns (text[]) - common phrasings
   - answer (text)
   - hard_rule (text, nullable) - e.g., "IF allergy → TRANSFER"
   - is_active (boolean)
   - created_at, updated_at

7. analytics_daily
   - id (uuid, PK)
   - restaurant_id (FK)
   - date
   - total_calls
   - completed_bookings
   - callbacks_created
   - avg_call_duration
   - completion_rate
   - peak_hour
   - common_outcomes (jsonb)
   - created_at

Include:
- Row Level Security (RLS) policies for multi-tenant access
- Indexes on frequently queried columns
- Triggers for updated_at timestamps
- Trigger to aggregate daily analytics
- Comments on all tables and columns explaining purpose

Also create database/seed.sql with sample data for one test restaurant.
```

### Prompt 1.2 - Create Supabase Functions

```
Create database/functions.sql with Supabase Edge Functions / PostgreSQL functions for:

1. check_availability(restaurant_id, datetime, party_size, seating_pref)
   - Returns: { status, available_slots[], message }
   - Checks business_hours, availability_overrides, existing bookings
   - Returns up to 3 alternative slots if requested time unavailable
   - Considers party size vs table capacity

2. create_booking(restaurant_id, call_id, customer_data, booking_data)
   - Returns: { booking_id, confirmation_code, status }
   - Creates booking record
   - Handles race condition (slot taken between check and book)
   - Returns 409 Conflict if slot no longer available

3. log_call(restaurant_id, vapi_call_data)
   - Inserts/updates call record
   - Handles idempotency via vapi_call_id
   - Masks phone number for storage

4. get_daily_analytics(restaurant_id, date_range)
   - Returns aggregated metrics
   - Used by portal dashboard

5. update_knowledge_base(restaurant_id, category, items)
   - Upserts knowledge base entries
   - Used by portal settings

Include proper error handling, logging, and comments.
```

---

## PHASE 2: n8n Workflow Implementation

### Prompt 2.1 - Create Main Webhook Handler Workflow

```
Create n8n/workflows/voice-ai-webhook.json as a complete n8n workflow JSON that can be imported directly.

This is the MAIN webhook handler for Vapi function calls. Based on Section 2.5 of the guide:

Workflow Structure:
1. Webhook Trigger Node
   - Path: /webhook/vapi-restaurant
   - Method: POST
   - Authentication: Header Auth (X-Vapi-Secret)
   - Response Mode: "Last Node" (for sync response to Vapi)

2. Validate Request Node (Code)
   - Verify X-Vapi-Secret header matches env var
   - Parse function call name and parameters
   - Return 401 if auth fails

3. Switch Node: Route by Function Name
   - check_availability → Branch A
   - book_appointment → Branch B  
   - transfer_call → Branch C
   - Default → Error response

4. Branch A: Check Availability
   a. Code Node: Parse parameters (datetime, party_size, seating_pref)
   b. HTTP Request: Call Supabase function check_availability
   c. Code Node: Format response for Vapi
      - Return: { results: [{ toolCallId, result: JSON.stringify(availability) }] }

5. Branch B: Book Appointment
   a. Code Node: Parse all booking parameters
   b. HTTP Request: Call Supabase function create_booking
   c. IF Node: Check if booking successful
      - Yes → Trigger SMS confirmation (webhook to confirmation workflow)
      - No (409 Conflict) → Return "slot taken, re-query" response
   d. Code Node: Format success/error response for Vapi

6. Branch C: Transfer Call
   a. Code Node: Log transfer reason
   b. HTTP Request: Create callback record in Supabase
   c. HTTP Request: Send Slack alert for urgent transfers
   d. Return: { results: [{ toolCallId, result: "transferring" }] }

7. Error Handler (connected to all branches)
   - Catch any errors
   - Log to Supabase error table
   - Return graceful fallback response to Vapi:
     "I'm having trouble accessing our system. Can I take your number for a callback?"

Include all node configurations with proper:
- Credential references (use placeholders like {{$credentials.supabase}})
- Error handling on each HTTP request
- Timeout settings (5 second max for real-time voice)
- Retry logic where appropriate

Output as valid n8n workflow JSON that can be directly imported.
```

### Prompt 2.2 - Create SMS Confirmation Workflow

```
Create n8n/workflows/booking-confirmation.json as an n8n workflow for sending SMS confirmations.

Workflow Structure:
1. Webhook Trigger
   - Path: /webhook/send-confirmation
   - Internal only (called by main workflow)

2. Get Booking Details Node
   - Fetch full booking from Supabase by booking_id

3. Format SMS Message Node (Code)
   - Template: "Hi {name}! Your reservation at {restaurant} is confirmed for {date} at {time}, party of {size}. Reply CANCEL to cancel. Questions? Call {phone}"
   - Ensure message under 160 chars or handle multi-part

4. Twilio Send SMS Node
   - To: customer_phone from booking
   - From: Restaurant's Twilio number
   - Body: formatted message

5. Update Booking Node
   - Set confirmation_sent_at = NOW()
   - Set confirmation_method = 'sms'

6. Error Handler
   - If Twilio fails, log error
   - Create callback record for manual confirmation
   - Don't fail the overall booking

Include TCPA compliance note in workflow description.
```

### Prompt 2.3 - Create Callback Handler Workflow

```
Create n8n/workflows/callback-handler.json for managing failed booking callbacks.

Workflow Structure:
1. Scheduled Trigger
   - Run every 15 minutes during business hours

2. Get Pending Callbacks Node
   - Query Supabase for callbacks where:
     - status = 'pending'
     - created_at > 10 minutes ago (give initial handler time)
     - priority sorted (urgent first)

3. Loop Over Callbacks

4. For Each Callback:
   a. Check if still pending (avoid race condition)
   b. IF priority = 'urgent' AND age > 30 minutes
      - Send Slack escalation to owner
   c. IF priority = 'normal' AND age > 2 hours
      - Escalate to 'urgent'
      - Send Slack notification

5. Generate Daily Callback Summary
   - At end of day, summarize unresolved callbacks
   - Send email/Slack digest to manager

Include proper error handling and idempotency.
```

---

## PHASE 3: Vapi Voice Agent Configuration

### Prompt 3.1 - Create Vapi Assistant Configuration

```
Create vapi/assistant-config.json with the complete Vapi assistant configuration.

Based on Section 2.4 and 2.6 of the guide, configure:

{
  "name": "Restaurant AI Receptionist",
  "model": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7,
    "maxTokens": 500,
    "systemPrompt": "{{LOAD_FROM_PROMPTS_FILE}}"
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "{{FRIENDLY_PROFESSIONAL_VOICE}}",
    "stability": 0.5,
    "similarityBoost": 0.75
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-2",
    "language": "en-US"
  },
  "firstMessage": "Thank you for calling {{restaurant_name}}. How can I help you today?",
  "endCallMessage": "Thank you for calling {{restaurant_name}}. We look forward to seeing you!",
  "silenceTimeoutSeconds": 10,
  "maxDurationSeconds": 300,
  "backgroundSound": "office",
  "recordingEnabled": true,
  "tools": [
    "{{REFERENCE_check_availability}}",
    "{{REFERENCE_book_appointment}}",
    "{{REFERENCE_transfer_call}}"
  ],
  "serverUrl": "{{N8N_WEBHOOK_URL}}",
  "serverUrlSecret": "{{WEBHOOK_SECRET}}"
}

Include comments explaining each configuration choice.
Create a separate setup script or instructions for actually creating this in Vapi.
```

### Prompt 3.2 - Create Vapi Tool Definitions

```
Create the following tool definition files:

1. vapi/tools/check-availability.json
Based on Section 2.2.1 of the guide, create the complete tool definition including:
- name, description
- parameters schema (search_datetime, party_size, seating_preference)
- server configuration pointing to n8n webhook

2. vapi/tools/book-appointment.json
Based on Section 2.2.2, create tool for booking including:
- All customer and booking parameters
- Phone number validation pattern
- Required vs optional fields

3. vapi/tools/transfer-call.json
Create tool for transferring to human:
- reason parameter (enum: safety, large_party, customer_request, escalation)
- target parameter (enum: manager, events, default)

Each file should be valid JSON that can be used with Vapi's API.
Include the exact JSON structure Vapi expects.
```

### Prompt 3.3 - Create Production System Prompt

```
Create vapi/prompts/system-prompt.md with the complete production system prompt.

Copy and enhance the system prompt from Section 2.4 of the guide.

Structure:
1. Role definition
2. Core mission
3. CRITICAL SAFETY RULES (with emphasis formatting)
   - Allergy handling
   - Large party handling  
   - Never make up availability
   - Never offer compensation
4. Conversation rules
   - Response length limits
   - Information gathering order
   - Tool usage requirements
5. Latency management (filler phrases)
6. FAQ responses (parameterized for restaurant)
7. Call ending protocol
8. Error recovery scripts

Use {{PLACEHOLDER}} syntax for restaurant-specific values:
- {{RESTAURANT_NAME}}
- {{OWNER_NAME}}
- {{VALET_PRICE}}
- {{PARKING_STREET}}
- {{CONTACT_EMAIL}}
- {{MANAGER_PHONE}}

Include instructions for how to populate these placeholders.
```

### Prompt 3.4 - Create Knowledge Base Structure

```
Create vapi/knowledge-base/restaurant-policies.json with a structured knowledge base.

Based on Section 2.6 of the guide, create JSON structure:

{
  "version": "1.0",
  "restaurant_id": "{{RESTAURANT_ID}}",
  "last_updated": "{{TIMESTAMP}}",
  "categories": {
    "dietary": {
      "policies": [
        {
          "id": "diet-001",
          "topic": "Gluten Free",
          "answer": "We offer several gluten-free options. Our server can guide you through the menu.",
          "hard_rule": null
        },
        {
          "id": "diet-002", 
          "topic": "Nut Allergies",
          "answer": null,
          "hard_rule": "TRANSFER_IMMEDIATELY",
          "transfer_script": "For your safety, I cannot guarantee our kitchen is nut-free. Let me connect you with a manager who can discuss our preparation practices."
        }
      ]
    },
    "parking": { ... },
    "hours": { ... },
    "cancellation": { ... },
    "large_party": { ... },
    "specials": { ... }
  }
}

Include:
- At least 3 entries per category
- Mix of simple answers and hard rules
- Transfer scripts where needed
- Structure that can be edited via portal
```

---

## PHASE 4: Management Portal MVP

### Prompt 4.1 - Scaffold Portal Project

```
Create the management portal using React + TypeScript + Tailwind + Supabase.

In the portal/ directory, initialize a new Vite React TypeScript project and set up:

1. Project structure:
portal/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsCard.tsx
│   │   │   ├── RecentCalls.tsx
│   │   │   ├── TodayBookings.tsx
│   │   │   └── CallbackQueue.tsx
│   │   ├── calls/
│   │   │   ├── CallList.tsx
│   │   │   ├── CallDetail.tsx
│   │   │   └── CallFilters.tsx
│   │   ├── bookings/
│   │   │   ├── BookingList.tsx
│   │   │   ├── BookingForm.tsx
│   │   │   └── CalendarView.tsx
│   │   ├── settings/
│   │   │   ├── BusinessHours.tsx
│   │   │   ├── KnowledgeBase.tsx
│   │   │   └── Notifications.tsx
│   │   └── ui/               # Shared components
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Calls.tsx
│   │   ├── Bookings.tsx
│   │   ├── Callbacks.tsx
│   │   ├── Settings.tsx
│   │   └── Analytics.tsx
│   ├── hooks/
│   │   ├── useSupabase.ts
│   │   ├── useCalls.ts
│   │   ├── useBookings.ts
│   │   └── useRealtime.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── utils.ts
│   ├── types/
│   │   └── database.ts       # Generated from Supabase
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts

2. Install dependencies:
- @supabase/supabase-js
- @tanstack/react-query
- react-router-dom
- date-fns
- recharts (for analytics)
- lucide-react (icons)

3. Configure:
- Tailwind with custom theme (professional blue/slate palette)
- Supabase client with env vars
- React Router with protected routes
- React Query for data fetching

Create all scaffold files with basic structure and TODO comments.
```

### Prompt 4.2 - Implement Dashboard Page

```
Implement portal/src/pages/Dashboard.tsx as the main dashboard page.

Based on the portal requirements analysis, create:

1. Header Section
   - Restaurant name
   - Current date/time
   - System status indicator (green/yellow/red based on recent error rate)

2. Stats Cards Row (4 cards)
   - Today's Calls (count + vs yesterday %)
   - Bookings Made (count + completion rate)
   - Callbacks Pending (count, highlighted if > 0)
   - Avg Call Duration (mm:ss)

3. Two-Column Layout Below:

   Left Column (60%):
   - Recent Calls Table (last 10)
     - Time, Duration, Outcome, Customer (masked phone)
     - Click row to open detail modal
   
   Right Column (40%):
   - Today's Bookings Timeline
     - Visual timeline of upcoming reservations
     - Party size indicators
   - Pending Callbacks Queue
     - Sorted by priority
     - Quick action buttons (Mark Complete, Call Back)

4. Real-time Updates
   - Use Supabase real-time subscriptions
   - New calls appear at top automatically
   - Callback queue updates live

Include:
- Loading states
- Empty states
- Error handling
- Responsive design
- Proper TypeScript types
```

### Prompt 4.3 - Implement Calls Page

```
Implement portal/src/pages/Calls.tsx for viewing and managing call history.

Features:
1. Filter Bar
   - Date range picker
   - Outcome filter (dropdown)
   - Status filter
   - Search by phone (last 4 digits)

2. Call List Table
   - Columns: Date/Time, Duration, Caller, Outcome, Status, Actions
   - Sortable columns
   - Pagination (20 per page)
   - Row click opens detail panel

3. Call Detail Side Panel
   - Full transcript display
   - Audio player for recording (if available)
   - Timeline of events during call
   - Outcome details
   - If booking made: link to booking
   - If callback created: link to callback
   - Add notes field

4. Export functionality
   - Download CSV of filtered results

Include proper hooks:
- useCalls(filters, pagination)
- useCallDetail(callId)

Make sure phone numbers are masked: +1-XXX-XXX-1234
```

### Prompt 4.4 - Implement Settings Page

```
Implement portal/src/pages/Settings.tsx for restaurant configuration.

Sections:
1. Business Information
   - Restaurant name
   - Phone number
   - Address
   - Timezone selector

2. Business Hours
   - 7-day grid with open/close times
   - Closed toggle per day
   - Last seating offset (e.g., "1 hour before close")

3. Booking Settings
   - Default max party size for AI
   - Large party threshold (when to transfer)
   - Confirmation SMS template (with preview)
   - Cancellation policy text

4. Knowledge Base Editor
   - Category tabs (Dietary, Parking, Hours, etc.)
   - Add/Edit/Delete entries
   - Question patterns (array input)
   - Answer text
   - Hard rule toggle with transfer script

5. Notifications
   - Slack webhook URL
   - Alert thresholds (error rate, callback age)
   - Email for daily digest

6. Danger Zone
   - Regenerate webhook secret
   - Clear test data

All changes should save to Supabase with optimistic updates.
Include validation and confirmation dialogs for destructive actions.
```

### Prompt 4.5 - Implement Callbacks Page

```
Implement portal/src/pages/Callbacks.tsx for managing callback queue.

Features:
1. Priority Tabs
   - All | Urgent | Normal | Completed (today)
   
2. Callback Cards (Kanban-style or list)
   - Customer name and phone (with click-to-call link)
   - Reason for callback
   - Time since created
   - Original call summary
   - Priority indicator (red urgent, yellow normal)

3. Actions per Callback
   - Mark as In Progress (assigns to current user)
   - Mark Complete (with resolution notes)
   - Call Back (opens phone dialer)
   - Create Booking (opens booking form with prefill)
   - Cancel/Invalid

4. Resolution Flow
   - When marking complete, require:
     - Resolution type (booked, no answer, declined, other)
     - Notes
   - If booked: link to created booking

5. Metrics Bar
   - Avg resolution time
   - Open callbacks by reason
   - Oldest pending callback

Real-time updates essential - callbacks can be created any time by voice AI.
```

---

## PHASE 5: Integration Testing

### Prompt 5.1 - Create Integration Test Suite

```
Create tests/integration/ with test scripts for the complete system.

tests/integration/
├── setup.ts                    # Test environment setup
├── test-check-availability.ts  # Test availability checking
├── test-booking-flow.ts        # Test full booking flow
├── test-error-handling.ts      # Test error scenarios
├── test-transfer-flows.ts      # Test safety transfers
└── run-all.ts                  # Test runner

For each test file, create tests that:

1. test-check-availability.ts
   - Test available slot returns correctly
   - Test unavailable slot returns alternatives
   - Test party size limits respected
   - Test seating preference filtering
   - Test availability override handling

2. test-booking-flow.ts
   - Test happy path: check → book → confirm
   - Test race condition: slot taken between check and book
   - Test SMS confirmation sent
   - Test booking appears in database
   - Test call record updated with outcome

3. test-error-handling.ts
   - Test CRM timeout (mock 5+ second delay)
   - Test graceful fallback response
   - Test callback created on error
   - Test Slack alert sent on critical error

4. test-transfer-flows.ts
   - Test allergy keyword triggers transfer
   - Test large party triggers transfer
   - Test callback created with correct priority
   - Test transfer reason logged

Use environment:
- Test Supabase project (or local)
- Mock n8n webhook responses where needed
- Actually call Vapi API for end-to-end tests (optional, mark as e2e)

Include setup/teardown that cleans test data.
```

### Prompt 5.2 - Create Load Testing Scripts

```
Create tests/load/ with load testing scripts.

tests/load/
├── README.md                   # How to run load tests
├── scenarios/
│   ├── concurrent-calls.js     # Simulate concurrent call handling
│   ├── booking-surge.js        # Simulate Friday evening booking rush
│   └── webhook-stress.js       # Stress test n8n webhook
└── k6-config.js                # k6 configuration

Using k6 or similar, create tests for:

1. concurrent-calls.js
   - Ramp up to 50 concurrent "calls" (webhook requests)
   - Each call simulates: check_availability → book_appointment
   - Measure: Response time p95, error rate
   - Target: p95 < 2 seconds, error rate < 1%

2. booking-surge.js
   - Simulate Friday 5-7pm rush
   - 100 booking attempts in 30 minutes
   - Mix of successful and conflicting bookings
   - Measure: Conflict handling, data integrity

3. webhook-stress.js
   - 1000 requests/minute to webhook
   - Verify no HTTP 429 errors
   - Verify all requests logged

Include:
- Clear pass/fail criteria
- Reporting output
- Instructions for running against staging
```

---

## PHASE 6: Monitoring & Alerting

### Prompt 6.1 - Create Monitoring Configuration

```
Create monitoring configuration for the system.

Create files:
1. docs/RUNBOOK.md
   - System health check procedures
   - Common issues and resolutions
   - Escalation procedures
   - Contact list

2. n8n/workflows/monitoring-alerts.json
   - Scheduled workflow (every 5 minutes)
   - Check: Recent error rate from calls table
   - Check: Pending callbacks count
   - Check: n8n execution failures
   - Alert thresholds from Section 6.1 of guide:
     - Critical: error rate > 20%
     - High: latency > 4s (check logs)
     - Medium: completion rate < 85%
   - Send Slack alerts with proper formatting

3. portal/src/components/dashboard/SystemHealth.tsx
   - Component showing current system status
   - Green/Yellow/Red indicator
   - Last check timestamp
   - Quick links to relevant sections

Include all KPIs from Section 6.1 of the guide with their targets and alert thresholds.
```

### Prompt 6.2 - Create Deployment Documentation

```
Create comprehensive deployment documentation.

1. docs/DEPLOYMENT.md
   - Prerequisites checklist
   - Step-by-step deployment for each component:
     a. Supabase project setup
     b. n8n deployment (self-hosted or cloud)
     c. Vapi assistant creation
     d. Portal deployment (Vercel)
     e. DNS and SSL configuration
   - Environment variable setup guide
   - Post-deployment verification checklist

2. docs/SECURITY.md
   - API key rotation procedures
   - Webhook secret rotation
   - PII handling compliance
   - Audit log retention
   - Incident response procedures

3. .github/workflows/deploy.yml (or equivalent)
   - CI/CD pipeline for portal
   - Automated tests before deploy
   - Deployment to Vercel

Include rollback procedures for each component.
```

---

## Validation Checkpoints

After each phase, verify:

### Phase 0 Checkpoint
- [ ] All directories created
- [ ] README.md has clear setup instructions
- [ ] Architecture diagram renders correctly
- [ ] .env.example has all required variables

### Phase 1 Checkpoint
- [ ] schema.sql runs without errors in Supabase
- [ ] seed.sql creates valid test data
- [ ] RLS policies work correctly
- [ ] Functions return expected results

### Phase 2 Checkpoint
- [ ] Workflows import successfully into n8n
- [ ] Webhooks respond to test requests
- [ ] Error handling works (test with intentional failures)
- [ ] SMS sends correctly via Twilio

### Phase 3 Checkpoint
- [ ] Vapi assistant created and responds
- [ ] Tools connect to n8n webhooks
- [ ] System prompt produces expected behavior
- [ ] Knowledge base answers correctly

### Phase 4 Checkpoint
- [ ] Portal builds without errors
- [ ] Dashboard shows real-time data
- [ ] All CRUD operations work
- [ ] Responsive on mobile

### Phase 5 Checkpoint
- [ ] All integration tests pass
- [ ] Load tests meet targets
- [ ] No data integrity issues

### Phase 6 Checkpoint
- [ ] Alerts fire correctly
- [ ] Runbook covers all scenarios
- [ ] Deployment can be repeated reliably

---

## Quick Reference: Running Claude Code

```bash
# Navigate to project directory
cd voice-ai-receptionist

# Run prompts sequentially
# Copy each prompt section and paste into Claude Code CLI

# Between phases, verify checkpoints before proceeding

# For long prompts, save to a file and use:
cat prompts/phase1-prompt1.md | claude-code
```

---

## Support & Troubleshooting

If Claude Code encounters issues:
1. Check the Restaurant_AI_Automation_Master_Guide_v2.docx is in the same directory
2. Ensure all environment variables are set
3. Verify API keys have correct permissions
4. Check n8n and Supabase are accessible

For complex debugging, provide Claude Code with:
- Error messages
- Relevant log output
- Current state of the affected component
