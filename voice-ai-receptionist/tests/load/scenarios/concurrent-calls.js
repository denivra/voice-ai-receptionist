/**
 * Concurrent Calls Load Test
 *
 * Simulates concurrent call handling to test system capacity.
 * Each virtual user simulates a complete call flow:
 *   1. Check availability
 *   2. Create booking (if available)
 *
 * Targets:
 *   - Ramp up to 50 concurrent "calls"
 *   - Response time p95 < 2 seconds
 *   - Error rate < 1%
 *
 * Run:
 *   k6 run scenarios/concurrent-calls.js
 *   k6 run --vus 25 --duration 2m scenarios/concurrent-calls.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import {
  config,
  endpoints,
  headers,
  thresholds,
  stages,
  tomorrowDate,
  randomTimeSlot,
  randomPartySize,
  randomSeatingPreference,
  randomCustomerName,
  randomPhone,
  checkAvailabilityPayload,
  createBookingPayload,
  isValidAvailabilityResponse,
  isSuccessResponse,
  logConfig,
} from '../k6-config.js';

// ============================================================================
// Test Configuration
// ============================================================================

export const options = {
  stages: stages.concurrentCalls,

  thresholds: {
    // Response time thresholds
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],

    // Error rate threshold
    http_req_failed: ['rate<0.01'],

    // Custom check thresholds
    checks: ['rate>0.99'],

    // Custom metrics thresholds
    availability_check_success: ['rate>0.99'],
    booking_success: ['rate>0.95'],
  },

  // Tags for result filtering
  tags: {
    testType: 'concurrent-calls',
    environment: __ENV.ENVIRONMENT || 'staging',
  },
};

// ============================================================================
// Custom Metrics
// ============================================================================

const availabilityCheckDuration = new Trend('availability_check_duration');
const availabilityCheckSuccess = new Rate('availability_check_success');
const bookingDuration = new Trend('booking_duration');
const bookingSuccess = new Rate('booking_success');
const callFlowDuration = new Trend('call_flow_duration');
const errors = new Counter('errors');

// ============================================================================
// Setup (runs once before test)
// ============================================================================

export function setup() {
  logConfig();

  console.log('\n--- Concurrent Calls Test ---');
  console.log('Simulating 50 concurrent calls with check → book flow');
  console.log('Target: p95 < 2s, error rate < 1%\n');

  // Verify endpoint is reachable
  const healthCheck = http.get(endpoints.healthCheck || endpoints.vapiWebhook, {
    timeout: '10s',
  });

  if (healthCheck.status !== 200 && healthCheck.status !== 404) {
    console.warn(`Warning: Health check returned status ${healthCheck.status}`);
  }

  return {
    startTime: new Date().toISOString(),
    testDate: tomorrowDate(),
  };
}

// ============================================================================
// Main Test Function (runs for each VU iteration)
// ============================================================================

export default function (data) {
  const callStartTime = new Date().getTime();

  // Generate test data for this call
  const testDate = data.testDate;
  const testTime = randomTimeSlot();
  const partySize = randomPartySize();
  const seatingPreference = randomSeatingPreference();
  const customerName = randomCustomerName();
  const customerPhone = randomPhone();

  let availabilityResult = null;
  let bookingResult = null;

  // -------------------------------------------------------------------------
  // Step 1: Check Availability
  // -------------------------------------------------------------------------
  group('check_availability', function () {
    const payload = JSON.stringify(
      checkAvailabilityPayload(testDate, testTime, partySize, seatingPreference)
    );

    const startTime = new Date().getTime();

    const response = http.post(endpoints.vapiWebhook, payload, {
      headers: headers,
      timeout: '30s',
      tags: { name: 'check_availability' },
    });

    const duration = new Date().getTime() - startTime;
    availabilityCheckDuration.add(duration);

    const checkPassed = check(response, {
      'availability check status 200': (r) => r.status === 200,
      'availability check has results': (r) => isValidAvailabilityResponse(r),
      'availability check response time < 2s': (r) => r.timings.duration < 2000,
    });

    availabilityCheckSuccess.add(checkPassed ? 1 : 0);

    if (!checkPassed) {
      errors.add(1);
      console.log(`Availability check failed: ${response.status} - ${response.body}`);
    }

    // Parse result for booking decision
    try {
      const body = JSON.parse(response.body);
      if (body.results && body.results[0]) {
        availabilityResult = body.results[0].result;
      }
    } catch (e) {
      console.log(`Failed to parse availability response: ${e.message}`);
    }
  });

  // Small pause between availability check and booking
  sleep(0.5);

  // -------------------------------------------------------------------------
  // Step 2: Create Booking (if availability check succeeded)
  // -------------------------------------------------------------------------
  if (availabilityResult && !availabilityResult.toLowerCase().includes('error')) {
    group('create_booking', function () {
      const payload = JSON.stringify(
        createBookingPayload(testDate, testTime, partySize, customerName, customerPhone)
      );

      const startTime = new Date().getTime();

      const response = http.post(endpoints.vapiWebhook, payload, {
        headers: headers,
        timeout: '30s',
        tags: { name: 'create_booking' },
      });

      const duration = new Date().getTime() - startTime;
      bookingDuration.add(duration);

      const checkPassed = check(response, {
        'booking status 200': (r) => r.status === 200,
        'booking has results': (r) => isSuccessResponse(r) || r.body.includes('not available'),
        'booking response time < 2s': (r) => r.timings.duration < 2000,
      });

      // Check for actual success (not just valid response)
      const isActualSuccess = isSuccessResponse(response);
      bookingSuccess.add(isActualSuccess ? 1 : 0);

      if (!checkPassed) {
        errors.add(1);
        console.log(`Booking failed: ${response.status} - ${response.body}`);
      }

      // Parse result
      try {
        const body = JSON.parse(response.body);
        if (body.results && body.results[0]) {
          bookingResult = body.results[0].result;
        }
      } catch (e) {
        console.log(`Failed to parse booking response: ${e.message}`);
      }
    });
  }

  // Track total call flow duration
  const callEndTime = new Date().getTime();
  callFlowDuration.add(callEndTime - callStartTime);

  // Think time between calls (simulates real call gaps)
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// ============================================================================
// Teardown (runs once after test)
// ============================================================================

export function teardown(data) {
  console.log('\n--- Test Complete ---');
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
  console.log('\nCheck k6 output above for detailed metrics.');
}

// ============================================================================
// Custom Summary Handler
// ============================================================================

export function handleSummary(data) {
  const passed = data.metrics.checks && data.metrics.checks.values.rate >= 0.99;
  const p95 = data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(95)'];
  const errorRate = data.metrics.http_req_failed && data.metrics.http_req_failed.values.rate;

  const summary = {
    testName: 'Concurrent Calls',
    passed: passed && p95 < 2000 && errorRate < 0.01,
    metrics: {
      p95ResponseTime: p95 ? `${p95.toFixed(0)}ms` : 'N/A',
      errorRate: errorRate ? `${(errorRate * 100).toFixed(2)}%` : 'N/A',
      checksPassRate: data.metrics.checks ? `${(data.metrics.checks.values.rate * 100).toFixed(2)}%` : 'N/A',
      totalRequests: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    },
    thresholds: {
      p95Under2s: p95 < 2000,
      errorRateUnder1Percent: errorRate < 0.01,
      checksOver99Percent: data.metrics.checks ? data.metrics.checks.values.rate >= 0.99 : false,
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('CONCURRENT CALLS TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Result: ${summary.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`p95 Response Time: ${summary.metrics.p95ResponseTime} (target: <2000ms)`);
  console.log(`Error Rate: ${summary.metrics.errorRate} (target: <1%)`);
  console.log(`Checks Pass Rate: ${summary.metrics.checksPassRate} (target: >99%)`);
  console.log(`Total Requests: ${summary.metrics.totalRequests}`);
  console.log('='.repeat(60) + '\n');

  return {
    stdout: JSON.stringify(summary, null, 2),
  };
}
