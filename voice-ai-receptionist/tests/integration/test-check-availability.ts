/**
 * Availability Checking Tests
 *
 * Tests for the check-availability webhook endpoint.
 * Verifies slot availability, party size limits, seating preferences,
 * and availability override handling.
 */

import {
  config,
  getSupabase,
  setupTestEnvironment,
  teardownTestEnvironment,
  getTestRestaurant,
  createTestReservation,
  callWebhook,
  mockAvailabilityResponse,
  runTest,
  printTestResults,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDefined,
  assertArrayLength,
  assertGreaterThan,
  type TestSuiteResult,
  type TestRestaurant,
} from './setup'

// ============================================================================
// Helper Functions
// ============================================================================

interface AvailabilityRequest {
  restaurantId: string
  date: string
  time: string
  partySize: number
  seatingPreference?: 'indoor' | 'outdoor' | 'bar' | 'any'
}

interface AvailabilityResponse {
  available: boolean
  slotId?: string
  alternatives?: string[]
  message?: string
  maxPartySize?: number
  seatingAvailable?: string[]
}

async function checkAvailability(
  request: AvailabilityRequest,
  mockResponse?: ReturnType<typeof mockAvailabilityResponse>
): Promise<AvailabilityResponse> {
  const result = await callWebhook('check-availability', request, mockResponse)
  return result as AvailabilityResponse
}

// Get tomorrow's date in YYYY-MM-DD format
function getTomorrowDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

// Get a date string for N days from now
function getDateFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

// ============================================================================
// Test Suite
// ============================================================================

export async function runAvailabilityTests(): Promise<TestSuiteResult> {
  const suiteStart = Date.now()
  const tests: TestSuiteResult['tests'] = []
  let testRestaurant: TestRestaurant

  // Setup
  try {
    testRestaurant = await setupTestEnvironment()
  } catch (error) {
    return {
      name: 'Availability Tests',
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

  // -------------------------------------------------------------------------
  // Test 1: Available slot returns correctly
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Available slot returns correctly', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 2,
      }

      // Mock an available response
      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(true)
      )

      assertTrue(response.available, 'Expected slot to be available')
      assertDefined(response.message)
    })
  )

  // -------------------------------------------------------------------------
  // Test 2: Unavailable slot returns alternatives
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Unavailable slot returns alternatives', async () => {
      // First, create existing reservations to fill the slot
      const date = getTomorrowDate()
      const reservationTime = new Date(`${date}T19:00:00`)

      // Create several reservations for 7 PM
      for (let i = 0; i < 5; i++) {
        await createTestReservation(testRestaurant.id, {
          reservation_time: reservationTime.toISOString(),
          party_size: 4,
        })
      }

      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date,
        time: '19:00',
        partySize: 4,
      }

      // Mock unavailable with alternatives
      const alternatives = ['18:30', '19:30', '20:00']
      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(false, alternatives)
      )

      assertFalse(response.available, 'Expected slot to be unavailable')
      assertDefined(response.alternatives)
      assertGreaterThan(response.alternatives!.length, 0, 'Expected at least one alternative')
    })
  )

  // -------------------------------------------------------------------------
  // Test 3: Party size limits respected
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Party size limits respected - within limit', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 4, // Within default max of 8
      }

      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(true)
      )

      assertTrue(response.available, 'Expected slot to be available for party of 4')
    })
  )

  tests.push(
    await runTest('Party size limits respected - at limit', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 8, // At default max
      }

      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(true)
      )

      assertTrue(response.available, 'Expected slot to be available for party of 8')
    })
  )

  tests.push(
    await runTest('Party size limits respected - exceeds limit', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 10, // Exceeds default max of 8
      }

      // Mock unavailable due to party size
      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: false,
            message: 'Party size exceeds maximum of 8. Please call for large party arrangements.',
            maxPartySize: 8,
          },
        }
      )

      assertFalse(response.available, 'Expected slot to be unavailable for party of 10')
    })
  )

  // -------------------------------------------------------------------------
  // Test 4: Seating preference filtering
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Seating preference - indoor requested', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 2,
        seatingPreference: 'indoor',
      }

      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: true,
            seatingAvailable: ['indoor'],
            message: 'Indoor seating available',
          },
        }
      )

      assertTrue(response.available, 'Expected indoor seating to be available')
      assertDefined(response.seatingAvailable)
      assertTrue(
        response.seatingAvailable!.includes('indoor'),
        'Expected indoor in available seating'
      )
    })
  )

  tests.push(
    await runTest('Seating preference - outdoor unavailable', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 2,
        seatingPreference: 'outdoor',
      }

      // Mock outdoor unavailable but alternatives exist
      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: false,
            seatingAvailable: ['indoor', 'bar'],
            message: 'Outdoor seating not available, but indoor and bar seating available',
            alternatives: ['indoor', 'bar'],
          },
        }
      )

      assertFalse(response.available, 'Expected outdoor seating to be unavailable')
    })
  )

  tests.push(
    await runTest('Seating preference - any preference', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 2,
        seatingPreference: 'any',
      }

      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: true,
            seatingAvailable: ['indoor', 'outdoor', 'bar'],
            message: 'Multiple seating options available',
          },
        }
      )

      assertTrue(response.available, 'Expected any seating to be available')
    })
  )

  // -------------------------------------------------------------------------
  // Test 5: Availability override handling
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Availability override - closed day', async () => {
      // Update restaurant to be closed on the test day
      const supabase = getSupabase()
      const closedDate = getDateFromNow(3)

      // Simulate availability override (restaurant closed for private event)
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: closedDate,
        time: '18:00',
        partySize: 2,
      }

      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: false,
            message: 'Restaurant closed for private event',
            alternatives: [],
          },
        }
      )

      assertFalse(response.available, 'Expected slot to be unavailable on closed day')
    })
  )

  tests.push(
    await runTest('Availability override - extra capacity', async () => {
      // Simulate extra capacity override (special event with more seating)
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 12, // Normally over limit
      }

      // Mock available due to override
      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: true,
            message: 'Special event seating available for large parties',
          },
        }
      )

      assertTrue(response.available, 'Expected large party to be available with override')
    })
  )

  tests.push(
    await runTest('Availability override - modified hours', async () => {
      // Simulate modified hours (early closing)
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '21:30', // After modified last seating
        partySize: 2,
      }

      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: false,
            message: 'Requested time is after last seating',
            alternatives: ['20:00', '20:30'],
          },
        }
      )

      assertFalse(response.available, 'Expected late slot to be unavailable')
      assertDefined(response.alternatives)
    })
  )

  // -------------------------------------------------------------------------
  // Test 6: Edge cases
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Edge case - same day booking', async () => {
      const today = new Date().toISOString().split('T')[0]
      const currentHour = new Date().getHours()
      const requestTime = `${currentHour + 2}:00` // 2 hours from now

      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: today,
        time: requestTime,
        partySize: 2,
      }

      // Mock response based on whether it's within business hours
      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(currentHour + 2 < 21) // Available if before 9 PM
      )

      // Just verify we get a valid response
      assertDefined(response.available)
    })
  )

  tests.push(
    await runTest('Edge case - far future booking', async () => {
      const futureDate = getDateFromNow(90) // 90 days out

      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: futureDate,
        time: '18:00',
        partySize: 2,
      }

      const response = await checkAvailability(
        request,
        {
          success: true,
          data: {
            available: false,
            message: 'Reservations only accepted up to 30 days in advance',
          },
        }
      )

      assertFalse(response.available, 'Expected far future booking to be unavailable')
    })
  )

  tests.push(
    await runTest('Edge case - party size of 1', async () => {
      const request: AvailabilityRequest = {
        restaurantId: testRestaurant.id,
        date: getTomorrowDate(),
        time: '18:00',
        partySize: 1,
      }

      const response = await checkAvailability(
        request,
        mockAvailabilityResponse(true)
      )

      assertTrue(response.available, 'Expected single diner to be accommodated')
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
    name: 'Availability Tests',
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
  runAvailabilityTests()
    .then((result) => {
      process.exit(result.failed > 0 ? 1 : 0)
    })
    .catch((error) => {
      console.error('Test suite failed:', error)
      process.exit(1)
    })
}
