# Integration Tests

Integration tests for the Voice AI Receptionist system. These tests verify the complete flow of the system including availability checking, booking creation, error handling, and transfer flows.

## Test Scenarios

Based on Section 7.1 of the Restaurant AI Automation Master Guide:

| Scenario | Expected Behavior | Pass Criteria |
|----------|-------------------|---------------|
| Happy path: Book for 2, Friday 7pm | Complete booking, SMS sent | Booking in CRM, SMS received < 30s |
| Slot unavailable | Offer 2-3 alternatives | Alternatives within ±2 hours offered |
| Nut allergy mentioned | Immediate transfer to manager | Transfer < 5s, safety log created |
| CRM timeout (5+ seconds) | Graceful fallback, take callback | Callback task created, no hang-up |
| Party of 12 | Transfer to events coordinator | Large party queue, deposit mentioned |
| Invalid phone (123) | Re-prompt up to 3x | Offers email alternative after 3 fails |

## Prerequisites

1. **Supabase Project**: Either a test Supabase project or local Supabase instance
2. **Environment Variables**: Set up the required environment variables
3. **Node.js 18+**: Required for running TypeScript tests

## Setup

```bash
cd tests/integration
npm install
```

## Environment Variables

Create a `.env` file or export these variables:

```bash
# Required
export TEST_SUPABASE_URL="https://your-test-project.supabase.co"
export TEST_SUPABASE_SERVICE_KEY="your-service-role-key"

# Optional
export TEST_N8N_WEBHOOK_URL="http://localhost:5678/webhook-test"
export TEST_RESTAURANT_ID="test-restaurant-001"
export TEST_PHONE_NUMBER="+15551234567"
export ENABLE_E2E_TESTS="false"  # Set to "true" for Vapi E2E tests
```

## Running Tests

### Run All Tests
```bash
npm test
# or
npx ts-node run-all.ts
```

### Run Specific Test Suite
```bash
# Availability tests
npm run test:availability

# Booking flow tests
npm run test:booking

# Error handling tests
npm run test:error

# Transfer flow tests
npm run test:transfer
```

### Output Formats
```bash
# Console output (default)
npm test

# JUnit XML output (for CI integration)
npm run test:junit > results.xml
```

## Test Suites

### 1. Availability Tests (`test-check-availability.ts`)
Tests the availability checking webhook:
- Available slot returns correctly
- Unavailable slot returns alternatives
- Party size limits respected (within/at/exceeds limit)
- Seating preference filtering (indoor/outdoor/bar/any)
- Availability override handling (closed days, extra capacity, modified hours)
- Edge cases (same-day, far future, single diner)

### 2. Booking Flow Tests (`test-booking-flow.ts`)
Tests the complete booking flow:
- Happy path: check → book → confirm
- Race condition: slot taken between check and book
- SMS confirmation sent
- Booking appears in database with correct data
- Call record updated with outcome
- Booking modifications (cancel, update party size)
- Duplicate booking prevention
- Confirmation code uniqueness

### 3. Error Handling Tests (`test-error-handling.ts`)
Tests error scenarios and recovery:
- CRM timeout (5+ second delay)
- Graceful fallback response
- Callback created on error with context
- Slack alert sent on critical error
- Database connection error handling
- Invalid restaurant ID handling
- Rate limiting handling
- Error recovery after transient errors
- Error threshold alerts

### 4. Transfer Flow Tests (`test-transfer-flows.ts`)
Tests safety transfer scenarios:
- Allergy keyword triggers (allergy, epipen, celiac)
- Multiple allergy keywords increase urgency
- Large party triggers (6+ guests)
- Callback created with correct priority
- Transfer reason logged in call record
- Transfer script generation
- Edge cases (preferences vs allergies)
- Combined triggers (large party with allergy)

## Test Phone Numbers

| Number | Behavior |
|--------|----------|
| `+15550001111` | Always available |
| `+15550002222` | Always unavailable |
| `+15550003333` | Returns timeout error |
| `+15550004444` | Triggers transfer |

## Test Data Management

### Automatic Cleanup
Tests automatically clean up their data:
- Before running (removes leftover data from previous runs)
- After running (removes all test data created during the run)

### Manual Cleanup
If needed, test data uses identifiable prefixes:
- Restaurant IDs: `test-rest-*`
- Reservation IDs: `test-res-*`
- Callback IDs: `test-cb-*`
- Call Log IDs: `test-call-*`

## Mock vs Real Services

### Mock Mode (Default)
Tests use mock responses for external services:
- n8n webhooks return mocked data
- No actual SMS sent
- No actual Slack alerts
- Database operations are real (use test database)

### E2E Mode (Optional)
Set `ENABLE_E2E_TESTS=true` for end-to-end tests:
- Actually calls Vapi API
- Actually triggers n8n webhooks
- Requires full system to be running

## Writing New Tests

### Test Structure
```typescript
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  runTest,
  printTestResults,
  assertTrue,
  assertEqual,
  // ... other utilities
} from './setup'

export async function runMyTests(): Promise<TestSuiteResult> {
  const tests: TestResult[] = []

  // Setup
  const testRestaurant = await setupTestEnvironment()

  // Add tests
  tests.push(
    await runTest('My test name', async () => {
      // Test implementation
      assertTrue(someCondition, 'Expected condition to be true')
    })
  )

  // Teardown
  await teardownTestEnvironment()

  // Return results
  return {
    name: 'My Test Suite',
    tests,
    passed: tests.filter(t => t.passed).length,
    failed: tests.filter(t => !t.passed).length,
    duration: totalDuration,
  }
}
```

### Available Assertions
- `assertEqual(actual, expected, message?)` - Strict equality
- `assertDeepEqual(actual, expected, message?)` - Deep equality (JSON compare)
- `assertTrue(value, message?)` - Value is true
- `assertFalse(value, message?)` - Value is false
- `assertDefined(value, message?)` - Value is not null/undefined
- `assertContains(str, substring, message?)` - String contains substring
- `assertArrayLength(arr, length, message?)` - Array has expected length
- `assertGreaterThan(actual, expected, message?)` - Numeric comparison

### Test Data Factories
```typescript
// Create test restaurant
const restaurant = await createTestRestaurant({
  name: 'Custom Name',
  // ... overrides
})

// Create test reservation
const reservation = await createTestReservation(restaurantId, {
  party_size: 4,
  // ... overrides
})

// Create test callback
const callback = await createTestCallback(restaurantId, {
  priority: 'urgent',
  // ... overrides
})

// Create test call log
const callLog = await createTestCallLog(restaurantId, {
  outcome: 'booking_made',
  // ... overrides
})
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Integration Tests
  env:
    TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
    TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
  run: |
    cd tests/integration
    npm install
    npm run test:junit > results.xml

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: tests/integration/results.xml
```

## Troubleshooting

### Tests Failing to Connect
- Verify Supabase URL and service key are correct
- Check if test database tables exist
- Ensure network connectivity

### Cleanup Not Working
- Some test data may remain if tests crash
- Run manual cleanup: `npx ts-node -e "require('./setup').cleanupTestData()"`

### Mock Responses Not Working
- Ensure mock responses match expected interface
- Check for typos in response structure
