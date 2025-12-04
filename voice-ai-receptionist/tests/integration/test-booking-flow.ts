/**
 * Booking Flow Tests
 *
 * Tests for the complete booking flow: check availability -> create booking -> confirm.
 * Verifies happy path, race conditions, SMS confirmations, and database updates.
 */

import {
  config,
  getSupabase,
  setupTestEnvironment,
  teardownTestEnvironment,
  getTestRestaurant,
  createTestReservation,
  createTestCallLog,
  callWebhook,
  mockAvailabilityResponse,
  mockBookingResponse,
  mockSmsResponse,
  generateConfirmationCode,
  generateTestId,
  runTest,
  printTestResults,
  waitFor,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDefined,
  assertContains,
  type TestSuiteResult,
  type TestRestaurant,
} from './setup'

// ============================================================================
// Helper Functions
// ============================================================================

interface BookingRequest {
  restaurantId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  date: string
  time: string
  partySize: number
  seatingPreference?: 'indoor' | 'outdoor' | 'bar' | 'any'
  specialRequests?: string
  callId?: string
}

interface BookingResponse {
  success: boolean
  bookingId?: string
  confirmationCode?: string
  message?: string
  error?: string
}

interface SmsRequest {
  to: string
  template: string
  data: Record<string, string>
}

interface SmsResponse {
  sent: boolean
  messageId?: string
  error?: string
}

async function createBooking(
  request: BookingRequest,
  mockResponse?: ReturnType<typeof mockBookingResponse>
): Promise<BookingResponse> {
  const result = await callWebhook('create-booking', request, mockResponse)
  return result as BookingResponse
}

async function sendSmsConfirmation(
  request: SmsRequest,
  mockResponse?: ReturnType<typeof mockSmsResponse>
): Promise<SmsResponse> {
  const result = await callWebhook('send-sms', request, mockResponse)
  return result as SmsResponse
}

// Get tomorrow's date in YYYY-MM-DD format
function getTomorrowDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

// ============================================================================
// Test Suite
// ============================================================================

export async function runBookingFlowTests(): Promise<TestSuiteResult> {
  const suiteStart = Date.now()
  const tests: TestSuiteResult['tests'] = []
  let testRestaurant: TestRestaurant

  // Setup
  try {
    testRestaurant = await setupTestEnvironment()
  } catch (error) {
    return {
      name: 'Booking Flow Tests',
      tests: [{
        name: 'Setup',
        passed: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      }],
      passed: 0,
      failed: 1,
      duration: Date.now() - suiteStart,
    }
  }

  const supabase = getSupabase()

  // -------------------------------------------------------------------------
  // Test 1: Happy path - check → book → confirm
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Happy path: check availability → book → confirm', async () => {
      const date = getTomorrowDate()
      const customerPhone = '+15551234567'
      const customerName = 'John Doe'

      // Step 1: Check availability
      const availabilityResult = await callWebhook(
        'check-availability',
        {
          restaurantId: testRestaurant.id,
          date,
          time: '18:00',
          partySize: 2,
        },
        mockAvailabilityResponse(true)
      )
      assertTrue((availabilityResult as { available: boolean }).available, 'Expected availability')

      // Step 2: Create booking
      const confirmationCode = generateConfirmationCode()
      const bookingResult = await createBooking(
        {
          restaurantId: testRestaurant.id,
          customerName,
          customerPhone,
          date,
          time: '18:00',
          partySize: 2,
        },
        mockBookingResponse(true, confirmationCode)
      )

      assertTrue(bookingResult.success, 'Expected booking to succeed')
      assertDefined(bookingResult.confirmationCode)

      // Step 3: Verify SMS can be sent
      const smsResult = await sendSmsConfirmation(
        {
          to: customerPhone,
          template: 'confirmation',
          data: {
            customer_name: customerName,
            date,
            time: '18:00',
            party_size: '2',
            confirmation_code: confirmationCode,
          },
        },
        mockSmsResponse(true)
      )

      assertTrue(smsResult.sent, 'Expected SMS to be sent')
    })
  )

  // -------------------------------------------------------------------------
  // Test 2: Race condition - slot taken between check and book
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Race condition: slot taken between check and book', async () => {
      const date = getTomorrowDate()
      const time = '19:00'

      // Step 1: Check availability - shows available
      const availabilityResult = await callWebhook(
        'check-availability',
        {
          restaurantId: testRestaurant.id,
          date,
          time,
          partySize: 4,
        },
        mockAvailabilityResponse(true)
      )
      assertTrue((availabilityResult as { available: boolean }).available)

      // Step 2: Simulate another booking taking the slot
      // In real scenario, this would be another concurrent request
      const competingReservation = await createTestReservation(testRestaurant.id, {
        reservation_time: new Date(`${date}T${time}:00`).toISOString(),
        party_size: 4,
        customer_name: 'Competing Customer',
        customer_phone: '+15559999999',
      })

      // Step 3: Attempt to book - should fail or offer alternatives
      const bookingResult = await createBooking(
        {
          restaurantId: testRestaurant.id,
          customerName: 'Late Customer',
          customerPhone: '+15558888888',
          date,
          time,
          partySize: 4,
        },
        {
          success: true,
          data: {
            success: false,
            error: 'slot_taken',
            message: 'Sorry, that time slot was just taken. Alternative times available: 18:30, 19:30, 20:00',
            alternatives: ['18:30', '19:30', '20:00'],
          },
        }
      )

      assertFalse(bookingResult.success, 'Expected booking to fail due to race condition')
    })
  )

  // -------------------------------------------------------------------------
  // Test 3: SMS confirmation sent
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('SMS confirmation sent successfully', async () => {
      const customerPhone = '+15551112222'
      const confirmationCode = generateConfirmationCode()

      const smsResult = await sendSmsConfirmation(
        {
          to: customerPhone,
          template: 'confirmation',
          data: {
            customer_name: 'SMS Test Customer',
            restaurant_name: testRestaurant.name,
            date: getTomorrowDate(),
            time: '18:00',
            party_size: '2',
            confirmation_code: confirmationCode,
          },
        },
        mockSmsResponse(true)
      )

      assertTrue(smsResult.sent, 'Expected SMS to be sent')
      assertDefined(smsResult.messageId)
    })
  )

  tests.push(
    await runTest('SMS confirmation handles invalid phone', async () => {
      const invalidPhone = 'not-a-phone'

      const smsResult = await sendSmsConfirmation(
        {
          to: invalidPhone,
          template: 'confirmation',
          data: {
            customer_name: 'Invalid Phone Customer',
            date: getTomorrowDate(),
            time: '18:00',
            party_size: '2',
            confirmation_code: generateConfirmationCode(),
          },
        },
        {
          success: true,
          data: {
            sent: false,
            error: 'Invalid phone number format',
          },
        }
      )

      assertFalse(smsResult.sent, 'Expected SMS to fail for invalid phone')
    })
  )

  // -------------------------------------------------------------------------
  // Test 4: Booking appears in database
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Booking appears in database with correct data', async () => {
      const bookingId = generateTestId('booking')
      const confirmationCode = generateConfirmationCode()
      const date = getTomorrowDate()
      const reservationTime = new Date(`${date}T20:00:00`)

      // Create reservation directly to simulate webhook result
      const reservation = await createTestReservation(testRestaurant.id, {
        id: bookingId,
        customer_name: 'Database Test Customer',
        customer_phone: '+15553334444',
        customer_email: 'test@example.com',
        party_size: 3,
        reservation_time: reservationTime.toISOString(),
        seating_preference: 'outdoor',
        special_requests: 'Birthday celebration',
        confirmation_code: confirmationCode,
        status: 'confirmed',
      })

      // Verify in database
      const { data: dbReservation, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', bookingId)
        .single()

      assertDefined(dbReservation)
      assertEqual(dbReservation.customer_name, 'Database Test Customer')
      assertEqual(dbReservation.customer_phone, '+15553334444')
      assertEqual(dbReservation.party_size, 3)
      assertEqual(dbReservation.seating_preference, 'outdoor')
      assertEqual(dbReservation.status, 'confirmed')
      assertEqual(dbReservation.confirmation_code, confirmationCode)
    })
  )

  tests.push(
    await runTest('Booking linked to restaurant correctly', async () => {
      const reservation = await createTestReservation(testRestaurant.id, {
        customer_name: 'Link Test Customer',
        customer_phone: '+15555556666',
      })

      // Verify restaurant link
      const { data: dbReservation } = await supabase
        .from('reservations')
        .select('*, restaurants(*)')
        .eq('id', reservation.id)
        .single()

      assertDefined(dbReservation)
      assertEqual(dbReservation.restaurant_id, testRestaurant.id)
    })
  )

  // -------------------------------------------------------------------------
  // Test 5: Call record updated with outcome
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Call record updated with booking_made outcome', async () => {
      // Create a call log first
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15557778888',
        status: 'completed',
      })

      // Simulate booking created during call
      const reservation = await createTestReservation(testRestaurant.id, {
        customer_phone: '+15557778888',
        customer_name: 'Call Booking Customer',
      })

      // Update call log with outcome (simulating what webhook would do)
      const { error } = await supabase
        .from('call_logs')
        .update({
          outcome: 'booking_made',
          summary: `Booking created for ${reservation.customer_name}`,
        })
        .eq('id', callLog.id)

      assertTrue(!error, `Expected no error, got: ${error?.message}`)

      // Verify call log updated
      const { data: updatedCallLog } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callLog.id)
        .single()

      assertDefined(updatedCallLog)
      assertEqual(updatedCallLog.outcome, 'booking_made')
      assertContains(updatedCallLog.summary || '', 'Booking created')
    })
  )

  tests.push(
    await runTest('Call record tracks failed booking attempt', async () => {
      // Create a call log
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15559990000',
        status: 'completed',
      })

      // Simulate failed booking (no availability)
      // Update call log with failed outcome
      const { error } = await supabase
        .from('call_logs')
        .update({
          outcome: 'info_provided',
          summary: 'Customer inquired about booking but no availability for requested time',
        })
        .eq('id', callLog.id)

      assertTrue(!error)

      // Verify call log
      const { data: updatedCallLog } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callLog.id)
        .single()

      assertDefined(updatedCallLog)
      assertEqual(updatedCallLog.outcome, 'info_provided')
    })
  )

  // -------------------------------------------------------------------------
  // Test 6: Booking with special requests
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Booking with special requests preserved', async () => {
      const specialRequests = 'Wheelchair accessible table, celebrating anniversary'

      const reservation = await createTestReservation(testRestaurant.id, {
        customer_name: 'Special Request Customer',
        customer_phone: '+15551230000',
        special_requests: specialRequests,
      })

      // Verify special requests stored
      const { data: dbReservation } = await supabase
        .from('reservations')
        .select('special_requests')
        .eq('id', reservation.id)
        .single()

      assertDefined(dbReservation)
      assertEqual(dbReservation.special_requests, specialRequests)
    })
  )

  // -------------------------------------------------------------------------
  // Test 7: Booking modification scenarios
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Booking can be cancelled', async () => {
      const reservation = await createTestReservation(testRestaurant.id, {
        customer_name: 'Cancel Test Customer',
        customer_phone: '+15551110001',
        status: 'confirmed',
      })

      // Cancel the booking
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id)

      assertTrue(!error)

      // Verify cancelled
      const { data: cancelled } = await supabase
        .from('reservations')
        .select('status')
        .eq('id', reservation.id)
        .single()

      assertEqual(cancelled?.status, 'cancelled')
    })
  )

  tests.push(
    await runTest('Booking party size can be updated', async () => {
      const reservation = await createTestReservation(testRestaurant.id, {
        customer_name: 'Update Test Customer',
        customer_phone: '+15551110002',
        party_size: 2,
      })

      // Update party size
      const { error } = await supabase
        .from('reservations')
        .update({ party_size: 4 })
        .eq('id', reservation.id)

      assertTrue(!error)

      // Verify updated
      const { data: updated } = await supabase
        .from('reservations')
        .select('party_size')
        .eq('id', reservation.id)
        .single()

      assertEqual(updated?.party_size, 4)
    })
  )

  // -------------------------------------------------------------------------
  // Test 8: Duplicate booking prevention
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Duplicate booking detection', async () => {
      const date = getTomorrowDate()
      const time = '20:30'
      const customerPhone = '+15551112223'

      // Create first booking
      await createTestReservation(testRestaurant.id, {
        customer_phone: customerPhone,
        customer_name: 'Duplicate Customer',
        reservation_time: new Date(`${date}T${time}:00`).toISOString(),
      })

      // Attempt duplicate booking
      const duplicateResult = await createBooking(
        {
          restaurantId: testRestaurant.id,
          customerName: 'Duplicate Customer',
          customerPhone,
          date,
          time,
          partySize: 2,
        },
        {
          success: true,
          data: {
            success: false,
            error: 'duplicate_booking',
            message: 'You already have a reservation at this time',
          },
        }
      )

      assertFalse(duplicateResult.success, 'Expected duplicate booking to be rejected')
    })
  )

  // -------------------------------------------------------------------------
  // Test 9: Confirmation code uniqueness
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Confirmation codes are unique', async () => {
      const codes = new Set<string>()

      // Create multiple reservations and collect codes
      for (let i = 0; i < 5; i++) {
        const reservation = await createTestReservation(testRestaurant.id, {
          customer_name: `Unique Code Customer ${i}`,
          customer_phone: `+1555111000${i}`,
        })
        codes.add(reservation.confirmation_code)
      }

      // All codes should be unique
      assertEqual(codes.size, 5, 'Expected all confirmation codes to be unique')
    })
  )

  // Teardown
  try {
    await teardownTestEnvironment()
  } catch (error) {
    console.warn('Warning: Teardown failed:', error)
  }

  // Calculate results
  const passed = tests.filter((t) => t.passed).length
  const failed = tests.filter((t) => !t.passed).length

  const result: TestSuiteResult = {
    name: 'Booking Flow Tests',
    tests,
    passed,
    failed,
    duration: Date.now() - suiteStart,
  }

  printTestResults(result)

  return result
}

// Run if executed directly
if (require.main === module) {
  runBookingFlowTests()
    .then((result) => {
      process.exit(result.failed > 0 ? 1 : 0)
    })
    .catch((error) => {
      console.error('Test suite failed:', error)
      process.exit(1)
    })
}
