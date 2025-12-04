-- =============================================================================
-- Voice AI Receptionist - Database Schema
-- =============================================================================
-- Complete Supabase/PostgreSQL schema for the Voice AI Receptionist system.
-- Based on Section 2 of the Restaurant AI Automation Master Guide v2.0.
--
-- Run this in your Supabase SQL Editor to set up the database schema.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- For phone hashing
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram matching for search

-- =============================================================================
-- CUSTOM TYPES (ENUMS)
-- =============================================================================

-- Call status enum: tracks the final state of each voice call
CREATE TYPE call_status AS ENUM (
    'completed',      -- Call ended normally (booking made, FAQ answered)
    'transferred',    -- Call was transferred to human
    'abandoned',      -- Caller hung up before completion
    'error'           -- System error occurred
);

COMMENT ON TYPE call_status IS 'Final state of a voice AI call';

-- Call outcome enum: describes what was accomplished on the call
CREATE TYPE call_outcome AS ENUM (
    'booking_made',           -- Reservation successfully created
    'callback_requested',     -- System error, callback scheduled
    'faq_answered',           -- Question answered, no booking
    'transferred_safety',     -- Transferred due to allergy/safety
    'transferred_large_party', -- Transferred due to party > 8
    'transferred_customer',   -- Customer requested transfer
    'no_availability',        -- No slots available for requested time
    'caller_hangup',          -- Caller ended call prematurely
    'system_error'            -- Technical failure
);

COMMENT ON TYPE call_outcome IS 'What was accomplished during the call';

-- Reservation status enum: lifecycle of a booking
CREATE TYPE reservation_status AS ENUM (
    'confirmed',      -- Active reservation
    'seated',         -- Guest has arrived and been seated
    'completed',      -- Dining completed
    'cancelled',      -- Cancelled by customer
    'no_show'         -- Customer did not arrive
);

COMMENT ON TYPE reservation_status IS 'Lifecycle state of a reservation';

-- Callback status enum: tracks callback queue items
CREATE TYPE callback_status AS ENUM (
    'pending',        -- Awaiting staff action
    'in_progress',    -- Staff is working on it
    'resolved',       -- Successfully resolved
    'failed'          -- Could not reach customer
);

COMMENT ON TYPE callback_status IS 'Status of callback queue items';

-- Knowledge base category enum
CREATE TYPE kb_category AS ENUM (
    'dietary',        -- Dietary accommodations, allergies
    'parking',        -- Parking information
    'hours',          -- Operating hours
    'cancellation',   -- Cancellation policy
    'large_party',    -- Large party/events info
    'dress_code',     -- Dress code
    'reservations',   -- General reservation info
    'payment',        -- Payment methods
    'other'           -- Miscellaneous
);

COMMENT ON TYPE kb_category IS 'Categories for knowledge base entries';

-- Seating type enum
CREATE TYPE seating_type AS ENUM (
    'indoor',
    'outdoor',
    'bar',
    'private'
);

COMMENT ON TYPE seating_type IS 'Available seating areas in the restaurant';

-- =============================================================================
-- TABLE: restaurants
-- =============================================================================
-- Core configuration for each restaurant location. Multi-tenant design allows
-- one database to serve multiple restaurant locations.

CREATE TABLE restaurants (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Basic information
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,

    -- Timezone for all datetime operations
    -- Use IANA timezone names: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',

    -- Operating hours stored as JSONB for flexibility
    -- Format: {"monday": {"open": "17:00", "close": "22:00"}, "tuesday": null, ...}
    -- null = closed that day
    business_hours JSONB NOT NULL DEFAULT '{
        "monday": null,
        "tuesday": {"open": "17:00", "close": "22:00"},
        "wednesday": {"open": "17:00", "close": "22:00"},
        "thursday": {"open": "17:00", "close": "22:00"},
        "friday": {"open": "17:00", "close": "23:00"},
        "saturday": {"open": "17:00", "close": "23:00"},
        "sunday": {"open": "16:00", "close": "21:00"}
    }'::jsonb,

    -- All configurable settings in one JSONB column for flexibility
    settings JSONB NOT NULL DEFAULT '{
        "vapi_assistant_id": null,
        "default_party_max": 20,
        "large_party_threshold": 8,
        "last_seating_offset_minutes": 60,
        "sms_enabled": true,
        "sms_reminder_hours_before": 24,
        "cancellation_notice_hours": 24,
        "no_show_fee_per_person": 25.00,
        "no_show_fee_party_threshold": 6,
        "valet_price": 15.00,
        "free_parking_location": null,
        "free_parking_after": null,
        "allow_same_day_booking": true,
        "max_future_booking_days": 30
    }'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Comments
COMMENT ON TABLE restaurants IS 'Core restaurant configuration. Each row represents one restaurant location.';
COMMENT ON COLUMN restaurants.id IS 'Unique identifier for the restaurant (UUID v4)';
COMMENT ON COLUMN restaurants.business_hours IS 'Weekly operating hours. null = closed. Format: {"day": {"open": "HH:MM", "close": "HH:MM"}}';
COMMENT ON COLUMN restaurants.settings IS 'All configurable settings including Vapi, SMS, and business rules';
COMMENT ON COLUMN restaurants.timezone IS 'IANA timezone name for all datetime operations';

-- Index for active restaurants
CREATE INDEX idx_restaurants_active ON restaurants(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- TABLE: calls
-- =============================================================================
-- Comprehensive call log for all voice AI interactions. Stores metadata,
-- transcripts, and links to resulting reservations or callbacks.

CREATE TABLE calls (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Vapi call identifier (unique per call)
    vapi_call_id VARCHAR(100) NOT NULL UNIQUE,

    -- Caller information
    -- Phone is stored for display but hashed for deduplication and privacy
    caller_phone VARCHAR(20),
    caller_phone_hash VARCHAR(64), -- SHA-256 hash for deduplication

    -- Call timing
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN ended_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
            ELSE NULL
        END
    ) STORED,

    -- Call result
    status call_status NOT NULL DEFAULT 'completed',
    outcome call_outcome,

    -- Transcript and recording (stored in Vapi, URLs here)
    transcript TEXT,
    recording_url TEXT,

    -- Links to resulting records
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    callback_id UUID REFERENCES callbacks(id) ON DELETE SET NULL,

    -- Safety tracking
    safety_trigger_activated BOOLEAN NOT NULL DEFAULT FALSE,
    safety_trigger_type VARCHAR(50), -- 'allergy', 'large_party', 'legal', etc.

    -- Performance metrics
    tool_calls_count INTEGER DEFAULT 0,
    avg_tool_latency_ms INTEGER,

    -- Raw Vapi webhook data for debugging and analytics
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE calls IS 'Audit log for all voice AI calls. Links to reservations and callbacks.';
COMMENT ON COLUMN calls.vapi_call_id IS 'Unique call ID from Vapi webhook';
COMMENT ON COLUMN calls.caller_phone IS 'Caller phone number (may be masked in display)';
COMMENT ON COLUMN calls.caller_phone_hash IS 'SHA-256 hash of phone for deduplication without storing PII';
COMMENT ON COLUMN calls.duration_seconds IS 'Auto-calculated call duration in seconds';
COMMENT ON COLUMN calls.transcript IS 'Full call transcript from Vapi';
COMMENT ON COLUMN calls.metadata IS 'Raw Vapi webhook payload for debugging';
COMMENT ON COLUMN calls.safety_trigger_type IS 'Type of safety trigger: allergy, large_party, legal, customer_request';

-- Indexes for common queries
CREATE INDEX idx_calls_restaurant_date ON calls(restaurant_id, started_at DESC);
CREATE INDEX idx_calls_vapi_id ON calls(vapi_call_id);
CREATE INDEX idx_calls_phone_hash ON calls(caller_phone_hash);
CREATE INDEX idx_calls_status ON calls(restaurant_id, status);
CREATE INDEX idx_calls_outcome ON calls(restaurant_id, outcome);
CREATE INDEX idx_calls_safety ON calls(restaurant_id, safety_trigger_activated)
    WHERE safety_trigger_activated = TRUE;

-- =============================================================================
-- TABLE: customers
-- =============================================================================
-- Customer contact information with TCPA consent tracking and visit history.

CREATE TABLE customers (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship (customers are per-restaurant)
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Contact information
    phone VARCHAR(20) NOT NULL,
    phone_hash VARCHAR(64) NOT NULL, -- SHA-256 for lookups
    name VARCHAR(255),
    email VARCHAR(255),

    -- TCPA SMS consent tracking (legally required)
    sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
    sms_consent_timestamp TIMESTAMPTZ,
    sms_consent_source VARCHAR(50), -- 'voice_ai', 'web', 'in_person', 'import'
    sms_opt_out_timestamp TIMESTAMPTZ, -- When they opted out (if ever)

    -- Preferences
    preferred_seating seating_type,
    dietary_notes TEXT,
    special_occasions JSONB, -- {"birthday": "03-15", "anniversary": "06-20"}
    notes TEXT, -- Staff notes

    -- Visit statistics (denormalized for quick access)
    total_reservations INTEGER NOT NULL DEFAULT 0,
    completed_visits INTEGER NOT NULL DEFAULT 0,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    last_visit_date DATE,

    -- VIP/loyalty status
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    vip_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One customer record per phone per restaurant
    CONSTRAINT unique_customer_phone UNIQUE(restaurant_id, phone_hash)
);

-- Comments
COMMENT ON TABLE customers IS 'Customer profiles with contact info, preferences, and TCPA consent tracking';
COMMENT ON COLUMN customers.phone_hash IS 'SHA-256 hash of phone number for lookups';
COMMENT ON COLUMN customers.sms_consent IS 'TCPA: Has customer consented to receive SMS? Required before sending.';
COMMENT ON COLUMN customers.sms_consent_source IS 'How consent was obtained: voice_ai, web, in_person, import';
COMMENT ON COLUMN customers.dietary_notes IS 'Dietary restrictions or preferences noted by staff';

-- Indexes
CREATE INDEX idx_customers_phone_hash ON customers(restaurant_id, phone_hash);
CREATE INDEX idx_customers_name ON customers(restaurant_id, name)
    WHERE name IS NOT NULL;
CREATE INDEX idx_customers_vip ON customers(restaurant_id, is_vip)
    WHERE is_vip = TRUE;

-- =============================================================================
-- TABLE: availability_slots
-- =============================================================================
-- Manages reservation slots by time and seating type. Capacity is tracked
-- to prevent overbooking.

CREATE TABLE availability_slots (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Slot timing
    slot_datetime TIMESTAMPTZ NOT NULL,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 90, -- Default dining duration

    -- Seating configuration
    seating_type seating_type NOT NULL DEFAULT 'indoor',

    -- Capacity management
    total_capacity INTEGER NOT NULL,
    booked_capacity INTEGER NOT NULL DEFAULT 0,

    -- Computed availability (auto-updated)
    available_capacity INTEGER GENERATED ALWAYS AS (
        GREATEST(0, total_capacity - booked_capacity)
    ) STORED,
    is_available BOOLEAN GENERATED ALWAYS AS (
        booked_capacity < total_capacity
    ) STORED,

    -- Manual blocking for special events
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason TEXT,
    blocked_by VARCHAR(255),
    blocked_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate slots
    CONSTRAINT unique_slot UNIQUE(restaurant_id, slot_datetime, seating_type),

    -- Ensure capacity is valid
    CONSTRAINT valid_capacity CHECK (total_capacity > 0),
    CONSTRAINT valid_booked CHECK (booked_capacity >= 0)
);

-- Comments
COMMENT ON TABLE availability_slots IS 'Time slots available for reservations with capacity tracking';
COMMENT ON COLUMN availability_slots.slot_datetime IS 'Start time of the reservation slot';
COMMENT ON COLUMN availability_slots.total_capacity IS 'Maximum number of guests that can be seated';
COMMENT ON COLUMN availability_slots.booked_capacity IS 'Current number of guests booked';
COMMENT ON COLUMN availability_slots.is_blocked IS 'Manual block for private events or maintenance';

-- Indexes for availability queries
CREATE INDEX idx_slots_availability ON availability_slots(
    restaurant_id,
    slot_datetime,
    seating_type,
    is_available
) WHERE is_blocked = FALSE AND slot_datetime > NOW();

CREATE INDEX idx_slots_datetime ON availability_slots(restaurant_id, slot_datetime);

-- =============================================================================
-- TABLE: reservations
-- =============================================================================
-- Booking records with full lifecycle tracking.

CREATE TABLE reservations (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relationships
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    slot_id UUID REFERENCES availability_slots(id) ON DELETE SET NULL,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,

    -- Human-readable confirmation code (auto-generated)
    confirmation_code VARCHAR(10) NOT NULL UNIQUE,

    -- Booking details
    reservation_datetime TIMESTAMPTZ NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size >= 1 AND party_size <= 100),
    seating_type seating_type,
    special_requests TEXT,

    -- Customer info (denormalized for quick access and historical record)
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),

    -- Status tracking
    status reservation_status NOT NULL DEFAULT 'confirmed',
    status_changed_at TIMESTAMPTZ,
    status_changed_by VARCHAR(255), -- 'system', 'staff:username', 'customer'

    -- Cancellation details
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancellation_source VARCHAR(50), -- 'voice_ai', 'sms', 'web', 'phone', 'staff'

    -- Source tracking
    source VARCHAR(50) NOT NULL DEFAULT 'voice_ai',
    source_details JSONB, -- Additional source info

    -- SMS tracking
    sms_confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
    sms_confirmation_sent_at TIMESTAMPTZ,
    sms_confirmation_sid VARCHAR(100), -- Twilio message SID
    sms_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    sms_reminder_sent_at TIMESTAMPTZ,

    -- Table assignment (for hosts)
    assigned_table VARCHAR(50),
    seated_at TIMESTAMPTZ,

    -- Staff notes
    internal_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE reservations IS 'All restaurant reservations with full lifecycle tracking';
COMMENT ON COLUMN reservations.confirmation_code IS 'Human-readable code for customer reference (auto-generated)';
COMMENT ON COLUMN reservations.source IS 'How reservation was made: voice_ai, web, phone, walk_in, third_party';
COMMENT ON COLUMN reservations.sms_confirmation_sid IS 'Twilio message SID for delivery tracking';
COMMENT ON COLUMN reservations.assigned_table IS 'Table number assigned by host (optional)';

-- Indexes for common queries
CREATE INDEX idx_reservations_datetime ON reservations(
    restaurant_id,
    reservation_datetime
);
CREATE INDEX idx_reservations_status ON reservations(
    restaurant_id,
    status,
    reservation_datetime
);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_confirmation ON reservations(confirmation_code);
CREATE INDEX idx_reservations_phone ON reservations(restaurant_id, customer_phone);

-- Today's reservations (common query)
CREATE INDEX idx_reservations_today ON reservations(
    restaurant_id,
    reservation_datetime,
    status
) WHERE status = 'confirmed';

-- =============================================================================
-- TABLE: callbacks
-- =============================================================================
-- Failed booking recovery queue. Created when system cannot complete a booking.

CREATE TABLE callbacks (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relationships
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    resulting_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,

    -- Customer info
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),

    -- Requested booking details
    requested_datetime TIMESTAMPTZ,
    party_size INTEGER,
    seating_preference seating_type,
    special_requests TEXT,

    -- Failure context
    failure_reason VARCHAR(100) NOT NULL,
    error_code VARCHAR(50),
    error_details JSONB,

    -- Priority (based on failure reason)
    priority INTEGER NOT NULL DEFAULT 5, -- 1=highest, 10=lowest

    -- Resolution tracking
    status callback_status NOT NULL DEFAULT 'pending',
    assigned_to VARCHAR(255),
    assigned_at TIMESTAMPTZ,

    -- Resolution details
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    resolution_outcome VARCHAR(50), -- 'booked', 'no_availability', 'customer_declined', 'no_answer'

    -- Attempt tracking
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE callbacks IS 'Queue of failed bookings requiring staff follow-up';
COMMENT ON COLUMN callbacks.failure_reason IS 'Why the AI could not complete booking: CRM_TIMEOUT, VALIDATION_ERROR, etc.';
COMMENT ON COLUMN callbacks.priority IS 'Priority 1-10 where 1 is highest. Safety triggers = 1.';
COMMENT ON COLUMN callbacks.attempt_count IS 'Number of callback attempts made';

-- Indexes
CREATE INDEX idx_callbacks_pending ON callbacks(
    restaurant_id,
    status,
    priority,
    created_at
) WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_callbacks_resolution ON callbacks(
    restaurant_id,
    resolved_at
) WHERE status = 'resolved';

-- =============================================================================
-- TABLE: blocked_dates
-- =============================================================================
-- Restaurant-wide closures and special hours.

CREATE TABLE blocked_dates (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Date range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Block type
    block_type VARCHAR(50) NOT NULL DEFAULT 'closed',
    -- 'closed' = fully closed
    -- 'special_hours' = open but different hours
    -- 'private_event' = closed for private event
    -- 'reduced_capacity' = open with reduced seating

    -- Special hours (if block_type = 'special_hours')
    special_hours JSONB, -- {"open": "12:00", "close": "20:00"}

    -- Capacity override (if block_type = 'reduced_capacity')
    capacity_percentage INTEGER CHECK (capacity_percentage >= 0 AND capacity_percentage <= 100),

    -- Details
    reason TEXT NOT NULL,
    public_message TEXT, -- Shown to customers

    -- Audit
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE blocked_dates IS 'Restaurant closures, holidays, and special hours';
COMMENT ON COLUMN blocked_dates.block_type IS 'Type: closed, special_hours, private_event, reduced_capacity';
COMMENT ON COLUMN blocked_dates.public_message IS 'Message shown to customers trying to book this date';

-- Indexes
CREATE INDEX idx_blocked_dates_range ON blocked_dates(
    restaurant_id,
    start_date,
    end_date
);

-- Constraint: end_date must be >= start_date
ALTER TABLE blocked_dates ADD CONSTRAINT valid_date_range
    CHECK (end_date >= start_date);

-- =============================================================================
-- TABLE: knowledge_base
-- =============================================================================
-- FAQ responses for the voice AI to use when answering customer questions.

CREATE TABLE knowledge_base (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Categorization
    category kb_category NOT NULL,

    -- Question matching
    question_patterns TEXT[] NOT NULL, -- Array of common phrasings
    keywords TEXT[], -- Additional keywords for matching

    -- Response
    answer TEXT NOT NULL,

    -- Hard rules for AI behavior
    hard_rule TEXT, -- e.g., "IF allergy → TRANSFER immediately"
    requires_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    transfer_queue VARCHAR(50), -- 'manager', 'events', 'general'

    -- Priority for matching
    priority INTEGER NOT NULL DEFAULT 5, -- 1=highest match priority

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Comments
COMMENT ON TABLE knowledge_base IS 'FAQ entries for voice AI to use when answering questions';
COMMENT ON COLUMN knowledge_base.question_patterns IS 'Array of common ways customers ask this question';
COMMENT ON COLUMN knowledge_base.hard_rule IS 'Special handling instruction, e.g., "IF allergy → TRANSFER"';
COMMENT ON COLUMN knowledge_base.requires_transfer IS 'If true, AI should transfer to human after answering';

-- Indexes
CREATE INDEX idx_kb_category ON knowledge_base(restaurant_id, category, is_active)
    WHERE is_active = TRUE;

-- Full-text search on patterns
CREATE INDEX idx_kb_patterns ON knowledge_base
    USING GIN (question_patterns);

-- =============================================================================
-- TABLE: analytics_daily
-- =============================================================================
-- Pre-aggregated daily analytics for dashboards. Populated by trigger.

CREATE TABLE analytics_daily (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Restaurant relationship
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Date (one row per restaurant per day)
    date DATE NOT NULL,

    -- Call metrics
    total_calls INTEGER NOT NULL DEFAULT 0,
    completed_calls INTEGER NOT NULL DEFAULT 0,
    transferred_calls INTEGER NOT NULL DEFAULT 0,
    abandoned_calls INTEGER NOT NULL DEFAULT 0,
    error_calls INTEGER NOT NULL DEFAULT 0,

    -- Booking metrics
    bookings_made INTEGER NOT NULL DEFAULT 0,
    bookings_via_ai INTEGER NOT NULL DEFAULT 0,
    bookings_via_callback INTEGER NOT NULL DEFAULT 0,
    total_covers INTEGER NOT NULL DEFAULT 0, -- Total guests booked

    -- Callback metrics
    callbacks_created INTEGER NOT NULL DEFAULT 0,
    callbacks_resolved INTEGER NOT NULL DEFAULT 0,

    -- Performance metrics
    avg_call_duration_seconds DECIMAL(10,2),
    avg_tool_latency_ms DECIMAL(10,2),
    completion_rate DECIMAL(5,2), -- Percentage of calls resulting in booking

    -- Time patterns
    peak_hour INTEGER, -- Hour with most calls (0-23)
    calls_by_hour JSONB, -- {"0": 0, "1": 0, ..., "23": 5}

    -- Outcome breakdown
    outcomes_breakdown JSONB, -- {"booking_made": 10, "faq_answered": 5, ...}

    -- Safety metrics
    safety_triggers INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One row per restaurant per day
    CONSTRAINT unique_daily_analytics UNIQUE(restaurant_id, date)
);

-- Comments
COMMENT ON TABLE analytics_daily IS 'Pre-aggregated daily analytics for dashboard performance';
COMMENT ON COLUMN analytics_daily.completion_rate IS 'Percentage of calls that resulted in a booking';
COMMENT ON COLUMN analytics_daily.peak_hour IS 'Hour (0-23) with the most calls';
COMMENT ON COLUMN analytics_daily.calls_by_hour IS 'JSON object mapping hour to call count';

-- Indexes
CREATE INDEX idx_analytics_date ON analytics_daily(restaurant_id, date DESC);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Generate human-readable confirmation code
-- Uses alphanumeric characters excluding confusing ones (0, O, 1, I, L)
CREATE OR REPLACE FUNCTION generate_confirmation_code()
RETURNS VARCHAR(10) AS $$
DECLARE
    chars VARCHAR(32) := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    result VARCHAR(10) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_confirmation_code() IS
    'Generates a 6-character confirmation code avoiding confusing characters (0/O, 1/I/L)';

-- Hash phone number for privacy-preserving lookups
CREATE OR REPLACE FUNCTION hash_phone(phone TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Normalize phone number: remove non-digits, ensure starts with country code
    RETURN encode(digest(
        regexp_replace(phone, '[^0-9]', '', 'g'),
        'sha256'
    ), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION hash_phone(TEXT) IS
    'Creates SHA-256 hash of phone number for privacy-preserving lookups';

-- Mask phone number for display
CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
RETURNS VARCHAR(20) AS $$
BEGIN
    -- +15551234567 → +1***-***-4567
    IF length(phone) >= 10 THEN
        RETURN regexp_replace(
            phone,
            '^(\+?1?)(\d{3})(\d{3})(\d{4})$',
            '\1***-***-\4'
        );
    ELSE
        RETURN '***-***-****';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION mask_phone(TEXT) IS
    'Masks phone number for display, showing only last 4 digits';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-generate confirmation code for reservations
CREATE OR REPLACE FUNCTION set_confirmation_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code VARCHAR(10);
    code_exists BOOLEAN;
BEGIN
    IF NEW.confirmation_code IS NULL THEN
        LOOP
            new_code := generate_confirmation_code();
            SELECT EXISTS(
                SELECT 1 FROM reservations WHERE confirmation_code = new_code
            ) INTO code_exists;
            EXIT WHEN NOT code_exists;
        END LOOP;
        NEW.confirmation_code := new_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_set_confirmation_code
    BEFORE INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION set_confirmation_code();

-- Auto-hash phone numbers
CREATE OR REPLACE FUNCTION set_phone_hash()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone_hash := hash_phone(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_set_phone_hash
    BEFORE INSERT OR UPDATE OF phone ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_phone_hash();

-- Auto-hash caller phone in calls table
CREATE OR REPLACE FUNCTION set_caller_phone_hash()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.caller_phone IS NOT NULL THEN
        NEW.caller_phone_hash := hash_phone(NEW.caller_phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_set_phone_hash
    BEFORE INSERT OR UPDATE OF caller_phone ON calls
    FOR EACH ROW
    EXECUTE FUNCTION set_caller_phone_hash();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with that column
CREATE TRIGGER update_restaurants_timestamp
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_timestamp
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_availability_slots_timestamp
    BEFORE UPDATE ON availability_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_reservations_timestamp
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_callbacks_timestamp
    BEFORE UPDATE ON callbacks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_blocked_dates_timestamp
    BEFORE UPDATE ON blocked_dates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_knowledge_base_timestamp
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_analytics_daily_timestamp
    BEFORE UPDATE ON analytics_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update customer stats when reservation status changes
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update customer statistics based on reservation status
    IF TG_OP = 'INSERT' AND NEW.customer_id IS NOT NULL THEN
        UPDATE customers
        SET total_reservations = total_reservations + 1,
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.customer_id IS NOT NULL THEN
        -- Handle status changes
        IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
            UPDATE customers
            SET completed_visits = completed_visits + 1,
                last_visit_date = DATE(NEW.reservation_datetime),
                updated_at = NOW()
            WHERE id = NEW.customer_id;
        ELSIF OLD.status != 'no_show' AND NEW.status = 'no_show' THEN
            UPDATE customers
            SET no_show_count = no_show_count + 1,
                updated_at = NOW()
            WHERE id = NEW.customer_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_update_customer_stats
    AFTER INSERT OR UPDATE OF status ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_stats();

-- Update slot capacity when reservation is made/cancelled
CREATE OR REPLACE FUNCTION update_slot_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.slot_id IS NOT NULL AND NEW.status = 'confirmed' THEN
        UPDATE availability_slots
        SET booked_capacity = booked_capacity + NEW.party_size
        WHERE id = NEW.slot_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle cancellations
        IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' AND NEW.slot_id IS NOT NULL THEN
            UPDATE availability_slots
            SET booked_capacity = GREATEST(0, booked_capacity - NEW.party_size)
            WHERE id = NEW.slot_id;
        -- Handle status changes back to confirmed
        ELSIF OLD.status = 'cancelled' AND NEW.status = 'confirmed' AND NEW.slot_id IS NOT NULL THEN
            UPDATE availability_slots
            SET booked_capacity = booked_capacity + NEW.party_size
            WHERE id = NEW.slot_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.slot_id IS NOT NULL AND OLD.status = 'confirmed' THEN
        UPDATE availability_slots
        SET booked_capacity = GREATEST(0, booked_capacity - OLD.party_size)
        WHERE id = OLD.slot_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_update_slot_capacity
    AFTER INSERT OR UPDATE OF status, party_size OR DELETE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_slot_capacity();

-- Aggregate daily analytics from calls
CREATE OR REPLACE FUNCTION aggregate_call_to_daily_analytics()
RETURNS TRIGGER AS $$
DECLARE
    call_date DATE;
    call_hour INTEGER;
BEGIN
    -- Get the date and hour of the call
    call_date := DATE(NEW.started_at AT TIME ZONE (
        SELECT timezone FROM restaurants WHERE id = NEW.restaurant_id
    ));
    call_hour := EXTRACT(HOUR FROM NEW.started_at AT TIME ZONE (
        SELECT timezone FROM restaurants WHERE id = NEW.restaurant_id
    ))::INTEGER;

    -- Upsert daily analytics
    INSERT INTO analytics_daily (
        restaurant_id,
        date,
        total_calls,
        completed_calls,
        transferred_calls,
        abandoned_calls,
        error_calls,
        bookings_made,
        callbacks_created,
        safety_triggers,
        calls_by_hour
    ) VALUES (
        NEW.restaurant_id,
        call_date,
        1,
        CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'transferred' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'abandoned' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END,
        CASE WHEN NEW.outcome = 'booking_made' THEN 1 ELSE 0 END,
        CASE WHEN NEW.outcome = 'callback_requested' THEN 1 ELSE 0 END,
        CASE WHEN NEW.safety_trigger_activated THEN 1 ELSE 0 END,
        jsonb_build_object(call_hour::text, 1)
    )
    ON CONFLICT (restaurant_id, date)
    DO UPDATE SET
        total_calls = analytics_daily.total_calls + 1,
        completed_calls = analytics_daily.completed_calls +
            CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
        transferred_calls = analytics_daily.transferred_calls +
            CASE WHEN NEW.status = 'transferred' THEN 1 ELSE 0 END,
        abandoned_calls = analytics_daily.abandoned_calls +
            CASE WHEN NEW.status = 'abandoned' THEN 1 ELSE 0 END,
        error_calls = analytics_daily.error_calls +
            CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END,
        bookings_made = analytics_daily.bookings_made +
            CASE WHEN NEW.outcome = 'booking_made' THEN 1 ELSE 0 END,
        callbacks_created = analytics_daily.callbacks_created +
            CASE WHEN NEW.outcome = 'callback_requested' THEN 1 ELSE 0 END,
        safety_triggers = analytics_daily.safety_triggers +
            CASE WHEN NEW.safety_trigger_activated THEN 1 ELSE 0 END,
        calls_by_hour = analytics_daily.calls_by_hour ||
            jsonb_build_object(
                call_hour::text,
                COALESCE((analytics_daily.calls_by_hour->>call_hour::text)::integer, 0) + 1
            ),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_aggregate_analytics
    AFTER INSERT ON calls
    FOR EACH ROW
    EXECUTE FUNCTION aggregate_call_to_daily_analytics();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for n8n backend)
-- These policies allow the service role to access all data
CREATE POLICY "Service role full access" ON restaurants
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON calls
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON customers
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON availability_slots
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON reservations
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON callbacks
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blocked_dates
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON knowledge_base
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON analytics_daily
    FOR ALL USING (true) WITH CHECK (true);

-- Portal user policies (authenticated users can only see their restaurant's data)
-- These would be used with Supabase Auth
/*
CREATE POLICY "Portal users read own restaurant" ON restaurants
    FOR SELECT USING (
        id IN (
            SELECT restaurant_id FROM user_restaurant_access
            WHERE user_id = auth.uid()
        )
    );

-- Similar policies would be created for other tables
*/

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Available slots for booking queries
CREATE OR REPLACE VIEW available_slots_view AS
SELECT
    s.id,
    s.restaurant_id,
    s.slot_datetime,
    s.seating_type,
    s.total_capacity,
    s.booked_capacity,
    s.available_capacity,
    s.slot_duration_minutes,
    r.name AS restaurant_name,
    r.timezone
FROM availability_slots s
JOIN restaurants r ON r.id = s.restaurant_id
WHERE s.is_available = TRUE
  AND s.is_blocked = FALSE
  AND s.slot_datetime > NOW()
ORDER BY s.slot_datetime;

COMMENT ON VIEW available_slots_view IS 'Available reservation slots in the future';

-- Today's reservations for hosts
CREATE OR REPLACE VIEW todays_reservations_view AS
SELECT
    res.id,
    res.restaurant_id,
    res.confirmation_code,
    res.reservation_datetime,
    res.party_size,
    res.customer_name,
    mask_phone(res.customer_phone) AS customer_phone_masked,
    res.seating_type,
    res.special_requests,
    res.status,
    res.assigned_table,
    res.seated_at,
    res.source,
    res.internal_notes,
    c.is_vip,
    c.dietary_notes,
    c.total_reservations AS customer_visit_count,
    r.timezone
FROM reservations res
JOIN restaurants r ON r.id = res.restaurant_id
LEFT JOIN customers c ON c.id = res.customer_id
WHERE DATE(res.reservation_datetime AT TIME ZONE r.timezone) =
      DATE(NOW() AT TIME ZONE r.timezone)
  AND res.status IN ('confirmed', 'seated')
ORDER BY res.reservation_datetime;

COMMENT ON VIEW todays_reservations_view IS 'Today''s confirmed and seated reservations for host stand';

-- Pending callbacks for staff
CREATE OR REPLACE VIEW pending_callbacks_view AS
SELECT
    cb.id,
    cb.restaurant_id,
    cb.customer_phone,
    mask_phone(cb.customer_phone) AS customer_phone_masked,
    cb.customer_name,
    cb.requested_datetime,
    cb.party_size,
    cb.failure_reason,
    cb.priority,
    cb.status,
    cb.assigned_to,
    cb.attempt_count,
    cb.created_at,
    EXTRACT(EPOCH FROM (NOW() - cb.created_at))/60 AS minutes_waiting,
    r.name AS restaurant_name
FROM callbacks cb
JOIN restaurants r ON r.id = cb.restaurant_id
WHERE cb.status IN ('pending', 'in_progress')
ORDER BY cb.priority, cb.created_at;

COMMENT ON VIEW pending_callbacks_view IS 'Callbacks awaiting staff action, ordered by priority';

-- Daily performance summary
CREATE OR REPLACE VIEW daily_performance_view AS
SELECT
    ad.restaurant_id,
    ad.date,
    ad.total_calls,
    ad.bookings_made,
    ROUND(
        CASE WHEN ad.total_calls > 0
        THEN (ad.bookings_made::decimal / ad.total_calls) * 100
        ELSE 0 END,
        1
    ) AS booking_rate_pct,
    ad.avg_call_duration_seconds,
    ad.callbacks_created,
    ad.callbacks_resolved,
    ad.safety_triggers,
    ad.peak_hour,
    r.name AS restaurant_name
FROM analytics_daily ad
JOIN restaurants r ON r.id = ad.restaurant_id
ORDER BY ad.date DESC;

COMMENT ON VIEW daily_performance_view IS 'Daily KPIs for dashboard';

-- =============================================================================
-- SAMPLE QUERIES FOR REFERENCE
-- =============================================================================

-- Check availability for a specific time and party size
/*
SELECT * FROM available_slots_view
WHERE restaurant_id = 'xxx'
  AND slot_datetime BETWEEN '2024-03-15 17:00' AND '2024-03-15 22:00'
  AND available_capacity >= 4
ORDER BY slot_datetime;
*/

-- Get customer by phone (using hash for privacy)
/*
SELECT * FROM customers
WHERE restaurant_id = 'xxx'
  AND phone_hash = hash_phone('+15551234567');
*/

-- Today's reservations for a restaurant
/*
SELECT * FROM todays_reservations_view
WHERE restaurant_id = 'xxx';
*/

-- Pending callbacks ordered by priority and age
/*
SELECT * FROM pending_callbacks_view
WHERE restaurant_id = 'xxx';
*/

-- Call completion rate for last 7 days
/*
SELECT
    date,
    total_calls,
    bookings_made,
    ROUND((bookings_made::decimal / NULLIF(total_calls, 0)) * 100, 1) AS completion_rate
FROM analytics_daily
WHERE restaurant_id = 'xxx'
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
*/
