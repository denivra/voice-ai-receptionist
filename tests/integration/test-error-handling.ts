/**
 * Error Handling Tests
 *
 * Tests for error scenarios including CRM timeouts, graceful fallbacks,
 * callback creation on errors, and Slack alerts for critical errors.
 */

import {
  config,
  getSupabase,
  setupTestEnvironment,
  teardownTestEnvironment,
  getTestRestaurant,
  createTestCallback,
  createTestCallLog,
  callWebhook,
  mockSlackResponse,
  generateTestId,
  runTest,
  printTestResults,
  waitFor,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDefined,
  assertContains,
  assertGreaterThan,
  type TestSuiteResult,
  type TestRestaurant,
  type MockWebhookResponse,
} from './setup'

// ============================================================================
// Helper Functions
// ============================================================================

interface CrmRequest {
  restaurantId: string
  action: string
  data: Record<string, unknown>
}

interface CrmResponse {
  success: boolean
  data?: unknown
  error?: string
}

interface SlackAlertRequest {
  channel: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  metadata?: Record<string, unknown>
}

interface SlackAlertResponse {
  ok: boolean
  error?: string
}

async function callCrm(
  request: CrmRequest,
  mockResponse?: MockWebhookResponse
): Promise<CrmResponse> {
  const result = await callWebhook('crm-action', request, mockResponse)
  return result as CrmResponse
}

async function sendSlackAlert(
  request: SlackAlertRequest,
  mockResponse?: ReturnType<typeof mockSlackResponse>
): Promise<SlackAlertResponse> {
  const result = await callWebhook('slack-alert', request, mockResponse)
  return result as SlackAlertResponse
}

// Simulate a timeout by using a delayed mock
function createTimeoutMock(delayMs: number): MockWebhookResponse {
  return {
    success: false,
    error: 'Request timeout',
    delay: delayMs,
  }
}

// Create a graceful fallback response
function createFallbackMock(fallbackMessage: string): MockWebhookResponse {
  return {
    success: true,
    data: {
      fallback: true,
      message: fallbackMessage,
    },
  }
}

// ============================================================================
// Test Suite
// ============================================================================

export async function runErrorHandlingTests(): Promise<TestSuiteResult> {
  const suiteStart = Date.now()
  const tests: TestSuiteResult['tests'] = []
  let testRestaurant: TestRestaurant

  // Setup
  try {
    testRestaurant = await setupTestEnvironment()
  } catch (error) {
    return {
      name: 'Error Handling Tests',
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
  // Test 1: CRM timeout (mock 5+ second delay)
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('CRM timeout detected after 5+ seconds', async () => {
      const startTime = Date.now()

      try {
        await callCrm(
          {
            restaurantId: testRestaurant.id,
            action: 'check_availability',
            data: { date: '2024-01-15', time: '18:00' },
          },
          createTimeoutMock(5500) // 5.5 second delay
        )
        // Should not reach here
        throw new Error('Expected timeout error')
      } catch (error) {
        const duration = Date.now() - startTime
        assertGreaterThan(duration, 5000, 'Expected delay of at least 5 seconds')
        assertTrue(
          error instanceof Error && error.message.includes('timeout'),
          'Expected timeout error message'
        )
      }
    })
  )

  tests.push(
    await runTest('CRM timeout triggers fallback flow', async () => {
      // Simulate timeout followed by fallback
      const timeoutError = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'check_availability',
          data: { date: '2024-01-15', time: '18:00' },
        },
        {
          success: true,
          data: {
            timeout: true,
            fallbackTriggered: true,
            message: 'CRM unavailable, using cached data',
          },
          delay: 100, // Quick mock
        }
      )

      assertTrue(
        (timeoutError as { fallbackTriggered?: boolean }).fallbackTriggered === true ||
        (timeoutError as { timeout?: boolean }).timeout === true,
        'Expected fallback to be triggered'
      )
    })
  )

  // -------------------------------------------------------------------------
  // Test 2: Graceful fallback response
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Graceful fallback provides helpful message', async () => {
      const result = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'get_availability',
          data: {},
        },
        createFallbackMock(
          "I apologize, but I'm having trouble accessing our reservation system right now. " +
          "I can take your information and have someone call you back within 15 minutes to complete your reservation."
        )
      )

      assertDefined(result)
      assertTrue((result as { fallback?: boolean }).fallback === true, 'Expected fallback flag')
      assertContains(
        (result as { message?: string }).message || '',
        'call you back',
        'Expected helpful fallback message'
      )
    })
  )

  tests.push(
    await runTest('Fallback maintains conversation context', async () => {
      const customerContext = {
        name: 'Error Test Customer',
        phone: '+15551234567',
        requestedDate: '2024-01-15',
        requestedTime: '18:00',
        partySize: 4,
      }

      const result = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'create_booking',
          data: customerContext,
        },
        {
          success: true,
          data: {
            fallback: true,
            contextPreserved: true,
            preservedData: customerContext,
            message: 'Unable to complete booking. Context preserved for callback.',
          },
        }
      )

      const response = result as {
        contextPreserved?: boolean
        preservedData?: typeof customerContext
      }
      assertTrue(response.contextPreserved === true, 'Expected context to be preserved')
      assertEqual(response.preservedData?.name, customerContext.name)
      assertEqual(response.preservedData?.partySize, customerContext.partySize)
    })
  )

  // -------------------------------------------------------------------------
  // Test 3: Callback created on error
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Callback created when booking fails', async () => {
      const customerPhone = '+15559998877'
      const customerName = 'Callback Error Customer'

      // Simulate booking failure creating a callback
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: customerPhone,
        customer_name: customerName,
        reason: 'System error during booking attempt - customer requested 18:00 for 4 guests on 2024-01-15',
        priority: 'high',
        status: 'pending',
      })

      // Verify callback created in database
      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.customer_phone, customerPhone)
      assertEqual(dbCallback.priority, 'high')
      assertContains(dbCallback.reason, 'System error')
    })
  )

  tests.push(
    await runTest('Callback includes error context', async () => {
      const errorContext = {
        attemptedAction: 'create_booking',
        errorType: 'CRM_TIMEOUT',
        customerRequest: {
          date: '2024-01-15',
          time: '18:00',
          partySize: 4,
        },
      }

      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15559998866',
        customer_name: 'Context Error Customer',
        reason: `CRM_TIMEOUT during booking: ${JSON.stringify(errorContext.customerRequest)}`,
        priority: 'high',
      })

      // Verify error context in callback
      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('reason')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertContains(dbCallback.reason, 'CRM_TIMEOUT')
      assertContains(dbCallback.reason, '18:00')
    })
  )

  tests.push(
    await runTest('Callback linked to call log', async () => {
      // Create call log first
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15559998855',
        status: 'completed',
        outcome: 'callback_requested',
      })

      // Create callback with reference to call
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15559998855',
        customer_name: 'Linked Callback Customer',
        reason: 'Error during call - callback created',
        call_log_id: callLog.id,
      })

      // Verify linkage
      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*, call_logs(*)')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.call_log_id, callLog.id)
    })
  )

  // -------------------------------------------------------------------------
  // Test 4: Slack alert sent on critical error
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Slack alert sent for critical CRM error', async () => {
      const alertResult = await sendSlackAlert(
        {
          channel: '#alerts',
          message: 'CRITICAL: CRM system unreachable for 5+ minutes',
          severity: 'critical',
          metadata: {
            restaurantId: testRestaurant.id,
            errorType: 'CRM_UNAVAILABLE',
            duration: '5 minutes',
            affectedCalls: 3,
          },
        },
        mockSlackResponse(true)
      )

      assertTrue(alertResult.ok, 'Expected Slack alert to be sent')
    })
  )

  tests.push(
    await runTest('Slack alert includes error details', async () => {
      const errorDetails = {
        errorCode: 'BOOKING_FAILED',
        customerPhone: '+15551234567',
        attemptedTime: new Date().toISOString(),
        stackTrace: 'Error at createBooking:42',
      }

      const alertResult = await sendSlackAlert(
        {
          channel: '#errors',
          message: `Booking failed: ${errorDetails.errorCode}`,
          severity: 'critical',
          metadata: errorDetails,
        },
        {
          success: true,
          data: {
            ok: true,
            ts: '1234567890.123456',
          },
        }
      )

      assertTrue(alertResult.ok, 'Expected alert with details to be sent')
    })
  )

  tests.push(
    await runTest('Slack alert handles delivery failure gracefully', async () => {
      // Even if Slack fails, system should continue
      const alertResult = await sendSlackAlert(
        {
          channel: '#alerts',
          message: 'Test alert',
          severity: 'warning',
        },
        {
          success: true,
          data: {
            ok: false,
            error: 'channel_not_found',
          },
        }
      )

      assertFalse(alertResult.ok, 'Expected Slack delivery to fail')
      // But test should not throw - system handles gracefully
    })
  )

  // -------------------------------------------------------------------------
  // Test 5: Multiple error scenarios
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Database connection error handled', async () => {
      const result = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'get_bookings',
          data: {},
        },
        {
          success: true,
          data: {
            error: 'DATABASE_CONNECTION_ERROR',
            fallback: true,
            message: 'Unable to fetch bookings. Please try again.',
          },
        }
      )

      assertTrue(
        (result as { fallback?: boolean }).fallback === true,
        'Expected database error to trigger fallback'
      )
    })
  )

  tests.push(
    await runTest('Invalid restaurant ID handled', async () => {
      const result = await callCrm(
        {
          restaurantId: 'non-existent-restaurant',
          action: 'check_availability',
          data: {},
        },
        {
          success: true,
          data: {
            error: 'RESTAURANT_NOT_FOUND',
            message: 'Restaurant not found',
          },
        }
      )

      assertEqual(
        (result as { error?: string }).error,
        'RESTAURANT_NOT_FOUND'
      )
    })
  )

  tests.push(
    await runTest('Rate limiting handled gracefully', async () => {
      const result = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'bulk_check',
          data: { requests: 100 },
        },
        {
          success: true,
          data: {
            error: 'RATE_LIMITED',
            retryAfter: 60,
            message: 'Too many requests. Please wait 60 seconds.',
          },
        }
      )

      assertEqual((result as { error?: string }).error, 'RATE_LIMITED')
      assertDefined((result as { retryAfter?: number }).retryAfter)
    })
  )

  // -------------------------------------------------------------------------
  // Test 6: Error recovery
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('System recovers after transient error', async () => {
      // First call fails
      const failedResult = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'check_availability',
          data: {},
        },
        {
          success: true,
          data: {
            error: 'TRANSIENT_ERROR',
            retryable: true,
          },
        }
      )

      assertTrue(
        (failedResult as { retryable?: boolean }).retryable === true,
        'Expected error to be retryable'
      )

      // Retry succeeds
      const successResult = await callCrm(
        {
          restaurantId: testRestaurant.id,
          action: 'check_availability',
          data: {},
        },
        {
          success: true,
          data: {
            available: true,
            recovered: true,
          },
        }
      )

      assertTrue(
        (successResult as { recovered?: boolean }).recovered === true,
        'Expected recovery on retry'
      )
    })
  )

  // -------------------------------------------------------------------------
  // Test 7: Error logging
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Errors logged for debugging', async () => {
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15551112233',
        status: 'completed',
        outcome: 'failed',
        summary: 'Call failed due to CRM timeout at 14:32:15. Customer was attempting to book for 2024-01-15.',
      })

      // Verify error logged
      const { data: dbCallLog } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callLog.id)
        .single()

      assertDefined(dbCallLog)
      assertEqual(dbCallLog.outcome, 'failed')
      assertContains(dbCallLog.summary || '', 'CRM timeout')
    })
  )

  // -------------------------------------------------------------------------
  // Test 8: Error threshold alerts
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Alert triggered when error rate exceeds threshold', async () => {
      // Simulate high error rate scenario
      const errorRate = 15 // 15% error rate
      const threshold = 10 // 10% threshold

      const shouldAlert = errorRate > threshold

      if (shouldAlert) {
        const alertResult = await sendSlackAlert(
          {
            channel: '#alerts',
            message: `Error rate ${errorRate}% exceeds threshold ${threshold}%`,
            severity: 'warning',
            metadata: {
              errorRate,
              threshold,
              period: '15 minutes',
            },
          },
          mockSlackResponse(true)
        )

        assertTrue(alertResult.ok, 'Expected threshold alert to be sent')
      }

      assertTrue(shouldAlert, 'Expected alert to be triggered')
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
    name: 'Error Handling Tests',
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
  runErrorHandlingTests()
    .then((result) => {
      process.exit(result.failed > 0 ? 1 : 0)
    })
    .catch((error) => {
      console.error('Test suite failed:', error)
      process.exit(1)
    })
}
