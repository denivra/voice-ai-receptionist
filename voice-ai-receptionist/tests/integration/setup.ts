/**
 * Test Environment Setup
 *
 * Configures test environment, database connections, and mock services
 * for integration testing of the Voice AI Receptionist system.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Configuration
// ============================================================================

export interface TestConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  n8nWebhookBaseUrl: string
  vapiApiKey?: string
  testRestaurantId: string
  testPhoneNumber: string
  enableE2E: boolean
}

function loadConfig(): TestConfig {
  const config: TestConfig = {
    supabaseUrl: process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    n8nWebhookBaseUrl: process.env.TEST_N8N_WEBHOOK_URL || process.env.N8N_WEBHOOK_BASE_URL || 'http://localhost:5678/webhook-test',
    vapiApiKey: process.env.TEST_VAPI_API_KEY || process.env.VAPI_API_KEY,
    testRestaurantId: process.env.TEST_RESTAURANT_ID || 'test-restaurant-001',
    testPhoneNumber: process.env.TEST_PHONE_NUMBER || '+15551234567',
    enableE2E: process.env.ENABLE_E2E_TESTS === 'true',
  }

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }

  return config
}

export const config = loadConfig()

// ============================================================================
// Database Client
// ============================================================================

let supabaseClient: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return supabaseClient
}

// ============================================================================
// Test Data Factory
// ============================================================================

export interface TestRestaurant {
  id: string
  name: string
  phone: string
  timezone: string
  business_hours: Record<string, unknown>
  settings: Record<string, unknown>
}

export interface TestReservation {
  id: string
  restaurant_id: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  party_size: number
  reservation_time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
  seating_preference?: 'indoor' | 'outdoor' | 'bar' | 'any'
  special_requests?: string
  confirmation_code: string
}

export interface TestCallback {
  id: string
  restaurant_id: string
  customer_name: string
  customer_phone: string
  reason: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  call_log_id?: string
}

export interface TestCallLog {
  id: string
  restaurant_id: string
  vapi_call_id: string
  caller_phone: string
  status: 'in_progress' | 'completed' | 'failed'
  outcome?: 'booking_made' | 'callback_requested' | 'transfer' | 'info_provided' | 'failed'
  duration_seconds?: number
  transcript?: string
  summary?: string
}

// Generate unique IDs for tests
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Generate confirmation code
export function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// Create test restaurant
export async function createTestRestaurant(overrides: Partial<TestRestaurant> = {}): Promise<TestRestaurant> {
  const supabase = getSupabase()

  const restaurant: Omit<TestRestaurant, 'id'> & { id?: string } = {
    id: overrides.id || generateTestId('rest'),
    name: overrides.name || 'Test Restaurant',
    phone: overrides.phone || '+15559876543',
    timezone: overrides.timezone || 'America/New_York',
    business_hours: overrides.business_hours || {
      monday: { isOpen: true, openTime: '11:00', closeTime: '22:00', lastSeating: '21:00' },
      tuesday: { isOpen: true, openTime: '11:00', closeTime: '22:00', lastSeating: '21:00' },
      wednesday: { isOpen: true, openTime: '11:00', closeTime: '22:00', lastSeating: '21:00' },
      thursday: { isOpen: true, openTime: '11:00', closeTime: '22:00', lastSeating: '21:00' },
      friday: { isOpen: true, openTime: '11:00', closeTime: '23:00', lastSeating: '22:00' },
      saturday: { isOpen: true, openTime: '10:00', closeTime: '23:00', lastSeating: '22:00' },
      sunday: { isOpen: true, openTime: '10:00', closeTime: '21:00', lastSeating: '20:00' },
    },
    settings: overrides.settings || {
      maxPartySize: 8,
      largePartyThreshold: 6,
      lastSeatingOffset: 60,
      confirmationSmsTemplate: 'Test confirmation for {customer_name}',
    },
  }

  const { data, error } = await supabase
    .from('restaurants')
    .insert(restaurant)
    .select()
    .single()

  if (error) throw new Error(`Failed to create test restaurant: ${error.message}`)

  return data as TestRestaurant
}

// Create test reservation
export async function createTestReservation(
  restaurantId: string,
  overrides: Partial<TestReservation> = {}
): Promise<TestReservation> {
  const supabase = getSupabase()

  // Default to tomorrow at 7 PM
  const defaultTime = new Date()
  defaultTime.setDate(defaultTime.getDate() + 1)
  defaultTime.setHours(19, 0, 0, 0)

  const reservation: Omit<TestReservation, 'id'> & { id?: string } = {
    id: overrides.id || generateTestId('res'),
    restaurant_id: restaurantId,
    customer_name: overrides.customer_name || 'Test Customer',
    customer_phone: overrides.customer_phone || '+15551234567',
    customer_email: overrides.customer_email,
    party_size: overrides.party_size || 2,
    reservation_time: overrides.reservation_time || defaultTime.toISOString(),
    status: overrides.status || 'confirmed',
    seating_preference: overrides.seating_preference || 'any',
    special_requests: overrides.special_requests,
    confirmation_code: overrides.confirmation_code || generateConfirmationCode(),
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert(reservation)
    .select()
    .single()

  if (error) throw new Error(`Failed to create test reservation: ${error.message}`)

  return data as TestReservation
}

// Create test callback
export async function createTestCallback(
  restaurantId: string,
  overrides: Partial<TestCallback> = {}
): Promise<TestCallback> {
  const supabase = getSupabase()

  const callback: Omit<TestCallback, 'id'> & { id?: string } = {
    id: overrides.id || generateTestId('cb'),
    restaurant_id: restaurantId,
    customer_name: overrides.customer_name || 'Test Customer',
    customer_phone: overrides.customer_phone || '+15551234567',
    reason: overrides.reason || 'Test callback reason',
    priority: overrides.priority || 'normal',
    status: overrides.status || 'pending',
    call_log_id: overrides.call_log_id,
  }

  const { data, error } = await supabase
    .from('callbacks')
    .insert(callback)
    .select()
    .single()

  if (error) throw new Error(`Failed to create test callback: ${error.message}`)

  return data as TestCallback
}

// Create test call log
export async function createTestCallLog(
  restaurantId: string,
  overrides: Partial<TestCallLog> = {}
): Promise<TestCallLog> {
  const supabase = getSupabase()

  const callLog: Omit<TestCallLog, 'id'> & { id?: string } = {
    id: overrides.id || generateTestId('call'),
    restaurant_id: restaurantId,
    vapi_call_id: overrides.vapi_call_id || generateTestId('vapi'),
    caller_phone: overrides.caller_phone || '+15551234567',
    status: overrides.status || 'completed',
    outcome: overrides.outcome,
    duration_seconds: overrides.duration_seconds,
    transcript: overrides.transcript,
    summary: overrides.summary,
  }

  const { data, error } = await supabase
    .from('call_logs')
    .insert(callLog)
    .select()
    .single()

  if (error) throw new Error(`Failed to create test call log: ${error.message}`)

  return data as TestCallLog
}

// ============================================================================
// Mock Services
// ============================================================================

export interface MockWebhookResponse {
  success: boolean
  data?: unknown
  error?: string
  delay?: number
}

// Mock n8n webhook caller
export async function callWebhook(
  endpoint: string,
  payload: Record<string, unknown>,
  mockResponse?: MockWebhookResponse
): Promise<unknown> {
  // If mock response provided, simulate it
  if (mockResponse) {
    if (mockResponse.delay) {
      await new Promise((resolve) => setTimeout(resolve, mockResponse.delay))
    }
    if (!mockResponse.success) {
      throw new Error(mockResponse.error || 'Mock webhook error')
    }
    return mockResponse.data
  }

  // Otherwise, make actual HTTP call
  const url = `${config.n8nWebhookBaseUrl}/${endpoint}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Webhook call failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

// Mock availability response
export function mockAvailabilityResponse(available: boolean, alternatives?: string[]): MockWebhookResponse {
  return {
    success: true,
    data: {
      available,
      alternatives: alternatives || [],
      message: available ? 'Slot is available' : 'Slot is not available',
    },
  }
}

// Mock booking response
export function mockBookingResponse(success: boolean, confirmationCode?: string): MockWebhookResponse {
  return {
    success: true,
    data: {
      success,
      confirmationCode: confirmationCode || generateConfirmationCode(),
      message: success ? 'Booking confirmed' : 'Booking failed',
    },
  }
}

// Mock SMS response
export function mockSmsResponse(success: boolean): MockWebhookResponse {
  return {
    success: true,
    data: {
      sent: success,
      messageId: success ? generateTestId('sms') : null,
    },
  }
}

// Mock Slack alert response
export function mockSlackResponse(success: boolean): MockWebhookResponse {
  return {
    success: true,
    data: {
      ok: success,
    },
  }
}

// ============================================================================
// Cleanup Functions
// ============================================================================

// Clean up test data by prefix
export async function cleanupTestData(prefix: string = 'test-'): Promise<void> {
  const supabase = getSupabase()

  // Clean up in order of dependencies
  const tables = ['call_logs', 'callbacks', 'reservations', 'restaurants']

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .like('id', `${prefix}%`)

    if (error) {
      console.warn(`Warning: Failed to cleanup ${table}: ${error.message}`)
    }
  }
}

// Clean up specific restaurant and all related data
export async function cleanupRestaurant(restaurantId: string): Promise<void> {
  const supabase = getSupabase()

  // Delete in order of dependencies
  await supabase.from('call_logs').delete().eq('restaurant_id', restaurantId)
  await supabase.from('callbacks').delete().eq('restaurant_id', restaurantId)
  await supabase.from('reservations').delete().eq('restaurant_id', restaurantId)
  await supabase.from('restaurants').delete().eq('id', restaurantId)
}

// ============================================================================
// Test Utilities
// ============================================================================

export interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
}

export interface TestSuiteResult {
  name: string
  tests: TestResult[]
  passed: number
  failed: number
  duration: number
}

// Test runner helper
export async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now()

  try {
    await fn()
    return {
      name,
      passed: true,
      duration: Date.now() - start,
    }
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Assertion helpers
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message || 'Expected true, got false')
  }
}

export function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message || 'Expected false, got true')
  }
}

export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined')
  }
}

export function assertContains(str: string, substring: string, message?: string): void {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected "${str}" to contain "${substring}"`)
  }
}

export function assertArrayLength<T>(arr: T[], length: number, message?: string): void {
  if (arr.length !== length) {
    throw new Error(message || `Expected array length ${length}, got ${arr.length}`)
  }
}

export function assertGreaterThan(actual: number, expected: number, message?: string): void {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} to be greater than ${expected}`)
  }
}

// Wait for condition with timeout
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`)
}

// Print test results
export function printTestResults(suite: TestSuiteResult): void {
  console.log('\n' + '='.repeat(60))
  console.log(`Test Suite: ${suite.name}`)
  console.log('='.repeat(60))

  for (const test of suite.tests) {
    const status = test.passed ? '✓' : '✗'
    const color = test.passed ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(`${color}${status}${reset} ${test.name} (${test.duration}ms)`)

    if (!test.passed && test.error) {
      console.log(`  └─ Error: ${test.error}`)
    }
  }

  console.log('-'.repeat(60))
  console.log(`Passed: ${suite.passed}/${suite.tests.length} | Duration: ${suite.duration}ms`)
  console.log('='.repeat(60) + '\n')
}

// ============================================================================
// Setup and Teardown
// ============================================================================

let testRestaurant: TestRestaurant | null = null

export async function setupTestEnvironment(): Promise<TestRestaurant> {
  console.log('Setting up test environment...')

  // Clean up any leftover test data
  await cleanupTestData()

  // Create a test restaurant
  testRestaurant = await createTestRestaurant({
    id: config.testRestaurantId,
    name: 'Integration Test Restaurant',
  })

  console.log(`Created test restaurant: ${testRestaurant.id}`)

  return testRestaurant
}

export async function teardownTestEnvironment(): Promise<void> {
  console.log('Tearing down test environment...')

  if (testRestaurant) {
    await cleanupRestaurant(testRestaurant.id)
    testRestaurant = null
  }

  // Clean up any other test data
  await cleanupTestData()

  console.log('Test environment cleaned up')
}

export function getTestRestaurant(): TestRestaurant {
  if (!testRestaurant) {
    throw new Error('Test environment not set up. Call setupTestEnvironment() first.')
  }
  return testRestaurant
}
