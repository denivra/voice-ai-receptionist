/**
 * Transfer Flow Tests
 *
 * Tests for safety transfer scenarios including allergy keywords,
 * large party handling, callback creation, and transfer reason logging.
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
  generateTestId,
  runTest,
  printTestResults,
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

interface TransferDecisionRequest {
  restaurantId: string
  callId: string
  transcript: string
  customerPhone: string
  detectedKeywords?: string[]
  partySize?: number
  context?: Record<string, unknown>
}

interface TransferDecisionResponse {
  shouldTransfer: boolean
  reason?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  transferScript?: string
  createCallback?: boolean
}

interface CallbackCreationRequest {
  restaurantId: string
  callId: string
  customerPhone: string
  customerName?: string
  reason: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  metadata?: Record<string, unknown>
}

// Allergy-related keywords that should trigger transfer
const ALLERGY_KEYWORDS = [
  'allergy',
  'allergic',
  'anaphylaxis',
  'anaphylactic',
  'epipen',
  'severe allergy',
  'nut allergy',
  'peanut allergy',
  'shellfish allergy',
  'gluten free',
  'celiac',
  'food sensitivity',
]

// Large party threshold (typically 6+)
const LARGE_PARTY_THRESHOLD = 6

async function checkTransferDecision(
  request: TransferDecisionRequest,
  mockResponse?: MockWebhookResponse
): Promise<TransferDecisionResponse> {
  const result = await callWebhook('transfer-decision', request, mockResponse)
  return result as TransferDecisionResponse
}

// Detect keywords in transcript
function detectKeywords(transcript: string, keywords: string[]): string[] {
  const lowerTranscript = transcript.toLowerCase()
  return keywords.filter(keyword => lowerTranscript.includes(keyword.toLowerCase()))
}

// ============================================================================
// Test Suite
// ============================================================================

export async function runTransferFlowTests(): Promise<TestSuiteResult> {
  const suiteStart = Date.now()
  const tests: TestSuiteResult['tests'] = []
  let testRestaurant: TestRestaurant

  // Setup
  try {
    testRestaurant = await setupTestEnvironment()
  } catch (error) {
    return {
      name: 'Transfer Flow Tests',
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
  // Test 1: Allergy keyword triggers transfer
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Allergy keyword "allergy" triggers immediate transfer', async () => {
      const transcript = "I have a severe peanut allergy and need to know if your kitchen can accommodate this"

      const detectedKeywords = detectKeywords(transcript, ALLERGY_KEYWORDS)
      assertTrue(detectedKeywords.length > 0, 'Expected allergy keywords detected')

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15551234567',
          detectedKeywords,
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'ALLERGY_SAFETY',
            priority: 'urgent',
            transferScript: "I understand you have an allergy concern. Let me connect you with our manager who can discuss our kitchen protocols and ensure your safety.",
            createCallback: false, // Direct transfer, no callback
          },
        }
      )

      assertTrue(result.shouldTransfer, 'Expected transfer for allergy mention')
      assertEqual(result.reason, 'ALLERGY_SAFETY')
      assertEqual(result.priority, 'urgent')
    })
  )

  tests.push(
    await runTest('Allergy keyword "epipen" triggers urgent transfer', async () => {
      const transcript = "I carry an epipen because of my shellfish allergy"

      const detectedKeywords = detectKeywords(transcript, ALLERGY_KEYWORDS)

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15551234568',
          detectedKeywords,
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'SEVERE_ALLERGY',
            priority: 'urgent',
            transferScript: "Since you carry an epipen, I want to make sure you speak directly with our kitchen manager about your specific dietary needs. Please hold while I transfer you.",
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.priority, 'urgent')
      assertContains(result.transferScript || '', 'epipen')
    })
  )

  tests.push(
    await runTest('Multiple allergy keywords increase urgency', async () => {
      const transcript = "I have celiac disease and I'm also allergic to tree nuts. I need to know about cross-contamination"

      const detectedKeywords = detectKeywords(transcript, ALLERGY_KEYWORDS)
      assertGreaterThan(detectedKeywords.length, 1, 'Expected multiple keywords')

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15551234569',
          detectedKeywords,
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'MULTIPLE_ALLERGIES',
            priority: 'urgent',
            transferScript: "I can see you have multiple dietary restrictions. Let me connect you with our manager who can provide detailed information about our ingredients and preparation methods.",
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.reason, 'MULTIPLE_ALLERGIES')
    })
  )

  tests.push(
    await runTest('Non-allergy dietary preferences do not trigger transfer', async () => {
      const transcript = "Do you have any vegetarian options on the menu?"

      const detectedKeywords = detectKeywords(transcript, ALLERGY_KEYWORDS)
      assertEqual(detectedKeywords.length, 0, 'Expected no allergy keywords')

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15551234570',
          detectedKeywords: [],
        },
        {
          success: true,
          data: {
            shouldTransfer: false,
            reason: 'DIETARY_PREFERENCE',
          },
        }
      )

      assertFalse(result.shouldTransfer, 'Expected no transfer for simple preference')
    })
  )

  // -------------------------------------------------------------------------
  // Test 2: Large party triggers transfer
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Party of 6 triggers transfer (at threshold)', async () => {
      const partySize = 6

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: "I'd like to make a reservation for 6 people",
          customerPhone: '+15552223333',
          partySize,
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'LARGE_PARTY',
            priority: 'normal',
            transferScript: "For parties of 6 or more, I'd like to connect you with our reservations manager who can discuss seating arrangements and any special accommodations.",
            createCallback: true,
          },
        }
      )

      assertTrue(result.shouldTransfer, 'Expected transfer for party of 6')
      assertEqual(result.reason, 'LARGE_PARTY')
    })
  )

  tests.push(
    await runTest('Party of 10+ triggers high priority transfer', async () => {
      const partySize = 10

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: "We have a group of 10 for a birthday dinner",
          customerPhone: '+15552223334',
          partySize,
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'VERY_LARGE_PARTY',
            priority: 'high',
            transferScript: "For a group of 10, we'll want to ensure we can accommodate you properly. Let me connect you with our events coordinator.",
            createCallback: true,
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.priority, 'high')
    })
  )

  tests.push(
    await runTest('Party of 4 does not trigger transfer', async () => {
      const partySize = 4

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: "Table for 4 please",
          customerPhone: '+15552223335',
          partySize,
        },
        {
          success: true,
          data: {
            shouldTransfer: false,
          },
        }
      )

      assertFalse(result.shouldTransfer, 'Expected no transfer for party of 4')
    })
  )

  // -------------------------------------------------------------------------
  // Test 3: Callback created with correct priority
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Callback created with urgent priority for allergy', async () => {
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15553334444',
        customer_name: 'Allergy Callback Customer',
        reason: 'ALLERGY_SAFETY: Customer has severe peanut allergy, needs to discuss kitchen protocols',
        priority: 'urgent',
        status: 'pending',
      })

      // Verify in database
      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.priority, 'urgent')
      assertContains(dbCallback.reason, 'ALLERGY_SAFETY')
    })
  )

  tests.push(
    await runTest('Callback created with high priority for large party', async () => {
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15553334445',
        customer_name: 'Large Party Customer',
        reason: 'LARGE_PARTY: Party of 12 for corporate event, needs private room discussion',
        priority: 'high',
        status: 'pending',
      })

      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.priority, 'high')
      assertContains(dbCallback.reason, 'LARGE_PARTY')
    })
  )

  tests.push(
    await runTest('Callback created with normal priority for general inquiry', async () => {
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15553334446',
        customer_name: 'General Inquiry Customer',
        reason: 'GENERAL_INQUIRY: Customer has questions about private dining options',
        priority: 'normal',
        status: 'pending',
      })

      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.priority, 'normal')
    })
  )

  // -------------------------------------------------------------------------
  // Test 4: Transfer reason logged
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Transfer reason logged in call record', async () => {
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15554445555',
        status: 'completed',
        outcome: 'transfer',
        summary: 'Call transferred to manager. Reason: ALLERGY_SAFETY - Customer mentioned severe shellfish allergy',
        transcript: 'Customer: I have a severe shellfish allergy. Agent: I understand, let me connect you with our manager...',
      })

      const { data: dbCallLog } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callLog.id)
        .single()

      assertDefined(dbCallLog)
      assertEqual(dbCallLog.outcome, 'transfer')
      assertContains(dbCallLog.summary || '', 'ALLERGY_SAFETY')
    })
  )

  tests.push(
    await runTest('Large party transfer reason logged correctly', async () => {
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15554445556',
        status: 'completed',
        outcome: 'transfer',
        summary: 'Call transferred to reservations manager. Reason: LARGE_PARTY - Party of 15 for wedding rehearsal dinner',
      })

      const { data: dbCallLog } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callLog.id)
        .single()

      assertDefined(dbCallLog)
      assertContains(dbCallLog.summary || '', 'LARGE_PARTY')
      assertContains(dbCallLog.summary || '', '15')
    })
  )

  // -------------------------------------------------------------------------
  // Test 5: Transfer script generation
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Transfer script appropriate for allergy situation', async () => {
      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: "My daughter is allergic to dairy",
          customerPhone: '+15555556666',
          detectedKeywords: ['allergic'],
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'ALLERGY_SAFETY',
            priority: 'urgent',
            transferScript: "I want to make sure your daughter can dine safely with us. Let me connect you with our kitchen manager who can discuss our dairy-free options and preparation procedures.",
          },
        }
      )

      assertDefined(result.transferScript)
      assertContains(result.transferScript!, 'safely')
    })
  )

  tests.push(
    await runTest('Transfer script appropriate for private event inquiry', async () => {
      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: "We're looking to host a private event for about 30 people",
          customerPhone: '+15555556667',
          partySize: 30,
          context: { eventType: 'private_event' },
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'PRIVATE_EVENT',
            priority: 'high',
            transferScript: "For private events, our events coordinator can help you plan the perfect gathering. Let me transfer you to discuss menu options, timing, and any special arrangements.",
          },
        }
      )

      assertDefined(result.transferScript)
      assertContains(result.transferScript!, 'events coordinator')
    })
  )

  // -------------------------------------------------------------------------
  // Test 6: Edge cases
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Gluten-free mentioned as preference vs allergy', async () => {
      // Just a preference
      const preferenceTranscript = "Do you have gluten-free pasta?"
      const preferenceResult = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: preferenceTranscript,
          customerPhone: '+15556667777',
          detectedKeywords: ['gluten free'],
        },
        {
          success: true,
          data: {
            shouldTransfer: false,
            reason: 'DIETARY_PREFERENCE',
          },
        }
      )

      assertFalse(preferenceResult.shouldTransfer, 'Simple gluten-free preference should not transfer')

      // Celiac disease (medical condition)
      const celiacTranscript = "I have celiac disease and cannot have any gluten"
      const celiacResult = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript: celiacTranscript,
          customerPhone: '+15556667778',
          detectedKeywords: ['celiac', 'gluten'],
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'MEDICAL_DIETARY',
            priority: 'urgent',
            transferScript: "Since you have celiac disease, I want to ensure our kitchen can properly accommodate you. Let me connect you with our manager.",
          },
        }
      )

      assertTrue(celiacResult.shouldTransfer, 'Celiac disease should trigger transfer')
    })
  )

  tests.push(
    await runTest('Complaint triggers transfer', async () => {
      const transcript = "I want to speak to a manager about my experience last night"

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15556667779',
          context: { sentiment: 'negative', isComplaint: true },
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'COMPLAINT',
            priority: 'high',
            transferScript: "I'm sorry to hear you had a less than perfect experience. Let me connect you with our manager who can address your concerns directly.",
            createCallback: true,
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.reason, 'COMPLAINT')
    })
  )

  tests.push(
    await runTest('Business inquiry triggers transfer', async () => {
      const transcript = "I'm a vendor and would like to discuss a business opportunity"

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15556667780',
          context: { isBusinessInquiry: true },
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'BUSINESS_INQUIRY',
            priority: 'low',
            transferScript: "For business inquiries, let me connect you with the appropriate person.",
            createCallback: true,
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.priority, 'low')
    })
  )

  // -------------------------------------------------------------------------
  // Test 7: Combined triggers
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Large party with allergy gets highest priority', async () => {
      const transcript = "We have a group of 8 and two of us have severe nut allergies"

      const result = await checkTransferDecision(
        {
          restaurantId: testRestaurant.id,
          callId: generateTestId('call'),
          transcript,
          customerPhone: '+15557778888',
          partySize: 8,
          detectedKeywords: ['severe', 'nut allergies'],
        },
        {
          success: true,
          data: {
            shouldTransfer: true,
            reason: 'LARGE_PARTY_WITH_ALLERGY',
            priority: 'urgent', // Allergy takes precedence
            transferScript: "For a large party with allergy concerns, I'll connect you with our manager to ensure we can accommodate everyone safely.",
            createCallback: true,
          },
        }
      )

      assertTrue(result.shouldTransfer)
      assertEqual(result.priority, 'urgent')
      assertContains(result.reason || '', 'ALLERGY')
    })
  )

  // -------------------------------------------------------------------------
  // Test 8: Transfer tracking
  // -------------------------------------------------------------------------
  tests.push(
    await runTest('Transfer attempt tracked even if failed', async () => {
      const callLog = await createTestCallLog(testRestaurant.id, {
        caller_phone: '+15558889999',
        status: 'completed',
        outcome: 'callback_requested',
        summary: 'Transfer attempted but failed (no answer). Callback created. Reason: LARGE_PARTY',
      })

      // Create callback for failed transfer
      const callback = await createTestCallback(testRestaurant.id, {
        customer_phone: '+15558889999',
        reason: 'FAILED_TRANSFER: Large party inquiry, transfer to manager failed',
        priority: 'high',
        call_log_id: callLog.id,
      })

      // Verify both are linked
      const { data: dbCallback } = await supabase
        .from('callbacks')
        .select('*, call_logs(*)')
        .eq('id', callback.id)
        .single()

      assertDefined(dbCallback)
      assertEqual(dbCallback.call_log_id, callLog.id)
      assertContains(dbCallback.reason, 'FAILED_TRANSFER')
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
    name: 'Transfer Flow Tests',
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
  runTransferFlowTests()
    .then((result) => {
      process.exit(result.failed > 0 ? 1 : 0)
    })
    .catch((error) => {
      console.error('Test suite failed:', error)
      process.exit(1)
    })
}
