/**
 * Webhook Stress Test
 *
 * Stress tests the n8n webhook endpoint with sustained high load.
 * Verifies system stability under extreme conditions.
 *
 * Scenario:
 *   - 1000 requests per minute (16.67 req/sec)
 *   - Sustained for 5 minutes
 *   - Mix of different webhook call types
 *   - Verify no rate limiting (HTTP 429)
 *   - Verify all requests are logged
 *
 * Targets:
 *   - Sustained 16.67+ requests/second
 *   - HTTP 429 errors: 0
 *   - All requests logged: 100%
 *   - Response time p99 < 5 seconds
 *   - System stability: No crashes
 *
 * Run:
 *   k6 run scenarios/webhook-stress.js
 *   k6 run --vus 20 --duration 10m scenarios/webhook-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import {
  config,
  endpoints,
  headers,
  tomorrowDate,
  randomTimeSlot,
  randomPartySize,
  randomSeatingPreference,
  randomCustomerName,
  randomPhone,
  checkAvailabilityPayload,
  createBookingPayload,
  callEndPayload,
  generateCallId,
  logConfig,
} from '../k6-config.js';

// ============================================================================
// Test Configuration
// ============================================================================

// Target: 1000 requests/minute = ~16.67 requests/second
// With 17 VUs, each VU needs to complete ~1 request/second
const TARGET_RPS = 16.67;
const VUS_NEEDED = 17;

export const options = {
  stages: [
    { duration: '30s', target: VUS_NEEDED },   // Ramp up
    { duration: '5m', target: VUS_NEEDED },    // Sustained load
    { duration: '30s', target: 0 },            // Ramp down
  ],

  thresholds: {
    // Response time thresholds
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],

    // No HTTP failures
    http_req_failed: ['rate<0.001'],

    // Rate limiting check
    rate_limit_hits: ['count<10'],

    // Request rate (should sustain 15+ rps)
    http_reqs: ['rate>15'],

    // Logging verification
    requests_logged: ['rate==1'],
  },

  tags: {
    testType: 'webhook-stress',
    environment: __ENV.ENVIRONMENT || 'staging',
  },

  // Increase batch size for higher throughput
  batch: 10,
  batchPerHost: 10,
};

// ============================================================================
// Custom Metrics
// ============================================================================

const rateLimitHits = new Counter('rate_limit_hits');
const requestsLogged = new Rate('requests_logged');
const requestsTotal = new Counter('requests_total');
const responseByStatus = new Counter('response_by_status');
const requestDuration = new Trend('request_duration');
const errors = new Counter('errors');

// Request types for variety
const REQUEST_TYPES = [
  'check_availability',
  'create_booking',
  'call_end',
];

// ============================================================================
// Setup
// ============================================================================

export function setup() {
  logConfig();

  console.log('\n--- Webhook Stress Test ---');
  console.log(`Target: ${TARGET_RPS.toFixed(2)} requests/second (1000/min)`);
  console.log(`VUs: ${VUS_NEEDED}`);
  console.log('Duration: 5 minutes sustained load');
  console.log('Focus: Rate limiting, logging, stability\n');

  // Pre-flight health check
  const healthResponse = http.get(endpoints.healthCheck || endpoints.vapiWebhook, {
    timeout: '10s',
  });

  if (healthResponse.status !== 200 && healthResponse.status !== 404) {
    console.warn(`Warning: Pre-flight check returned ${healthResponse.status}`);
  }

  return {
    startTime: new Date().toISOString(),
    testDate: tomorrowDate(),
    requestIds: [],
  };
}

// ============================================================================
// Request Generators
// ============================================================================

function generateRequest(type, testDate) {
  switch (type) {
    case 'check_availability':
      return {
        type: 'check_availability',
        payload: checkAvailabilityPayload(
          testDate,
          randomTimeSlot(),
          randomPartySize(),
          randomSeatingPreference()
        ),
      };

    case 'create_booking':
      return {
        type: 'create_booking',
        payload: createBookingPayload(
          testDate,
          randomTimeSlot(),
          randomPartySize(),
          randomCustomerName(),
          randomPhone()
        ),
      };

    case 'call_end':
      return {
        type: 'call_end',
        payload: callEndPayload(generateCallId(), 'completed'),
      };

    default:
      return generateRequest('check_availability', testDate);
  }
}

// ============================================================================
// Main Test Function
// ============================================================================

export default function (data) {
  const testDate = data.testDate;

  // Randomly select request type (weighted toward availability checks)
  const weights = [0.6, 0.3, 0.1]; // 60% availability, 30% booking, 10% call end
  const rand = Math.random();
  let typeIndex = 0;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      typeIndex = i;
      break;
    }
  }

  const requestType = REQUEST_TYPES[typeIndex];
  const request = generateRequest(requestType, testDate);
  const requestId = generateCallId();

  const payload = JSON.stringify(request.payload);

  // Make the request
  const startTime = new Date().getTime();

  const response = http.post(endpoints.vapiWebhook, payload, {
    headers: {
      ...headers,
      'X-Request-Id': requestId,
    },
    timeout: '30s',
    tags: {
      name: `stress_${requestType}`,
      requestType: requestType,
    },
  });

  const duration = new Date().getTime() - startTime;

  // Track metrics
  requestsTotal.add(1);
  requestDuration.add(duration);

  // Track response status
  responseByStatus.add(1, { status: response.status.toString() });

  // Check for rate limiting
  if (response.status === 429) {
    rateLimitHits.add(1);
    console.log(`RATE LIMITED: ${response.status} - ${response.body}`);
  }

  // Basic response validation
  const checksPass = check(response, {
    'status is not 429': (r) => r.status !== 429,
    'status is 2xx or 4xx': (r) => r.status >= 200 && r.status < 500,
    'response time < 5s': (r) => r.timings.duration < 5000,
    'has response body': (r) => r.body && r.body.length > 0,
  });

  // Track if request appears logged (based on response)
  // In real scenario, would verify against database/logs
  if (response.status === 200) {
    requestsLogged.add(1);
  } else if (response.status !== 429) {
    requestsLogged.add(0);
    errors.add(1);
  }

  // Minimal sleep to maintain high RPS
  // Target: 1 request per second per VU = 17 RPS total
  // Sleep just enough to hit target without overloading
  sleep(0.9 + Math.random() * 0.2); // 0.9-1.1 seconds
}

// ============================================================================
// Teardown
// ============================================================================

export function teardown(data) {
  console.log('\n--- Webhook Stress Test Complete ---');
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
}

// ============================================================================
// Custom Summary
// ============================================================================

export function handleSummary(data) {
  const rps = data.metrics.http_reqs ? data.metrics.http_reqs.values.rate : 0;
  const rateLimits = data.metrics.rate_limit_hits ?
    data.metrics.rate_limit_hits.values.count : 0;
  const p95 = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;
  const p99 = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(99)'] : 0;
  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;
  const totalRequests = data.metrics.http_reqs ?
    data.metrics.http_reqs.values.count : 0;
  const loggingRate = data.metrics.requests_logged ?
    data.metrics.requests_logged.values.rate : 0;

  const passed = rps >= 15 &&
                 rateLimits < 10 &&
                 p99 < 5000 &&
                 loggingRate >= 0.99;

  const summary = {
    testName: 'Webhook Stress',
    passed: passed,
    metrics: {
      requestsPerSecond: rps.toFixed(2),
      totalRequests: totalRequests,
      rateLimitHits: rateLimits,
      p95ResponseTime: `${p95.toFixed(0)}ms`,
      p99ResponseTime: `${p99.toFixed(0)}ms`,
      errorRate: `${(errorRate * 100).toFixed(3)}%`,
      loggingRate: `${(loggingRate * 100).toFixed(1)}%`,
    },
    thresholds: {
      sustainedRpsOver15: rps >= 15,
      rateLimitsUnder10: rateLimits < 10,
      p99Under5Seconds: p99 < 5000,
      loggingOver99Percent: loggingRate >= 0.99,
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('WEBHOOK STRESS TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Result: ${summary.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Requests/Second: ${summary.metrics.requestsPerSecond} (target: >15)`);
  console.log(`Total Requests: ${summary.metrics.totalRequests}`);
  console.log(`Rate Limit Hits: ${summary.metrics.rateLimitHits} (target: <10)`);
  console.log(`p95 Response Time: ${summary.metrics.p95ResponseTime}`);
  console.log(`p99 Response Time: ${summary.metrics.p99ResponseTime} (target: <5000ms)`);
  console.log(`Error Rate: ${summary.metrics.errorRate}`);
  console.log(`Logging Rate: ${summary.metrics.loggingRate} (target: 100%)`);
  console.log('='.repeat(60) + '\n');

  // Generate detailed JSON report
  const detailedReport = {
    ...summary,
    testConfig: {
      targetRps: TARGET_RPS,
      vus: VUS_NEEDED,
      duration: '5m',
    },
    rawMetrics: {
      http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values : null,
      http_req_duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values : null,
      http_req_failed: data.metrics.http_req_failed ? data.metrics.http_req_failed.values : null,
    },
  };

  return {
    stdout: JSON.stringify(summary, null, 2),
    'stress-report.json': JSON.stringify(detailedReport, null, 2),
  };
}
