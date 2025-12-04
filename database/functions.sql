-- =============================================================================
-- Voice AI Receptionist - Database Functions
-- =============================================================================
-- PostgreSQL functions for the Voice AI Receptionist system.
-- These functions encapsulate business logic for:
-- - Availability checking with alternatives
-- - Booking creation with race condition handling
-- - Call logging with idempotency
-- - Analytics aggregation
-- - Knowledge base management
--
-- Run this after schema.sql in your Supabase SQL Editor.
-- =============================================================================

-- =============================================================================
-- HELPER TYPES
-- =============================================================================

-- Result type for availability check
DROP TYPE IF EXISTS availability_result CASCADE;
CREATE TYPE availability_result AS (
    status TEXT,                    -- 'available', 'partial_match', 'unavailable', 'error'
    requested_slot JSONB,           -- Details of requested slot
    alternative_slots JSONB,        -- Array of alternative slots
    message TEXT,                   -- Human-readable message for AI
    error_code TEXT                 -- Error code if status = 'error'
);

COMMENT ON TYPE availability_result IS 'Return type for check_availability function';

-- Result type for booking creation
DROP TYPE IF EXISTS booking_result CASCADE;
CREATE TYPE booking_result AS (
    status TEXT,                    -- 'booked', 'conflict', 'error'
    booking_id UUID,                -- Created reservation ID
    confirmation_code TEXT,         -- Human-readable code
    customer_id UUID,               -- Created/found customer ID
    message TEXT,                   -- Human-readable message
    error_code TEXT                 -- Error code if status = 'error'
);

COMMENT ON TYPE booking_result IS 'Return type for create_booking function';

-- Result type for call logging
DROP TYPE IF EXISTS call_log_result CASCADE;
CREATE TYPE call_log_result AS (
    status TEXT,                    -- 'created', 'updated', 'error'
    call_id UUID,                   -- Call record ID
    is_new BOOLEAN,                 -- True if newly created
    message TEXT
);

COMMENT ON TYPE call_log_result IS 'Return type for log_call function';

-- =============================================================================
-- FUNCTION: check_availability
-- =============================================================================
-- Checks restaurant availability for a given datetime and party size.
-- Returns the requested slot status and up to 3 alternative times.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_datetime: Requested reservation datetime (TIMESTAMPTZ)
--   p_party_size: Number of guests (1-20)
--   p_seating_pref: Preferred seating ('indoor', 'outdoor', 'bar', 'any')
--
-- Returns: availability_result type
-- =============================================================================

CREATE OR REPLACE FUNCTION check_availability(
    p_restaurant_id UUID,
    p_datetime TIMESTAMPTZ,
    p_party_size INTEGER,
    p_seating_pref TEXT DEFAULT 'any'
)
RETURNS availability_result
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result availability_result;
    v_restaurant RECORD;
    v_day_of_week TEXT;
    v_time_only TIME;
    v_hours JSONB;
    v_open_time TIME;
    v_close_time TIME;
    v_last_seating_offset INTEGER;
    v_requested_slot RECORD;
    v_alternatives JSONB := '[]'::jsonb;
    v_search_start TIMESTAMPTZ;
    v_search_end TIMESTAMPTZ;
    v_blocked RECORD;
    v_slot RECORD;
    v_alt_count INTEGER := 0;
BEGIN
    -- Initialize result
    v_result.status := 'error';
    v_result.error_code := NULL;
    v_result.message := '';
    v_result.requested_slot := '{}'::jsonb;
    v_result.alternative_slots := '[]'::jsonb;

    -- ==========================================================================
    -- VALIDATION
    -- ==========================================================================

    -- Validate party size
    IF p_party_size < 1 OR p_party_size > 20 THEN
        v_result.status := 'error';
        v_result.error_code := 'INVALID_PARTY_SIZE';
        v_result.message := 'Party size must be between 1 and 20 guests.';
        RETURN v_result;
    END IF;

    -- Validate datetime is in the future
    IF p_datetime <= NOW() THEN
        v_result.status := 'error';
        v_result.error_code := 'INVALID_DATE';
        v_result.message := 'Reservation date must be in the future.';
        RETURN v_result;
    END IF;

    -- Validate datetime is not too far in the future
    IF p_datetime > NOW() + INTERVAL '30 days' THEN
        v_result.status := 'error';
        v_result.error_code := 'DATE_TOO_FAR';
        v_result.message := 'Reservations can only be made up to 30 days in advance.';
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- GET RESTAURANT CONFIG
    -- ==========================================================================

    SELECT *
    INTO v_restaurant
    FROM restaurants
    WHERE id = p_restaurant_id AND is_active = TRUE;

    IF NOT FOUND THEN
        v_result.status := 'error';
        v_result.error_code := 'RESTAURANT_NOT_FOUND';
        v_result.message := 'Restaurant not found or inactive.';
        RETURN v_result;
    END IF;

    -- Get last seating offset from settings
    v_last_seating_offset := COALESCE(
        (v_restaurant.settings->>'last_seating_offset_minutes')::INTEGER,
        60
    );

    -- ==========================================================================
    -- CHECK BUSINESS HOURS
    -- ==========================================================================

    -- Convert datetime to restaurant's timezone
    v_day_of_week := LOWER(TO_CHAR(p_datetime AT TIME ZONE v_restaurant.timezone, 'day'));
    v_day_of_week := TRIM(v_day_of_week);
    v_time_only := (p_datetime AT TIME ZONE v_restaurant.timezone)::TIME;

    -- Get hours for requested day
    v_hours := v_restaurant.business_hours->v_day_of_week;

    -- Check if closed that day
    IF v_hours IS NULL OR v_hours = 'null'::jsonb THEN
        v_result.status := 'unavailable';
        v_result.error_code := 'RESTAURANT_CLOSED';
        v_result.message := 'We are closed on ' || INITCAP(v_day_of_week) || 's. Would you like to try a different day?';
        v_result.requested_slot := jsonb_build_object(
            'datetime', p_datetime,
            'available', FALSE,
            'reason', 'closed'
        );
        RETURN v_result;
    END IF;

    -- Parse open/close times
    v_open_time := (v_hours->>'open')::TIME;
    v_close_time := (v_hours->>'close')::TIME - (v_last_seating_offset || ' minutes')::INTERVAL;

    -- Check if time is within operating hours
    IF v_time_only < v_open_time OR v_time_only > v_close_time THEN
        v_result.status := 'unavailable';
        v_result.error_code := 'OUTSIDE_HOURS';
        v_result.message := format(
            'That time is outside our hours. We accept reservations between %s and %s on %s.',
            TO_CHAR(v_open_time, 'HH:MI AM'),
            TO_CHAR(v_close_time, 'HH:MI AM'),
            INITCAP(v_day_of_week) || 's'
        );
        v_result.requested_slot := jsonb_build_object(
            'datetime', p_datetime,
            'available', FALSE,
            'reason', 'outside_hours'
        );
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- CHECK BLOCKED DATES
    -- ==========================================================================

    SELECT *
    INTO v_blocked
    FROM blocked_dates
    WHERE restaurant_id = p_restaurant_id
      AND DATE(p_datetime AT TIME ZONE v_restaurant.timezone)
          BETWEEN start_date AND end_date
      AND block_type = 'closed';

    IF FOUND THEN
        v_result.status := 'unavailable';
        v_result.error_code := 'DATE_BLOCKED';
        v_result.message := COALESCE(
            v_blocked.public_message,
            'We are closed on that date. Would you like to try a different day?'
        );
        v_result.requested_slot := jsonb_build_object(
            'datetime', p_datetime,
            'available', FALSE,
            'reason', 'blocked'
        );
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- CHECK REQUESTED SLOT AVAILABILITY
    -- ==========================================================================

    -- Round datetime to nearest 30 minutes
    -- This normalizes "7:15" to "7:00" or "7:30"
    p_datetime := DATE_TRUNC('hour', p_datetime) +
        INTERVAL '30 minutes' * ROUND(
            EXTRACT(MINUTE FROM p_datetime) / 30.0
        );

    -- Look for exact slot match
    SELECT
        s.id,
        s.slot_datetime,
        s.seating_type,
        s.total_capacity,
        s.booked_capacity,
        s.available_capacity,
        s.is_available,
        s.is_blocked
    INTO v_requested_slot
    FROM availability_slots s
    WHERE s.restaurant_id = p_restaurant_id
      AND s.slot_datetime = p_datetime
      AND s.is_blocked = FALSE
      AND (p_seating_pref = 'any' OR s.seating_type::TEXT = p_seating_pref)
      AND s.available_capacity >= p_party_size
    ORDER BY
        CASE WHEN s.seating_type::TEXT = p_seating_pref THEN 0 ELSE 1 END,
        s.available_capacity DESC
    LIMIT 1;

    -- Build requested slot info
    v_result.requested_slot := jsonb_build_object(
        'datetime', p_datetime,
        'party_size', p_party_size,
        'seating_preference', p_seating_pref,
        'available', (v_requested_slot.id IS NOT NULL)
    );

    -- ==========================================================================
    -- HANDLE EXACT MATCH
    -- ==========================================================================

    IF v_requested_slot.id IS NOT NULL THEN
        v_result.status := 'available';
        v_result.requested_slot := v_result.requested_slot || jsonb_build_object(
            'slot_id', v_requested_slot.id,
            'seating_type', v_requested_slot.seating_type,
            'available_capacity', v_requested_slot.available_capacity
        );
        v_result.message := format(
            'Great news! I have %s available for a party of %s.',
            TO_CHAR(p_datetime AT TIME ZONE v_restaurant.timezone, 'HH:MI AM'),
            p_party_size
        );
        v_result.alternative_slots := '[]'::jsonb;
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- FIND ALTERNATIVE SLOTS
    -- ==========================================================================

    -- Search window: 2 hours before and after
    v_search_start := p_datetime - INTERVAL '2 hours';
    v_search_end := p_datetime + INTERVAL '2 hours';

    -- Ensure search is within operating hours for the day
    v_search_start := GREATEST(
        v_search_start,
        DATE(p_datetime AT TIME ZONE v_restaurant.timezone) + v_open_time
    );
    v_search_end := LEAST(
        v_search_end,
        DATE(p_datetime AT TIME ZONE v_restaurant.timezone) + v_close_time
    );

    -- Find up to 3 alternative slots
    FOR v_slot IN
        SELECT
            s.id,
            s.slot_datetime,
            s.seating_type,
            s.available_capacity,
            ABS(EXTRACT(EPOCH FROM (s.slot_datetime - p_datetime))) AS time_diff
        FROM availability_slots s
        WHERE s.restaurant_id = p_restaurant_id
          AND s.slot_datetime BETWEEN v_search_start AND v_search_end
          AND s.slot_datetime != p_datetime
          AND s.is_blocked = FALSE
          AND s.is_available = TRUE
          AND s.available_capacity >= p_party_size
          AND (p_seating_pref = 'any' OR s.seating_type::TEXT = p_seating_pref)
        ORDER BY
            time_diff,
            CASE WHEN s.seating_type::TEXT = p_seating_pref THEN 0 ELSE 1 END
        LIMIT 3
    LOOP
        v_alternatives := v_alternatives || jsonb_build_object(
            'slot_id', v_slot.id,
            'datetime', v_slot.slot_datetime,
            'time_display', TO_CHAR(
                v_slot.slot_datetime AT TIME ZONE v_restaurant.timezone,
                'HH:MI AM'
            ),
            'seating_type', v_slot.seating_type,
            'available_capacity', v_slot.available_capacity
        );
        v_alt_count := v_alt_count + 1;
    END LOOP;

    -- ==========================================================================
    -- BUILD RESPONSE
    -- ==========================================================================

    v_result.alternative_slots := v_alternatives;

    IF v_alt_count > 0 THEN
        v_result.status := 'partial_match';
        -- Build human-readable alternative times
        v_result.message := format(
            'That time isn''t available, but I do have %s. Would any of those work?',
            (
                SELECT string_agg(
                    slot->>'time_display',
                    ' or '
                )
                FROM jsonb_array_elements(v_alternatives) AS slot
            )
        );
    ELSE
        v_result.status := 'unavailable';
        v_result.message := 'I''m sorry, I don''t have any tables available around that time. Would you like to try a different date?';
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    v_result.status := 'error';
    v_result.error_code := 'INTERNAL_ERROR';
    v_result.message := 'I''m having trouble accessing our calendar. Can I take your number and have a manager call you back?';
    -- Log error for debugging
    RAISE WARNING 'check_availability error: % %', SQLERRM, SQLSTATE;
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION check_availability IS
    'Checks availability for a reservation request. Returns status, requested slot info, and up to 3 alternatives.';

-- =============================================================================
-- FUNCTION: create_booking
-- =============================================================================
-- Creates a new reservation with race condition handling.
-- Also creates/updates customer record if needed.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_call_id: UUID of the associated call (nullable)
--   p_customer_data: JSONB with customer info
--     {name, phone, email?, sms_consent?}
--   p_booking_data: JSONB with booking details
--     {datetime, party_size, seating_type?, special_requests?, slot_id?}
--
-- Returns: booking_result type
-- =============================================================================

CREATE OR REPLACE FUNCTION create_booking(
    p_restaurant_id UUID,
    p_call_id UUID,
    p_customer_data JSONB,
    p_booking_data JSONB
)
RETURNS booking_result
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result booking_result;
    v_restaurant RECORD;
    v_customer_id UUID;
    v_customer_phone TEXT;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_sms_consent BOOLEAN;
    v_slot_id UUID;
    v_slot RECORD;
    v_datetime TIMESTAMPTZ;
    v_party_size INTEGER;
    v_seating_type seating_type;
    v_special_requests TEXT;
    v_reservation_id UUID;
    v_confirmation_code TEXT;
    v_rows_affected INTEGER;
BEGIN
    -- Initialize result
    v_result.status := 'error';
    v_result.booking_id := NULL;
    v_result.confirmation_code := NULL;
    v_result.customer_id := NULL;
    v_result.message := '';
    v_result.error_code := NULL;

    -- ==========================================================================
    -- EXTRACT AND VALIDATE PARAMETERS
    -- ==========================================================================

    -- Customer data
    v_customer_name := p_customer_data->>'name';
    v_customer_phone := p_customer_data->>'phone';
    v_customer_email := p_customer_data->>'email';
    v_sms_consent := COALESCE((p_customer_data->>'sms_consent')::BOOLEAN, FALSE);

    -- Booking data
    v_datetime := (p_booking_data->>'datetime')::TIMESTAMPTZ;
    v_party_size := (p_booking_data->>'party_size')::INTEGER;
    v_slot_id := (p_booking_data->>'slot_id')::UUID;
    v_special_requests := p_booking_data->>'special_requests';

    -- Parse seating type
    IF p_booking_data->>'seating_type' IS NOT NULL THEN
        v_seating_type := (p_booking_data->>'seating_type')::seating_type;
    ELSE
        v_seating_type := 'indoor'::seating_type;
    END IF;

    -- Validate required fields
    IF v_customer_name IS NULL OR v_customer_name = '' THEN
        v_result.status := 'error';
        v_result.error_code := 'MISSING_NAME';
        v_result.message := 'Customer name is required.';
        RETURN v_result;
    END IF;

    IF v_customer_phone IS NULL OR v_customer_phone = '' THEN
        v_result.status := 'error';
        v_result.error_code := 'MISSING_PHONE';
        v_result.message := 'Customer phone is required.';
        RETURN v_result;
    END IF;

    -- Validate phone format (basic E.164 check)
    IF NOT v_customer_phone ~ '^\+?[1-9]\d{1,14}$' THEN
        v_result.status := 'error';
        v_result.error_code := 'INVALID_PHONE';
        v_result.message := 'Please provide a valid phone number with area code.';
        RETURN v_result;
    END IF;

    -- Normalize phone to E.164
    IF NOT v_customer_phone LIKE '+%' THEN
        v_customer_phone := '+1' || regexp_replace(v_customer_phone, '[^0-9]', '', 'g');
    END IF;

    IF v_datetime IS NULL THEN
        v_result.status := 'error';
        v_result.error_code := 'MISSING_DATETIME';
        v_result.message := 'Reservation datetime is required.';
        RETURN v_result;
    END IF;

    IF v_party_size IS NULL OR v_party_size < 1 THEN
        v_result.status := 'error';
        v_result.error_code := 'INVALID_PARTY_SIZE';
        v_result.message := 'Valid party size is required.';
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- VERIFY RESTAURANT EXISTS
    -- ==========================================================================

    SELECT *
    INTO v_restaurant
    FROM restaurants
    WHERE id = p_restaurant_id AND is_active = TRUE;

    IF NOT FOUND THEN
        v_result.status := 'error';
        v_result.error_code := 'RESTAURANT_NOT_FOUND';
        v_result.message := 'Restaurant not found or inactive.';
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- BEGIN TRANSACTION (implicit in function)
    -- ==========================================================================

    -- ==========================================================================
    -- FIND AND LOCK SLOT (with race condition handling)
    -- ==========================================================================

    IF v_slot_id IS NOT NULL THEN
        -- Use provided slot ID
        SELECT *
        INTO v_slot
        FROM availability_slots
        WHERE id = v_slot_id
          AND restaurant_id = p_restaurant_id
          AND is_blocked = FALSE
          AND available_capacity >= v_party_size
        FOR UPDATE SKIP LOCKED;  -- Skip if another transaction has it locked
    ELSE
        -- Find a slot by datetime
        SELECT *
        INTO v_slot
        FROM availability_slots
        WHERE restaurant_id = p_restaurant_id
          AND slot_datetime = v_datetime
          AND seating_type = v_seating_type
          AND is_blocked = FALSE
          AND available_capacity >= v_party_size
        FOR UPDATE SKIP LOCKED
        LIMIT 1;
    END IF;

    -- Check if slot was found and available
    IF v_slot.id IS NULL THEN
        v_result.status := 'conflict';
        v_result.error_code := 'SLOT_UNAVAILABLE';
        v_result.message := 'That time slot was just taken. Let me check for the next available time.';
        RETURN v_result;
    END IF;

    -- Double-check capacity (in case of race condition)
    IF v_slot.available_capacity < v_party_size THEN
        v_result.status := 'conflict';
        v_result.error_code := 'INSUFFICIENT_CAPACITY';
        v_result.message := 'That slot no longer has enough capacity. Let me find an alternative.';
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- CREATE OR UPDATE CUSTOMER
    -- ==========================================================================

    -- Try to find existing customer by phone
    SELECT id INTO v_customer_id
    FROM customers
    WHERE restaurant_id = p_restaurant_id
      AND phone_hash = hash_phone(v_customer_phone);

    IF v_customer_id IS NULL THEN
        -- Create new customer
        INSERT INTO customers (
            restaurant_id,
            phone,
            name,
            email,
            sms_consent,
            sms_consent_timestamp,
            sms_consent_source,
            total_reservations
        ) VALUES (
            p_restaurant_id,
            v_customer_phone,
            v_customer_name,
            v_customer_email,
            v_sms_consent,
            CASE WHEN v_sms_consent THEN NOW() ELSE NULL END,
            CASE WHEN v_sms_consent THEN 'voice_ai' ELSE NULL END,
            1
        )
        RETURNING id INTO v_customer_id;
    ELSE
        -- Update existing customer
        UPDATE customers
        SET
            name = COALESCE(NULLIF(v_customer_name, ''), name),
            email = COALESCE(NULLIF(v_customer_email, ''), email),
            sms_consent = CASE
                WHEN v_sms_consent AND NOT sms_consent THEN TRUE
                ELSE sms_consent
            END,
            sms_consent_timestamp = CASE
                WHEN v_sms_consent AND NOT sms_consent THEN NOW()
                ELSE sms_consent_timestamp
            END,
            sms_consent_source = CASE
                WHEN v_sms_consent AND NOT sms_consent THEN 'voice_ai'
                ELSE sms_consent_source
            END,
            total_reservations = total_reservations + 1,
            updated_at = NOW()
        WHERE id = v_customer_id;
    END IF;

    -- ==========================================================================
    -- CREATE RESERVATION
    -- ==========================================================================

    INSERT INTO reservations (
        restaurant_id,
        customer_id,
        slot_id,
        call_id,
        reservation_datetime,
        party_size,
        seating_type,
        customer_name,
        customer_phone,
        customer_email,
        special_requests,
        status,
        source,
        sms_confirmation_sent
    ) VALUES (
        p_restaurant_id,
        v_customer_id,
        v_slot.id,
        p_call_id,
        v_slot.slot_datetime,
        v_party_size,
        v_seating_type,
        v_customer_name,
        v_customer_phone,
        v_customer_email,
        v_special_requests,
        'confirmed',
        'voice_ai',
        FALSE
    )
    RETURNING id, confirmation_code INTO v_reservation_id, v_confirmation_code;

    -- Note: Slot capacity is updated by trigger (update_slot_capacity)

    -- ==========================================================================
    -- BUILD SUCCESS RESPONSE
    -- ==========================================================================

    v_result.status := 'booked';
    v_result.booking_id := v_reservation_id;
    v_result.confirmation_code := v_confirmation_code;
    v_result.customer_id := v_customer_id;
    v_result.message := format(
        'I''ve booked a table for %s on %s at %s. Your confirmation code is %s.',
        v_party_size,
        TO_CHAR(v_slot.slot_datetime AT TIME ZONE v_restaurant.timezone, 'Day, Month DD'),
        TO_CHAR(v_slot.slot_datetime AT TIME ZONE v_restaurant.timezone, 'HH:MI AM'),
        v_confirmation_code
    );

    RETURN v_result;

EXCEPTION
    WHEN unique_violation THEN
        v_result.status := 'conflict';
        v_result.error_code := 'DUPLICATE_BOOKING';
        v_result.message := 'A booking with these details already exists.';
        RETURN v_result;
    WHEN OTHERS THEN
        v_result.status := 'error';
        v_result.error_code := 'INTERNAL_ERROR';
        v_result.message := 'I''m having trouble completing your booking. Can I take your number and have a manager call you back?';
        RAISE WARNING 'create_booking error: % %', SQLERRM, SQLSTATE;
        RETURN v_result;
END;
$$;

COMMENT ON FUNCTION create_booking IS
    'Creates a reservation with race condition handling. Returns booking details or conflict status.';

-- =============================================================================
-- FUNCTION: log_call
-- =============================================================================
-- Logs or updates a call record from Vapi webhook data.
-- Handles idempotency via vapi_call_id (upsert behavior).
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_vapi_data: JSONB with Vapi call data
--     {call_id, caller_phone?, started_at, ended_at?, status?, outcome?,
--      transcript?, recording_url?, tool_calls_count?, avg_tool_latency_ms?,
--      safety_trigger?, safety_type?, reservation_id?, callback_id?, metadata?}
--
-- Returns: call_log_result type
-- =============================================================================

CREATE OR REPLACE FUNCTION log_call(
    p_restaurant_id UUID,
    p_vapi_data JSONB
)
RETURNS call_log_result
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result call_log_result;
    v_vapi_call_id TEXT;
    v_caller_phone TEXT;
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    v_status call_status;
    v_outcome call_outcome;
    v_transcript TEXT;
    v_recording_url TEXT;
    v_tool_calls_count INTEGER;
    v_avg_tool_latency_ms INTEGER;
    v_safety_trigger BOOLEAN;
    v_safety_type TEXT;
    v_reservation_id UUID;
    v_callback_id UUID;
    v_metadata JSONB;
    v_existing_call_id UUID;
    v_new_call_id UUID;
BEGIN
    -- Initialize result
    v_result.status := 'error';
    v_result.call_id := NULL;
    v_result.is_new := FALSE;
    v_result.message := '';

    -- ==========================================================================
    -- EXTRACT PARAMETERS
    -- ==========================================================================

    v_vapi_call_id := p_vapi_data->>'call_id';
    v_caller_phone := p_vapi_data->>'caller_phone';
    v_started_at := COALESCE(
        (p_vapi_data->>'started_at')::TIMESTAMPTZ,
        NOW()
    );
    v_ended_at := (p_vapi_data->>'ended_at')::TIMESTAMPTZ;
    v_transcript := p_vapi_data->>'transcript';
    v_recording_url := p_vapi_data->>'recording_url';
    v_tool_calls_count := (p_vapi_data->>'tool_calls_count')::INTEGER;
    v_avg_tool_latency_ms := (p_vapi_data->>'avg_tool_latency_ms')::INTEGER;
    v_safety_trigger := COALESCE((p_vapi_data->>'safety_trigger')::BOOLEAN, FALSE);
    v_safety_type := p_vapi_data->>'safety_type';
    v_reservation_id := (p_vapi_data->>'reservation_id')::UUID;
    v_callback_id := (p_vapi_data->>'callback_id')::UUID;
    v_metadata := COALESCE(p_vapi_data->'metadata', '{}'::jsonb);

    -- Parse status enum
    BEGIN
        v_status := COALESCE(
            (p_vapi_data->>'status')::call_status,
            'completed'::call_status
        );
    EXCEPTION WHEN invalid_text_representation THEN
        v_status := 'completed'::call_status;
    END;

    -- Parse outcome enum
    BEGIN
        v_outcome := (p_vapi_data->>'outcome')::call_outcome;
    EXCEPTION WHEN invalid_text_representation THEN
        v_outcome := NULL;
    END;

    -- ==========================================================================
    -- VALIDATE
    -- ==========================================================================

    IF v_vapi_call_id IS NULL OR v_vapi_call_id = '' THEN
        v_result.status := 'error';
        v_result.message := 'vapi_call_id is required';
        RETURN v_result;
    END IF;

    -- Verify restaurant exists
    IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
        v_result.status := 'error';
        v_result.message := 'Restaurant not found';
        RETURN v_result;
    END IF;

    -- ==========================================================================
    -- UPSERT CALL RECORD
    -- ==========================================================================

    -- Check if call already exists
    SELECT id INTO v_existing_call_id
    FROM calls
    WHERE vapi_call_id = v_vapi_call_id;

    IF v_existing_call_id IS NOT NULL THEN
        -- Update existing call
        UPDATE calls
        SET
            ended_at = COALESCE(v_ended_at, ended_at),
            status = v_status,
            outcome = COALESCE(v_outcome, outcome),
            transcript = COALESCE(v_transcript, transcript),
            recording_url = COALESCE(v_recording_url, recording_url),
            reservation_id = COALESCE(v_reservation_id, reservation_id),
            callback_id = COALESCE(v_callback_id, callback_id),
            safety_trigger_activated = v_safety_trigger OR safety_trigger_activated,
            safety_trigger_type = COALESCE(v_safety_type, safety_trigger_type),
            tool_calls_count = COALESCE(v_tool_calls_count, tool_calls_count),
            avg_tool_latency_ms = COALESCE(v_avg_tool_latency_ms, avg_tool_latency_ms),
            metadata = metadata || v_metadata
        WHERE id = v_existing_call_id;

        v_result.status := 'updated';
        v_result.call_id := v_existing_call_id;
        v_result.is_new := FALSE;
        v_result.message := 'Call record updated';
    ELSE
        -- Insert new call
        INSERT INTO calls (
            restaurant_id,
            vapi_call_id,
            caller_phone,
            started_at,
            ended_at,
            status,
            outcome,
            transcript,
            recording_url,
            reservation_id,
            callback_id,
            safety_trigger_activated,
            safety_trigger_type,
            tool_calls_count,
            avg_tool_latency_ms,
            metadata
        ) VALUES (
            p_restaurant_id,
            v_vapi_call_id,
            v_caller_phone,
            v_started_at,
            v_ended_at,
            v_status,
            v_outcome,
            v_transcript,
            v_recording_url,
            v_reservation_id,
            v_callback_id,
            v_safety_trigger,
            v_safety_type,
            v_tool_calls_count,
            v_avg_tool_latency_ms,
            v_metadata
        )
        RETURNING id INTO v_new_call_id;

        v_result.status := 'created';
        v_result.call_id := v_new_call_id;
        v_result.is_new := TRUE;
        v_result.message := 'Call record created';
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    v_result.status := 'error';
    v_result.message := format('Error logging call: %s', SQLERRM);
    RAISE WARNING 'log_call error: % %', SQLERRM, SQLSTATE;
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION log_call IS
    'Logs or updates a call record from Vapi. Handles idempotency via vapi_call_id.';

-- =============================================================================
-- FUNCTION: get_daily_analytics
-- =============================================================================
-- Returns aggregated analytics for a date range.
-- Used by the portal dashboard.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_start_date: Start of date range (inclusive)
--   p_end_date: End of date range (inclusive)
--
-- Returns: JSONB with analytics data
-- =============================================================================

CREATE OR REPLACE FUNCTION get_daily_analytics(
    p_restaurant_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_daily_data JSONB;
    v_summary JSONB;
    v_totals RECORD;
BEGIN
    -- Validate date range
    IF p_start_date > p_end_date THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Start date must be before or equal to end date'
        );
    END IF;

    -- Limit to 90 days max
    IF p_end_date - p_start_date > 90 THEN
        p_start_date := p_end_date - 90;
    END IF;

    -- ==========================================================================
    -- GET DAILY BREAKDOWN
    -- ==========================================================================

    SELECT jsonb_agg(
        jsonb_build_object(
            'date', ad.date,
            'total_calls', ad.total_calls,
            'bookings_made', ad.bookings_made,
            'completion_rate', ROUND(
                CASE WHEN ad.total_calls > 0
                THEN (ad.bookings_made::DECIMAL / ad.total_calls) * 100
                ELSE 0 END,
                1
            ),
            'avg_call_duration', ROUND(ad.avg_call_duration_seconds::DECIMAL, 0),
            'callbacks_created', ad.callbacks_created,
            'callbacks_resolved', ad.callbacks_resolved,
            'safety_triggers', ad.safety_triggers,
            'peak_hour', ad.peak_hour,
            'calls_by_hour', ad.calls_by_hour,
            'status_breakdown', jsonb_build_object(
                'completed', ad.completed_calls,
                'transferred', ad.transferred_calls,
                'abandoned', ad.abandoned_calls,
                'error', ad.error_calls
            )
        ) ORDER BY ad.date
    )
    INTO v_daily_data
    FROM analytics_daily ad
    WHERE ad.restaurant_id = p_restaurant_id
      AND ad.date BETWEEN p_start_date AND p_end_date;

    -- Handle no data
    IF v_daily_data IS NULL THEN
        v_daily_data := '[]'::jsonb;
    END IF;

    -- ==========================================================================
    -- CALCULATE SUMMARY TOTALS
    -- ==========================================================================

    SELECT
        COALESCE(SUM(total_calls), 0) AS total_calls,
        COALESCE(SUM(bookings_made), 0) AS total_bookings,
        COALESCE(SUM(completed_calls), 0) AS completed_calls,
        COALESCE(SUM(transferred_calls), 0) AS transferred_calls,
        COALESCE(SUM(abandoned_calls), 0) AS abandoned_calls,
        COALESCE(SUM(error_calls), 0) AS error_calls,
        COALESCE(SUM(callbacks_created), 0) AS callbacks_created,
        COALESCE(SUM(callbacks_resolved), 0) AS callbacks_resolved,
        COALESCE(SUM(safety_triggers), 0) AS safety_triggers,
        COALESCE(SUM(total_covers), 0) AS total_covers,
        COALESCE(AVG(avg_call_duration_seconds), 0) AS avg_duration,
        COALESCE(AVG(avg_tool_latency_ms), 0) AS avg_latency
    INTO v_totals
    FROM analytics_daily
    WHERE restaurant_id = p_restaurant_id
      AND date BETWEEN p_start_date AND p_end_date;

    -- ==========================================================================
    -- BUILD SUMMARY
    -- ==========================================================================

    v_summary := jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'days', p_end_date - p_start_date + 1
        ),
        'totals', jsonb_build_object(
            'calls', v_totals.total_calls,
            'bookings', v_totals.total_bookings,
            'covers', v_totals.total_covers,
            'callbacks_created', v_totals.callbacks_created,
            'callbacks_resolved', v_totals.callbacks_resolved,
            'safety_triggers', v_totals.safety_triggers
        ),
        'rates', jsonb_build_object(
            'completion_rate', ROUND(
                CASE WHEN v_totals.total_calls > 0
                THEN (v_totals.total_bookings::DECIMAL / v_totals.total_calls) * 100
                ELSE 0 END,
                1
            ),
            'transfer_rate', ROUND(
                CASE WHEN v_totals.total_calls > 0
                THEN (v_totals.transferred_calls::DECIMAL / v_totals.total_calls) * 100
                ELSE 0 END,
                1
            ),
            'abandonment_rate', ROUND(
                CASE WHEN v_totals.total_calls > 0
                THEN (v_totals.abandoned_calls::DECIMAL / v_totals.total_calls) * 100
                ELSE 0 END,
                1
            ),
            'callback_resolution_rate', ROUND(
                CASE WHEN v_totals.callbacks_created > 0
                THEN (v_totals.callbacks_resolved::DECIMAL / v_totals.callbacks_created) * 100
                ELSE 0 END,
                1
            )
        ),
        'averages', jsonb_build_object(
            'calls_per_day', ROUND(v_totals.total_calls::DECIMAL / NULLIF(p_end_date - p_start_date + 1, 0), 1),
            'bookings_per_day', ROUND(v_totals.total_bookings::DECIMAL / NULLIF(p_end_date - p_start_date + 1, 0), 1),
            'call_duration_seconds', ROUND(v_totals.avg_duration::DECIMAL, 0),
            'tool_latency_ms', ROUND(v_totals.avg_latency::DECIMAL, 0)
        ),
        'status_breakdown', jsonb_build_object(
            'completed', v_totals.completed_calls,
            'transferred', v_totals.transferred_calls,
            'abandoned', v_totals.abandoned_calls,
            'error', v_totals.error_calls
        )
    );

    -- ==========================================================================
    -- BUILD FINAL RESULT
    -- ==========================================================================

    v_result := jsonb_build_object(
        'error', FALSE,
        'restaurant_id', p_restaurant_id,
        'summary', v_summary,
        'daily', v_daily_data
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error fetching analytics: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION get_daily_analytics IS
    'Returns aggregated analytics for a date range. Used by portal dashboard.';

-- =============================================================================
-- FUNCTION: update_knowledge_base
-- =============================================================================
-- Upserts knowledge base entries for a restaurant.
-- Used by the portal settings.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_category: Category of entries to update
--   p_items: JSONB array of knowledge base items
--     [{id?, question_patterns, keywords?, answer, hard_rule?, requires_transfer?, transfer_queue?, priority?, is_active?}]
--   p_user: Username making the update (for audit)
--
-- Returns: JSONB with update results
-- =============================================================================

CREATE OR REPLACE FUNCTION update_knowledge_base(
    p_restaurant_id UUID,
    p_category kb_category,
    p_items JSONB,
    p_user TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_item_id UUID;
    v_created_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_deleted_count INTEGER := 0;
    v_errors JSONB := '[]'::jsonb;
    v_existing_ids UUID[];
    v_new_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    -- Validate restaurant exists
    IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Restaurant not found'
        );
    END IF;

    -- Validate items is an array
    IF jsonb_typeof(p_items) != 'array' THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Items must be a JSON array'
        );
    END IF;

    -- Get existing IDs for this category
    SELECT ARRAY_AGG(id)
    INTO v_existing_ids
    FROM knowledge_base
    WHERE restaurant_id = p_restaurant_id
      AND category = p_category;

    v_existing_ids := COALESCE(v_existing_ids, ARRAY[]::UUID[]);

    -- ==========================================================================
    -- PROCESS EACH ITEM
    -- ==========================================================================

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_item_id := (v_item->>'id')::UUID;

            IF v_item_id IS NOT NULL THEN
                -- UPDATE existing item
                UPDATE knowledge_base
                SET
                    question_patterns = COALESCE(
                        ARRAY(SELECT jsonb_array_elements_text(v_item->'question_patterns')),
                        question_patterns
                    ),
                    keywords = COALESCE(
                        ARRAY(SELECT jsonb_array_elements_text(v_item->'keywords')),
                        keywords
                    ),
                    answer = COALESCE(v_item->>'answer', answer),
                    hard_rule = v_item->>'hard_rule',
                    requires_transfer = COALESCE((v_item->>'requires_transfer')::BOOLEAN, requires_transfer),
                    transfer_queue = v_item->>'transfer_queue',
                    priority = COALESCE((v_item->>'priority')::INTEGER, priority),
                    is_active = COALESCE((v_item->>'is_active')::BOOLEAN, is_active),
                    updated_at = NOW(),
                    updated_by = p_user
                WHERE id = v_item_id
                  AND restaurant_id = p_restaurant_id
                  AND category = p_category;

                IF FOUND THEN
                    v_updated_count := v_updated_count + 1;
                    v_new_ids := v_new_ids || v_item_id;
                END IF;
            ELSE
                -- INSERT new item
                INSERT INTO knowledge_base (
                    restaurant_id,
                    category,
                    question_patterns,
                    keywords,
                    answer,
                    hard_rule,
                    requires_transfer,
                    transfer_queue,
                    priority,
                    is_active,
                    created_by,
                    updated_by
                ) VALUES (
                    p_restaurant_id,
                    p_category,
                    ARRAY(SELECT jsonb_array_elements_text(v_item->'question_patterns')),
                    ARRAY(SELECT jsonb_array_elements_text(v_item->'keywords')),
                    v_item->>'answer',
                    v_item->>'hard_rule',
                    COALESCE((v_item->>'requires_transfer')::BOOLEAN, FALSE),
                    v_item->>'transfer_queue',
                    COALESCE((v_item->>'priority')::INTEGER, 5),
                    COALESCE((v_item->>'is_active')::BOOLEAN, TRUE),
                    p_user,
                    p_user
                )
                RETURNING id INTO v_item_id;

                v_created_count := v_created_count + 1;
                v_new_ids := v_new_ids || v_item_id;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || jsonb_build_object(
                'item', v_item,
                'error', SQLERRM
            );
        END;
    END LOOP;

    -- ==========================================================================
    -- DELETE ITEMS NOT IN UPDATE (optional: uncomment to enable)
    -- ==========================================================================
    /*
    -- Delete items that existed but weren't in the update
    DELETE FROM knowledge_base
    WHERE restaurant_id = p_restaurant_id
      AND category = p_category
      AND id = ANY(v_existing_ids)
      AND NOT (id = ANY(v_new_ids));

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    */

    -- ==========================================================================
    -- RETURN RESULTS
    -- ==========================================================================

    RETURN jsonb_build_object(
        'error', FALSE,
        'category', p_category,
        'created', v_created_count,
        'updated', v_updated_count,
        'deleted', v_deleted_count,
        'errors', v_errors
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error updating knowledge base: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION update_knowledge_base IS
    'Upserts knowledge base entries for a category. Used by portal settings.';

-- =============================================================================
-- FUNCTION: create_callback
-- =============================================================================
-- Creates a callback request when booking fails.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_call_id: UUID of the associated call
--   p_customer_phone: Customer phone number
--   p_customer_name: Customer name (optional)
--   p_details: JSONB with booking request details
--     {requested_datetime?, party_size?, seating_preference?, special_requests?}
--   p_failure_reason: Reason for callback (e.g., 'CRM_TIMEOUT')
--   p_error_details: JSONB with error details (optional)
--
-- Returns: JSONB with callback record info
-- =============================================================================

CREATE OR REPLACE FUNCTION create_callback(
    p_restaurant_id UUID,
    p_call_id UUID,
    p_customer_phone TEXT,
    p_customer_name TEXT,
    p_details JSONB,
    p_failure_reason TEXT,
    p_error_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_callback_id UUID;
    v_priority INTEGER;
BEGIN
    -- Validate restaurant exists
    IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Restaurant not found'
        );
    END IF;

    -- Validate phone
    IF p_customer_phone IS NULL OR p_customer_phone = '' THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Customer phone is required'
        );
    END IF;

    -- Determine priority based on failure reason
    v_priority := CASE p_failure_reason
        WHEN 'SAFETY_TRIGGER' THEN 1
        WHEN 'LARGE_PARTY' THEN 2
        WHEN 'CRM_TIMEOUT' THEN 3
        WHEN 'BOOKING_CONFLICT' THEN 4
        ELSE 5
    END;

    -- Create callback
    INSERT INTO callbacks (
        restaurant_id,
        call_id,
        customer_phone,
        customer_name,
        requested_datetime,
        party_size,
        seating_preference,
        special_requests,
        failure_reason,
        error_code,
        error_details,
        priority,
        status
    ) VALUES (
        p_restaurant_id,
        p_call_id,
        p_customer_phone,
        p_customer_name,
        (p_details->>'requested_datetime')::TIMESTAMPTZ,
        (p_details->>'party_size')::INTEGER,
        (p_details->>'seating_preference')::seating_type,
        p_details->>'special_requests',
        p_failure_reason,
        p_failure_reason,
        COALESCE(p_error_details, '{}'::jsonb),
        v_priority,
        'pending'
    )
    RETURNING id INTO v_callback_id;

    -- Update call record with callback reference
    IF p_call_id IS NOT NULL THEN
        UPDATE calls
        SET callback_id = v_callback_id
        WHERE id = p_call_id;
    END IF;

    RETURN jsonb_build_object(
        'error', FALSE,
        'callback_id', v_callback_id,
        'priority', v_priority,
        'message', 'Callback created successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error creating callback: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION create_callback IS
    'Creates a callback request when booking fails. Links to call record if provided.';

-- =============================================================================
-- FUNCTION: resolve_callback
-- =============================================================================
-- Resolves a callback with outcome.
--
-- Parameters:
--   p_callback_id: UUID of the callback to resolve
--   p_resolved_by: Username of staff member
--   p_outcome: Resolution outcome ('booked', 'no_availability', 'customer_declined', 'no_answer')
--   p_notes: Resolution notes
--   p_reservation_id: UUID of resulting reservation (if booked)
--
-- Returns: JSONB with result
-- =============================================================================

CREATE OR REPLACE FUNCTION resolve_callback(
    p_callback_id UUID,
    p_resolved_by TEXT,
    p_outcome TEXT,
    p_notes TEXT DEFAULT NULL,
    p_reservation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_callback RECORD;
BEGIN
    -- Get callback
    SELECT * INTO v_callback
    FROM callbacks
    WHERE id = p_callback_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Callback not found'
        );
    END IF;

    IF v_callback.status = 'resolved' THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Callback already resolved'
        );
    END IF;

    -- Update callback
    UPDATE callbacks
    SET
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = p_resolved_by,
        resolution_outcome = p_outcome,
        resolution_notes = p_notes,
        resulting_reservation_id = p_reservation_id,
        updated_at = NOW()
    WHERE id = p_callback_id;

    RETURN jsonb_build_object(
        'error', FALSE,
        'callback_id', p_callback_id,
        'outcome', p_outcome,
        'message', 'Callback resolved successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error resolving callback: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION resolve_callback IS
    'Resolves a callback with outcome and optional resulting reservation.';

-- =============================================================================
-- FUNCTION: get_pending_callbacks
-- =============================================================================
-- Returns pending callbacks for a restaurant, ordered by priority.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--   p_limit: Maximum number of callbacks to return (default 20)
--
-- Returns: JSONB array of pending callbacks
-- =============================================================================

CREATE OR REPLACE FUNCTION get_pending_callbacks(
    p_restaurant_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_callbacks JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', cb.id,
            'customer_phone', cb.customer_phone,
            'customer_phone_masked', mask_phone(cb.customer_phone),
            'customer_name', cb.customer_name,
            'requested_datetime', cb.requested_datetime,
            'party_size', cb.party_size,
            'failure_reason', cb.failure_reason,
            'priority', cb.priority,
            'status', cb.status,
            'assigned_to', cb.assigned_to,
            'attempt_count', cb.attempt_count,
            'created_at', cb.created_at,
            'minutes_waiting', EXTRACT(EPOCH FROM (NOW() - cb.created_at)) / 60
        ) ORDER BY cb.priority, cb.created_at
    ), '[]'::jsonb)
    INTO v_callbacks
    FROM callbacks cb
    WHERE cb.restaurant_id = p_restaurant_id
      AND cb.status IN ('pending', 'in_progress')
    LIMIT p_limit;

    RETURN jsonb_build_object(
        'error', FALSE,
        'count', jsonb_array_length(v_callbacks),
        'callbacks', v_callbacks
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error fetching callbacks: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION get_pending_callbacks IS
    'Returns pending callbacks for a restaurant, ordered by priority.';

-- =============================================================================
-- FUNCTION: get_todays_reservations
-- =============================================================================
-- Returns today's reservations for host stand view.
--
-- Parameters:
--   p_restaurant_id: UUID of the restaurant
--
-- Returns: JSONB array of today's reservations
-- =============================================================================

CREATE OR REPLACE FUNCTION get_todays_reservations(
    p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_restaurant RECORD;
    v_reservations JSONB;
    v_today_start TIMESTAMPTZ;
    v_today_end TIMESTAMPTZ;
BEGIN
    -- Get restaurant timezone
    SELECT * INTO v_restaurant
    FROM restaurants
    WHERE id = p_restaurant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', 'Restaurant not found'
        );
    END IF;

    -- Calculate today's boundaries in restaurant timezone
    v_today_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_restaurant.timezone)
        AT TIME ZONE v_restaurant.timezone;
    v_today_end := v_today_start + INTERVAL '1 day';

    -- Get reservations
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', res.id,
            'confirmation_code', res.confirmation_code,
            'reservation_datetime', res.reservation_datetime,
            'time_display', TO_CHAR(
                res.reservation_datetime AT TIME ZONE v_restaurant.timezone,
                'HH:MI AM'
            ),
            'party_size', res.party_size,
            'customer_name', res.customer_name,
            'customer_phone_masked', mask_phone(res.customer_phone),
            'seating_type', res.seating_type,
            'special_requests', res.special_requests,
            'status', res.status,
            'assigned_table', res.assigned_table,
            'seated_at', res.seated_at,
            'source', res.source,
            'internal_notes', res.internal_notes,
            'customer', CASE WHEN c.id IS NOT NULL THEN jsonb_build_object(
                'is_vip', c.is_vip,
                'dietary_notes', c.dietary_notes,
                'visit_count', c.total_reservations,
                'no_show_count', c.no_show_count
            ) ELSE NULL END
        ) ORDER BY res.reservation_datetime
    ), '[]'::jsonb)
    INTO v_reservations
    FROM reservations res
    LEFT JOIN customers c ON c.id = res.customer_id
    WHERE res.restaurant_id = p_restaurant_id
      AND res.reservation_datetime >= v_today_start
      AND res.reservation_datetime < v_today_end
      AND res.status IN ('confirmed', 'seated');

    RETURN jsonb_build_object(
        'error', FALSE,
        'date', DATE(NOW() AT TIME ZONE v_restaurant.timezone),
        'timezone', v_restaurant.timezone,
        'count', jsonb_array_length(v_reservations),
        'reservations', v_reservations
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'error', TRUE,
        'message', format('Error fetching reservations: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION get_todays_reservations IS
    'Returns today''s reservations for the host stand view.';

-- =============================================================================
-- GRANTS
-- =============================================================================
-- Grant execute permissions to authenticated users (for Supabase RLS)

-- These grants allow the service role and authenticated users to call functions
GRANT EXECUTE ON FUNCTION check_availability TO authenticated;
GRANT EXECUTE ON FUNCTION check_availability TO service_role;

GRANT EXECUTE ON FUNCTION create_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking TO service_role;

GRANT EXECUTE ON FUNCTION log_call TO service_role;

GRANT EXECUTE ON FUNCTION get_daily_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_analytics TO service_role;

GRANT EXECUTE ON FUNCTION update_knowledge_base TO authenticated;
GRANT EXECUTE ON FUNCTION update_knowledge_base TO service_role;

GRANT EXECUTE ON FUNCTION create_callback TO service_role;

GRANT EXECUTE ON FUNCTION resolve_callback TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_callback TO service_role;

GRANT EXECUTE ON FUNCTION get_pending_callbacks TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_callbacks TO service_role;

GRANT EXECUTE ON FUNCTION get_todays_reservations TO authenticated;
GRANT EXECUTE ON FUNCTION get_todays_reservations TO service_role;

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

/*
-- Check availability
SELECT * FROM check_availability(
    '00000000-0000-0000-0000-000000000001'::UUID,
    NOW() + INTERVAL '1 day' + TIME '19:00',
    4,
    'any'
);

-- Create booking
SELECT * FROM create_booking(
    '00000000-0000-0000-0000-000000000001'::UUID,
    NULL,
    '{"name": "John Smith", "phone": "+15551234567", "sms_consent": true}'::JSONB,
    '{"datetime": "2024-03-15T19:00:00-04:00", "party_size": 4, "seating_type": "indoor"}'::JSONB
);

-- Log a call
SELECT * FROM log_call(
    '00000000-0000-0000-0000-000000000001'::UUID,
    '{"call_id": "vapi_123", "caller_phone": "+15551234567", "status": "completed", "outcome": "booking_made"}'::JSONB
);

-- Get analytics
SELECT get_daily_analytics(
    '00000000-0000-0000-0000-000000000001'::UUID,
    CURRENT_DATE - 7,
    CURRENT_DATE
);

-- Update knowledge base
SELECT update_knowledge_base(
    '00000000-0000-0000-0000-000000000001'::UUID,
    'parking'::kb_category,
    '[{"question_patterns": ["parking", "where to park"], "answer": "Valet is $15."}]'::JSONB,
    'admin'
);

-- Get today's reservations
SELECT get_todays_reservations('00000000-0000-0000-0000-000000000001'::UUID);

-- Get pending callbacks
SELECT get_pending_callbacks('00000000-0000-0000-0000-000000000001'::UUID);
*/
