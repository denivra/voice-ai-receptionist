-- =============================================================================
-- Voice AI Receptionist - Seed Data
-- =============================================================================
-- Sample data for one test restaurant with realistic test scenarios.
-- Run this after schema.sql in your Supabase SQL Editor.
--
-- This creates:
-- - 1 test restaurant with full configuration
-- - 14 days of availability slots
-- - Sample customers with various profiles
-- - Sample reservations (past and upcoming)
-- - Sample calls with different outcomes
-- - Sample callbacks in various states
-- - Knowledge base entries for FAQs
-- - Sample analytics data
-- =============================================================================

-- =============================================================================
-- TEST RESTAURANT
-- =============================================================================

INSERT INTO restaurants (
    id,
    name,
    phone,
    email,
    address,
    timezone,
    business_hours,
    settings,
    is_active
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'The Test Kitchen',
    '+15551234567',
    'reservations@testkitchen.com',
    '123 Main Street, Testville, TS 12345',
    'America/New_York',
    '{
        "monday": null,
        "tuesday": {"open": "17:00", "close": "22:00"},
        "wednesday": {"open": "17:00", "close": "22:00"},
        "thursday": {"open": "17:00", "close": "22:00"},
        "friday": {"open": "17:00", "close": "23:00"},
        "saturday": {"open": "17:00", "close": "23:00"},
        "sunday": {"open": "16:00", "close": "21:00"}
    }'::jsonb,
    '{
        "vapi_assistant_id": "asst_test_12345",
        "default_party_max": 20,
        "large_party_threshold": 8,
        "last_seating_offset_minutes": 60,
        "sms_enabled": true,
        "sms_reminder_hours_before": 24,
        "cancellation_notice_hours": 24,
        "no_show_fee_per_person": 25.00,
        "no_show_fee_party_threshold": 6,
        "valet_price": 15.00,
        "free_parking_location": "5th Avenue",
        "free_parking_after": "6 PM",
        "allow_same_day_booking": true,
        "max_future_booking_days": 30
    }'::jsonb,
    TRUE
);

-- =============================================================================
-- AVAILABILITY SLOTS (14 days)
-- =============================================================================
-- Generate slots for the next 14 days during operating hours

DO $$
DECLARE
    current_date DATE := CURRENT_DATE;
    slot_date DATE;
    slot_time TIME;
    slot_datetime TIMESTAMPTZ;
    day_of_week INTEGER;
    st seating_type;
    seating_types seating_type[] := ARRAY['indoor'::seating_type, 'outdoor'::seating_type, 'bar'::seating_type];
    capacity_map JSONB := '{"indoor": 8, "outdoor": 6, "bar": 4}';
    hours_map JSONB := '{
        "1": null,
        "2": {"open": "17:00", "close": "22:00"},
        "3": {"open": "17:00", "close": "22:00"},
        "4": {"open": "17:00", "close": "22:00"},
        "5": {"open": "17:00", "close": "23:00"},
        "6": {"open": "17:00", "close": "23:00"},
        "0": {"open": "16:00", "close": "21:00"}
    }';
    day_hours JSONB;
    open_time TIME;
    close_time TIME;
BEGIN
    -- Loop through next 14 days
    FOR i IN 0..13 LOOP
        slot_date := current_date + i;
        day_of_week := EXTRACT(DOW FROM slot_date);

        -- Get hours for this day of week
        day_hours := hours_map->day_of_week::text;

        -- Skip if closed (null hours)
        IF day_hours IS NOT NULL THEN
            open_time := (day_hours->>'open')::TIME;
            close_time := (day_hours->>'close')::TIME - INTERVAL '1 hour'; -- Last seating

            -- Create slots every 30 minutes
            slot_time := open_time;
            WHILE slot_time <= close_time LOOP
                -- Create slot for each seating type
                FOREACH st IN ARRAY seating_types LOOP
                    slot_datetime := (slot_date || ' ' || slot_time)::TIMESTAMP
                        AT TIME ZONE 'America/New_York';

                    INSERT INTO availability_slots (
                        restaurant_id,
                        slot_datetime,
                        seating_type,
                        total_capacity,
                        slot_duration_minutes
                    ) VALUES (
                        '00000000-0000-0000-0000-000000000001',
                        slot_datetime,
                        st,
                        (capacity_map->>st::text)::INTEGER,
                        90
                    )
                    ON CONFLICT (restaurant_id, slot_datetime, seating_type) DO NOTHING;
                END LOOP;

                slot_time := slot_time + INTERVAL '30 minutes';
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- SAMPLE CUSTOMERS
-- =============================================================================

-- Regular customer with SMS consent
INSERT INTO customers (
    id, restaurant_id, phone, name, email,
    sms_consent, sms_consent_timestamp, sms_consent_source,
    preferred_seating, total_reservations, completed_visits, is_vip
) VALUES (
    '00000000-0000-0001-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '+15559876543',
    'John Smith',
    'john.smith@example.com',
    TRUE,
    NOW() - INTERVAL '30 days',
    'voice_ai',
    'indoor',
    5, 4, FALSE
);

-- VIP customer with dietary notes
INSERT INTO customers (
    id, restaurant_id, phone, name, email,
    sms_consent, sms_consent_timestamp, sms_consent_source,
    preferred_seating, dietary_notes, notes,
    total_reservations, completed_visits, is_vip, vip_notes
) VALUES (
    '00000000-0000-0001-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '+15558765432',
    'Jane Doe',
    'jane.doe@example.com',
    TRUE,
    NOW() - INTERVAL '60 days',
    'web',
    'outdoor',
    'Vegetarian, prefers gluten-free options',
    'Regular Friday night guest. Prefers corner table.',
    12, 10, TRUE,
    'Loyal customer since opening. Always gets the chef''s special.'
);

-- Customer without SMS consent
INSERT INTO customers (
    id, restaurant_id, phone, name,
    sms_consent, total_reservations, completed_visits, no_show_count
) VALUES (
    '00000000-0000-0001-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '+15557654321',
    'Bob Wilson',
    FALSE,
    3, 2, 1
);

-- New customer (first visit)
INSERT INTO customers (
    id, restaurant_id, phone, name, email,
    sms_consent, sms_consent_timestamp, sms_consent_source,
    total_reservations
) VALUES (
    '00000000-0000-0001-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '+15556543210',
    'Alice Johnson',
    'alice.j@example.com',
    TRUE,
    NOW(),
    'voice_ai',
    1
);

-- =============================================================================
-- SAMPLE RESERVATIONS
-- =============================================================================

-- Tomorrow at 7 PM - Confirmed reservation
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone, customer_email,
    status, source,
    sms_confirmation_sent, sms_confirmation_sent_at, sms_confirmation_sid,
    special_requests
) VALUES (
    '00000000-0000-0002-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0001-0000-000000000001',
    (CURRENT_DATE + 1 || ' 19:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    4,
    'indoor',
    'John Smith',
    '+15559876543',
    'john.smith@example.com',
    'confirmed',
    'voice_ai',
    TRUE,
    NOW() - INTERVAL '1 hour',
    'SM_test_1234567890',
    'Anniversary dinner - please have champagne ready'
);

-- Day after tomorrow at 8 PM - VIP reservation
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone, customer_email,
    status, source,
    sms_confirmation_sent, sms_confirmation_sent_at,
    internal_notes
) VALUES (
    '00000000-0000-0002-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0001-0000-000000000002',
    (CURRENT_DATE + 2 || ' 20:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    2,
    'outdoor',
    'Jane Doe',
    '+15558765432',
    'jane.doe@example.com',
    'confirmed',
    'voice_ai',
    TRUE,
    NOW() - INTERVAL '2 hours',
    'VIP - Regular Friday night guest. Comp dessert for loyalty.'
);

-- This weekend - Large party
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone,
    status, source,
    sms_confirmation_sent,
    special_requests
) VALUES (
    '00000000-0000-0002-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    (CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER + 7) % 7 || ' 19:30:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    6,
    'indoor',
    'Mike Thompson',
    '+15554321098',
    'confirmed',
    'voice_ai',
    TRUE,
    'Birthday celebration - please bring cake at 8:30 PM'
);

-- Past reservation - Completed
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone,
    status, status_changed_at,
    source, assigned_table, seated_at
) VALUES (
    '00000000-0000-0002-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0001-0000-000000000001',
    (CURRENT_DATE - 7 || ' 19:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    2,
    'bar',
    'John Smith',
    '+15559876543',
    'completed',
    (CURRENT_DATE - 7 || ' 21:30:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    'voice_ai',
    'B2',
    (CURRENT_DATE - 7 || ' 19:05:00')::TIMESTAMP AT TIME ZONE 'America/New_York'
);

-- Past reservation - No show
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone,
    status, status_changed_at, status_changed_by,
    source
) VALUES (
    '00000000-0000-0002-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0001-0000-000000000003',
    (CURRENT_DATE - 14 || ' 20:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    4,
    'indoor',
    'Bob Wilson',
    '+15557654321',
    'no_show',
    (CURRENT_DATE - 14 || ' 20:30:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    'staff:manager',
    'voice_ai'
);

-- Cancelled reservation
INSERT INTO reservations (
    id, restaurant_id, customer_id,
    reservation_datetime, party_size, seating_type,
    customer_name, customer_phone,
    status, cancelled_at, cancellation_reason, cancellation_source,
    source
) VALUES (
    '00000000-0000-0002-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0001-0000-000000000004',
    (CURRENT_DATE + 3 || ' 19:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    3,
    'indoor',
    'Alice Johnson',
    '+15556543210',
    'cancelled',
    NOW() - INTERVAL '12 hours',
    'Change of plans - rescheduling to next week',
    'sms',
    'voice_ai'
);

-- =============================================================================
-- SAMPLE CALLS
-- =============================================================================

-- Successful booking call
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    reservation_id,
    tool_calls_count, avg_tool_latency_ms,
    transcript,
    metadata
) VALUES (
    '00000000-0000-0003-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'call_success_001',
    '+15559876543',
    NOW() - INTERVAL '1 hour' - INTERVAL '3 minutes',
    NOW() - INTERVAL '1 hour',
    'completed',
    'booking_made',
    '00000000-0000-0002-0000-000000000001',
    3, 850,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
Customer: Hi, I''d like to make a reservation for tomorrow night.
AI: I''d be happy to help! How many will be dining?
Customer: Four people.
AI: And what time works best for you?
Customer: Around 7 o''clock.
AI: Let me check availability for you... Perfect! I have 7 PM available for a party of 4. Can I get your name?
Customer: John Smith.
AI: And a phone number for the confirmation?
Customer: 555-987-6543
AI: Should I text you a confirmation at that number?
Customer: Yes please.
AI: All set! I''ve booked a table for 4 tomorrow at 7 PM under Smith. I''ve sent a confirmation to your phone. Is there anything else I can help you with?
Customer: That''s all, thank you!
AI: Thank you for calling The Test Kitchen. We look forward to seeing you!',
    '{"intent_detected": "booking", "slots_filled": 5}'::jsonb
);

-- FAQ call (parking question)
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    tool_calls_count,
    transcript
) VALUES (
    '00000000-0000-0003-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'call_faq_001',
    '+15551112222',
    NOW() - INTERVAL '2 hours' - INTERVAL '45 seconds',
    NOW() - INTERVAL '2 hours',
    'completed',
    'faq_answered',
    0,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
Customer: Hi, do you have parking?
AI: Valet is $15, or there''s free street parking on 5th Avenue after 6 PM. Is there anything else I can help you with?
Customer: No, that''s all I needed. Thanks!
AI: Thank you for calling The Test Kitchen!'
);

-- Safety transfer call (allergy)
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    safety_trigger_activated, safety_trigger_type,
    tool_calls_count,
    transcript
) VALUES (
    '00000000-0000-0003-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'call_safety_001',
    '+15553334444',
    NOW() - INTERVAL '3 hours' - INTERVAL '1 minute 30 seconds',
    NOW() - INTERVAL '3 hours',
    'transferred',
    'transferred_safety',
    TRUE, 'allergy',
    1,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
Customer: Hi, I''m looking to make a reservation, but my son has a severe peanut allergy. Can you guarantee the food is safe?
AI: For your safety, I cannot guarantee allergen-free preparation due to our kitchen practices. Let me transfer you to a manager who can discuss our protocols in detail.
[Call transferred to manager queue]'
);

-- Callback needed (system error)
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    callback_id,
    tool_calls_count,
    transcript
) VALUES (
    '00000000-0000-0003-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'call_error_001',
    '+15556543210',
    NOW() - INTERVAL '30 minutes' - INTERVAL '2 minutes',
    NOW() - INTERVAL '30 minutes',
    'completed',
    'callback_requested',
    '00000000-0000-0004-0000-000000000001',
    2,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
Customer: I''d like to book a table for 2 on Saturday at 7.
AI: Let me check availability for you... I''m sorry, I''m having trouble accessing our calendar right now. Can I take your number and have a manager call you back within 10 minutes?
Customer: Sure, it''s 555-654-3210.
AI: Thank you! A manager will call you shortly to confirm your reservation.'
);

-- Abandoned call
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    tool_calls_count,
    transcript
) VALUES (
    '00000000-0000-0003-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'call_abandoned_001',
    '+15557778888',
    NOW() - INTERVAL '4 hours' - INTERVAL '15 seconds',
    NOW() - INTERVAL '4 hours',
    'abandoned',
    'caller_hangup',
    0,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
[Caller disconnected]'
);

-- Large party transfer
INSERT INTO calls (
    id, restaurant_id, vapi_call_id,
    caller_phone, started_at, ended_at,
    status, outcome,
    safety_trigger_activated, safety_trigger_type,
    tool_calls_count,
    transcript
) VALUES (
    '00000000-0000-0003-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    'call_large_party_001',
    '+15559990000',
    NOW() - INTERVAL '5 hours' - INTERVAL '1 minute',
    NOW() - INTERVAL '5 hours',
    'transferred',
    'transferred_large_party',
    TRUE, 'large_party',
    1,
    'AI: Thank you for calling The Test Kitchen! How can I help you today?
Customer: Hi, I need to book a table for 12 people next Friday.
AI: Groups over 8 require special arrangements including a deposit and set menu options. Let me connect you with our events coordinator who can help with that.
[Call transferred to events queue]'
);

-- =============================================================================
-- SAMPLE CALLBACKS
-- =============================================================================

-- Pending callback (from system error)
INSERT INTO callbacks (
    id, restaurant_id, call_id,
    customer_phone, customer_name,
    requested_datetime, party_size,
    failure_reason, error_code, error_details,
    priority, status,
    created_at
) VALUES (
    '00000000-0000-0004-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0003-0000-000000000004',
    '+15556543210',
    'Alice Johnson',
    (CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER + 7) % 7 || ' 19:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    2,
    'CRM_TIMEOUT',
    'DB_CONNECTION_TIMEOUT',
    '{"timeout_ms": 5000, "retry_count": 2}'::jsonb,
    3,
    'pending',
    NOW() - INTERVAL '30 minutes'
);

-- Resolved callback
INSERT INTO callbacks (
    id, restaurant_id,
    customer_phone, customer_name,
    requested_datetime, party_size,
    failure_reason,
    priority, status,
    resolved_at, resolved_by, resolution_notes, resolution_outcome,
    resulting_reservation_id,
    created_at
) VALUES (
    '00000000-0000-0004-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '+15558765432',
    'Jane Doe',
    (CURRENT_DATE + 2 || ' 20:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    2,
    'CRM_TIMEOUT',
    3, 'resolved',
    NOW() - INTERVAL '2 hours',
    'staff:sarah',
    'Called customer back, confirmed reservation for Friday 8 PM',
    'booked',
    '00000000-0000-0002-0000-000000000002',
    NOW() - INTERVAL '3 hours'
);

-- Failed callback (no answer)
INSERT INTO callbacks (
    id, restaurant_id,
    customer_phone, customer_name,
    requested_datetime, party_size,
    failure_reason,
    priority, status,
    attempt_count, last_attempt_at,
    resolved_at, resolved_by, resolution_notes, resolution_outcome,
    created_at
) VALUES (
    '00000000-0000-0004-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '+15551231234',
    'Unknown Caller',
    (CURRENT_DATE + 1 || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York',
    4,
    'VALIDATION_ERROR',
    5, 'failed',
    3,
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '1 hour',
    'staff:mike',
    'Called 3 times, no answer, left voicemail',
    'no_answer',
    NOW() - INTERVAL '4 hours'
);

-- =============================================================================
-- BLOCKED DATES
-- =============================================================================

-- Christmas closure
INSERT INTO blocked_dates (
    restaurant_id, start_date, end_date,
    block_type, reason, public_message,
    created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '2024-12-24',
    '2024-12-25',
    'closed',
    'Christmas holiday',
    'We are closed December 24-25 for Christmas. Happy Holidays!',
    'staff:owner'
);

-- New Year's Eve special hours
INSERT INTO blocked_dates (
    restaurant_id, start_date, end_date,
    block_type, special_hours, reason, public_message,
    created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '2024-12-31',
    '2024-12-31',
    'special_hours',
    '{"open": "18:00", "close": "02:00"}'::jsonb,
    'New Year''s Eve celebration',
    'Special New Year''s Eve dinner with extended hours and prix fixe menu',
    'staff:owner'
);

-- =============================================================================
-- KNOWLEDGE BASE ENTRIES
-- =============================================================================

-- Dietary accommodations
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer, hard_rule, requires_transfer, transfer_queue,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'dietary',
    ARRAY['do you have vegetarian options', 'vegan menu', 'gluten free', 'dietary restrictions', 'allergies', 'is the food safe'],
    ARRAY['vegetarian', 'vegan', 'gluten', 'allergy', 'dietary'],
    'We accommodate gluten-free and vegan diets. However, we cannot guarantee nut-free preparation due to kitchen cross-contamination.',
    'IF caller mentions nut allergy, anaphylactic, or epipen → TRANSFER immediately to manager',
    FALSE,
    NULL,
    1,
    TRUE,
    'staff:owner'
);

-- Parking information
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'parking',
    ARRAY['do you have parking', 'where do I park', 'valet', 'street parking', 'parking lot'],
    ARRAY['parking', 'valet', 'park', 'car'],
    'Valet is $15. Free street parking is available on 5th Avenue after 6 PM.',
    5,
    TRUE,
    'staff:owner'
);

-- Operating hours
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'hours',
    ARRAY['what time do you open', 'when do you close', 'hours', 'are you open', 'what are your hours'],
    ARRAY['hours', 'open', 'close', 'time'],
    'We are open Tuesday through Thursday 5-10 PM, Friday and Saturday 5-11 PM, Sunday 4-9 PM. We are closed on Mondays. Last seating is one hour before close.',
    5,
    TRUE,
    'staff:owner'
);

-- Cancellation policy
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'cancellation',
    ARRAY['cancel reservation', 'change booking', 'modify reservation', 'cancellation policy', 'cancel my table'],
    ARRAY['cancel', 'change', 'modify', 'reschedule'],
    'You can cancel up to 24 hours in advance via the link in your confirmation text, or just give us a call. For parties over 6, there may be a $25 per person charge for no-shows.',
    5,
    TRUE,
    'staff:owner'
);

-- Large parties
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer, hard_rule, requires_transfer, transfer_queue,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'large_party',
    ARRAY['large group', 'party of 10', 'private dining', 'event', 'big group', 'private event'],
    ARRAY['large', 'group', 'party', 'private', 'event'],
    'Groups over 8 require a deposit and set menu selection. Our events team can help with private dining options.',
    'IF party_size > 8 → TRANSFER to events coordinator',
    TRUE,
    'events',
    2,
    TRUE,
    'staff:owner'
);

-- Dress code
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'dress_code',
    ARRAY['dress code', 'what should I wear', 'formal', 'casual', 'attire'],
    ARRAY['dress', 'wear', 'formal', 'casual', 'attire'],
    'Smart casual is preferred. No beachwear or athletic wear please.',
    7,
    TRUE,
    'staff:owner'
);

-- Reservations info
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'reservations',
    ARRAY['how far in advance', 'book ahead', 'walk-ins', 'do I need a reservation'],
    ARRAY['advance', 'ahead', 'walk-in', 'reservation'],
    'We accept reservations up to 30 days in advance. Walk-ins are welcome but reservations are recommended, especially on weekends.',
    5,
    TRUE,
    'staff:owner'
);

-- Payment methods
INSERT INTO knowledge_base (
    restaurant_id, category, question_patterns, keywords,
    answer,
    priority, is_active, created_by
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'payment',
    ARRAY['do you take credit card', 'payment methods', 'cash only', 'apple pay'],
    ARRAY['pay', 'credit', 'cash', 'card', 'apple pay'],
    'We accept all major credit cards, Apple Pay, and Google Pay. Cash is also welcome.',
    8,
    TRUE,
    'staff:owner'
);

-- =============================================================================
-- SAMPLE ANALYTICS (Last 7 days)
-- =============================================================================

DO $$
DECLARE
    day_offset INTEGER;
    day_date DATE;
    base_calls INTEGER;
    base_bookings INTEGER;
BEGIN
    FOR day_offset IN 1..7 LOOP
        day_date := CURRENT_DATE - day_offset;

        -- Skip Mondays (restaurant closed)
        IF EXTRACT(DOW FROM day_date) != 1 THEN
            -- Weekend days get more traffic
            IF EXTRACT(DOW FROM day_date) IN (0, 5, 6) THEN
                base_calls := 15 + floor(random() * 10)::integer;
                base_bookings := floor(base_calls * 0.7)::integer;
            ELSE
                base_calls := 8 + floor(random() * 5)::integer;
                base_bookings := floor(base_calls * 0.65)::integer;
            END IF;

            INSERT INTO analytics_daily (
                restaurant_id, date,
                total_calls, completed_calls, transferred_calls, abandoned_calls, error_calls,
                bookings_made, bookings_via_ai, total_covers,
                callbacks_created, callbacks_resolved,
                avg_call_duration_seconds,
                completion_rate,
                peak_hour,
                calls_by_hour,
                safety_triggers
            ) VALUES (
                '00000000-0000-0000-0000-000000000001',
                day_date,
                base_calls,
                base_calls - floor(random() * 3)::integer,
                floor(random() * 2)::integer,
                floor(random() * 2)::integer,
                floor(random() * 1)::integer,
                base_bookings,
                base_bookings,
                base_bookings * (2 + floor(random() * 3)::integer),
                floor(random() * 2)::integer,
                floor(random() * 2)::integer,
                90 + floor(random() * 60)::decimal,
                (base_bookings::decimal / base_calls * 100)::decimal(5,2),
                18 + floor(random() * 3)::integer,
                jsonb_build_object(
                    '17', floor(random() * 3),
                    '18', floor(random() * 5) + 2,
                    '19', floor(random() * 5) + 3,
                    '20', floor(random() * 4) + 2,
                    '21', floor(random() * 3)
                ),
                floor(random() * 2)::integer
            )
            ON CONFLICT (restaurant_id, date) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    restaurant_count INTEGER;
    slot_count INTEGER;
    customer_count INTEGER;
    reservation_count INTEGER;
    call_count INTEGER;
    callback_count INTEGER;
    kb_count INTEGER;
    analytics_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO restaurant_count FROM restaurants;
    SELECT COUNT(*) INTO slot_count FROM availability_slots;
    SELECT COUNT(*) INTO customer_count FROM customers;
    SELECT COUNT(*) INTO reservation_count FROM reservations;
    SELECT COUNT(*) INTO call_count FROM calls;
    SELECT COUNT(*) INTO callback_count FROM callbacks;
    SELECT COUNT(*) INTO kb_count FROM knowledge_base;
    SELECT COUNT(*) INTO analytics_count FROM analytics_daily;

    RAISE NOTICE '';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'SEED DATA SUMMARY';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Restaurants:        %', restaurant_count;
    RAISE NOTICE 'Availability Slots: %', slot_count;
    RAISE NOTICE 'Customers:          %', customer_count;
    RAISE NOTICE 'Reservations:       %', reservation_count;
    RAISE NOTICE 'Calls:              %', call_count;
    RAISE NOTICE 'Callbacks:          %', callback_count;
    RAISE NOTICE 'Knowledge Base:     %', kb_count;
    RAISE NOTICE 'Analytics Days:     %', analytics_count;
    RAISE NOTICE '==============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Test Restaurant ID: 00000000-0000-0000-0000-000000000001';
    RAISE NOTICE 'Restaurant Name:    The Test Kitchen';
    RAISE NOTICE 'Restaurant Phone:   +15551234567';
    RAISE NOTICE '';
END $$;
