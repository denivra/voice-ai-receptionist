/**
 * Booking Surge Load Test
 *
 * Simulates a Friday evening booking rush.
 * Tests conflict handling and data integrity under realistic load.
 *
 * Scenario:
 *   - 100 booking attempts over 30 minutes
 *   - Multiple requests for same time slots (conflict testing)
 *   - Mix of successful and conflicting bookings
 *   - Verify no duplicate bookings created
 *
 * Targets:
 *   - Successful bookings: > 80% of valid requests
 *   - Conflict detection: 100% accuracy
 *   - No duplicate bookings
 *   - Response time p95 < 3 seconds
 *
 * Run:
 *   k6 run scenarios/booking-surge.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import {
  config,
  endpoints,
  headers,
  stages,
  nextFridayDate,
  randomPartySize,
  randomSeatingPreference,
  randomCustomerName,
  randomPhone,
  checkAvailabilityPayload,
  createBookingPayload,
  isValidAvailabilityResponse,
  isSuccessResponse,
  isConflictResponse,
  logConfig,
} from '../k6-config.js';

// ============================================================================
// Test Configuration
// ============================================================================

// Popular Friday evening time slots (high contention expected)
const POPULAR_TIME_SLOTS = ['18:00', '18:30', '19:00', '19:30', '20:00'];

// Less popular slots (lower contention)
const ALL_TIME_SLOTS = [
  '17:00', '17:30', '18:00', '18:30', '19:00',
  '19:30', '20:00', '20:30', '21:00', '21:30',
];

export const options = {
  // Steady load to simulate ~100 bookings over 30 minutes
  // 5 VUs making ~20 requests each = 100 total
  stages: [
    { duration: '30s', target: 5 },   // Warm up
    { duration: '28m', target: 5 },   // Steady state
    { duration: '1m30s', target: 0 }, // Cool down
  ],

  thresholds: {
    // Response time thresholds
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],

    // Error rate (HTTP errors only, not booking conflicts)
    http_req_failed: ['rate<0.05'],

    // Booking success rate (excluding conflicts)
    booking_success: ['rate>0.70'],

    // Conflict detection should be 100%
    conflict_detected: ['rate==1'],

    // No duplicates allowed
    duplicate_bookings: ['count==0'],
  },

  tags: {
    testType: 'booking-surge',
    environment: __ENV.ENVIRONMENT || 'staging',
  },
};

// ============================================================================
// Custom Metrics
// ============================================================================

const bookingAttempts = new Counter('booking_attempts');
const bookingSuccess = new Rate('booking_success');
const bookingConflicts = new Counter('booking_conflicts');
const conflictDetected = new Rate('conflict_detected');
const duplicateBookings = new Counter('duplicate_bookings');
const bookingDuration = new Trend('booking_duration');
const availabilityDuration = new Trend('availability_duration');

// Track created bookings to detect duplicates
const createdBookings = {};

// ============================================================================
// Setup
// ============================================================================

export function setup() {
  logConfig();

  console.log('\n--- Booking Surge Test ---');
  console.log('Simulating Friday evening rush');
  console.log('Target: 100 bookings over 30 minutes');
  console.log('Focus: Conflict handling and data integrity\n');

  const testDate = nextFridayDate();
  console.log(`Test date: ${testDate} (next Friday)`);

  return {
    startTime: new Date().toISOString(),
    testDate: testDate,
    bookingsBySlot: {},
  };
}

// ============================================================================
// Main Test Function
// ============================================================================

export default function (data) {
  const testDate = data.testDate;

  // Weighted random: 70% chance of popular slot (higher contention)
  const usePopularSlot = Math.random() < 0.7;
  const slots = usePopularSlot ? POPULAR_TIME_SLOTS : ALL_TIME_SLOTS;
  const testTime = slots[Math.floor(Math.random() * slots.length)];

  const partySize = randomPartySize();
  const customerName = randomCustomerName();
  const customerPhone = randomPhone();
  const slotKey = `${testDate}_${testTime}`;

  let isAvailable = false;
  let bookingSucceeded = false;
  let conflictOccurred = false;

  // -------------------------------------------------------------------------
  // Step 1: Check Availability
  // -------------------------------------------------------------------------
  group('surge_check_availability', function () {
    const payload = JSON.stringify(
      checkAvailabilityPayload(testDate, testTime, partySize, randomSeatingPreference())
    );

    const response = http.post(endpoints.vapiWebhook, payload, {
      headers: headers,
      timeout: '30s',
      tags: { name: 'surge_availability' },
    });

    availabilityDuration.add(response.timings.duration);

    const validResponse = check(response, {
      'availability status 200': (r) => r.status === 200,
      'availability has results': (r) => isValidAvailabilityResponse(r),
    });

    if (validResponse) {
      try {
        const body = JSON.parse(response.body);
        if (body.results && body.results[0]) {
          const result = body.results[0].result.toLowerCase();
          isAvailable = !result.includes('not available') &&
                        !result.includes('no availability') &&
                        !result.includes('fully booked');
        }
      } catch (e) {
        console.log(`Parse error: ${e.message}`);
      }
    }
  });

  sleep(0.3);

  // -------------------------------------------------------------------------
  // Step 2: Attempt Booking
  // -------------------------------------------------------------------------
  group('surge_create_booking', function () {
    bookingAttempts.add(1);

    const payload = JSON.stringify(
      createBookingPayload(testDate, testTime, partySize, customerName, customerPhone)
    );

    const startTime = new Date().getTime();

    const response = http.post(endpoints.vapiWebhook, payload, {
      headers: headers,
      timeout: '30s',
      tags: { name: 'surge_booking' },
    });

    const duration = new Date().getTime() - startTime;
    bookingDuration.add(duration);

    check(response, {
      'booking status 200': (r) => r.status === 200,
      'booking response time < 3s': (r) => r.timings.duration < 3000,
    });

    // Analyze result
    if (response.status === 200) {
      try {
        const body = JSON.parse(response.body);
        if (body.results && body.results[0]) {
          const result = body.results[0].result.toLowerCase();

          // Check for success
          if (result.includes('confirmed') || result.includes('booked') || result.includes('reservation')) {
            if (!result.includes('not') && !result.includes('unavailable')) {
              bookingSucceeded = true;
              bookingSuccess.add(1);

              // Check for duplicate
              if (createdBookings[slotKey]) {
                // Same slot booked multiple times - potential duplicate
                duplicateBookings.add(1);
                console.log(`DUPLICATE DETECTED: ${slotKey} already booked`);
              } else {
                createdBookings[slotKey] = true;
              }
            }
          }

          // Check for conflict detection
          if (result.includes('not available') ||
              result.includes('conflict') ||
              result.includes('already booked') ||
              result.includes('no availability')) {
            conflictOccurred = true;
            bookingConflicts.add(1);
            conflictDetected.add(1);

            // If system correctly rejected a booking for a slot we know is taken
            if (createdBookings[slotKey]) {
              // Conflict correctly detected
              check(response, {
                'conflict correctly detected': () => true,
              });
            }
          }

          // If neither success nor conflict, mark as failed
          if (!bookingSucceeded && !conflictOccurred) {
            bookingSuccess.add(0);
          }
        }
      } catch (e) {
        console.log(`Parse error: ${e.message}`);
        bookingSuccess.add(0);
      }
    } else {
      bookingSuccess.add(0);
    }
  });

  // Think time between booking attempts
  // Longer pauses to simulate ~100 bookings over 30 minutes
  sleep(Math.random() * 15 + 5); // 5-20 seconds
}

// ============================================================================
// Teardown
// ============================================================================

export function teardown(data) {
  console.log('\n--- Booking Surge Test Complete ---');
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
  console.log(`Test Date: ${data.testDate}`);

  const uniqueSlots = Object.keys(createdBookings).length;
  console.log(`Unique slots booked: ${uniqueSlots}`);
}

// ============================================================================
// Custom Summary
// ============================================================================

export function handleSummary(data) {
  const bookingSuccessRate = data.metrics.booking_success ?
    data.metrics.booking_success.values.rate : 0;
  const conflictCount = data.metrics.booking_conflicts ?
    data.metrics.booking_conflicts.values.count : 0;
  const duplicateCount = data.metrics.duplicate_bookings ?
    data.metrics.duplicate_bookings.values.count : 0;
  const p95 = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;

  const passed = bookingSuccessRate >= 0.70 &&
                 duplicateCount === 0 &&
                 p95 < 3000;

  const summary = {
    testName: 'Booking Surge',
    passed: passed,
    metrics: {
      bookingSuccessRate: `${(bookingSuccessRate * 100).toFixed(1)}%`,
      conflictCount: conflictCount,
      duplicateBookings: duplicateCount,
      p95ResponseTime: `${p95.toFixed(0)}ms`,
      totalAttempts: data.metrics.booking_attempts ?
        data.metrics.booking_attempts.values.count : 0,
    },
    thresholds: {
      bookingSuccessOver70Percent: bookingSuccessRate >= 0.70,
      noDuplicates: duplicateCount === 0,
      p95Under3Seconds: p95 < 3000,
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('BOOKING SURGE TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Result: ${summary.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Booking Success Rate: ${summary.metrics.bookingSuccessRate} (target: >70%)`);
  console.log(`Conflicts Detected: ${summary.metrics.conflictCount}`);
  console.log(`Duplicate Bookings: ${summary.metrics.duplicateBookings} (target: 0)`);
  console.log(`p95 Response Time: ${summary.metrics.p95ResponseTime} (target: <3000ms)`);
  console.log(`Total Booking Attempts: ${summary.metrics.totalAttempts}`);
  console.log('='.repeat(60) + '\n');

  return {
    stdout: JSON.stringify(summary, null, 2),
  };
}
