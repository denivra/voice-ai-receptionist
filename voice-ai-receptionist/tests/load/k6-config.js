/**
 * k6 Configuration
 *
 * Shared configuration for all load test scenarios.
 * Environment variables can override these defaults.
 */

// ============================================================================
// Environment Configuration
// ============================================================================

export const config = {
  // Base URL for the n8n webhook
  baseUrl: __ENV.BASE_URL || __ENV.LOAD_TEST_BASE_URL || 'http://localhost:5678/webhook',

  // Restaurant ID for testing
  restaurantId: __ENV.RESTAURANT_ID || __ENV.LOAD_TEST_RESTAURANT_ID || 'test-restaurant-load',

  // Webhook secret for authentication
  webhookSecret: __ENV.WEBHOOK_SECRET || __ENV.LOAD_TEST_WEBHOOK_SECRET || 'test-secret',

  // Supabase configuration (for verification)
  supabaseUrl: __ENV.SUPABASE_URL || '',
  supabaseKey: __ENV.SUPABASE_ANON_KEY || '',
};

// ============================================================================
// Webhook Endpoints
// ============================================================================

export const endpoints = {
  vapiWebhook: `${config.baseUrl}/vapi-restaurant`,
  checkAvailability: `${config.baseUrl}/check-availability`,
  createBooking: `${config.baseUrl}/create-booking`,
  healthCheck: `${config.baseUrl}/health`,
};

// ============================================================================
// Request Headers
// ============================================================================

export const headers = {
  'Content-Type': 'application/json',
  'X-Vapi-Secret': config.webhookSecret,
  'X-Restaurant-Id': config.restaurantId,
};

// ============================================================================
// Thresholds (Pass/Fail Criteria)
// ============================================================================

export const thresholds = {
  // Concurrent calls test
  concurrentCalls: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },

  // Booking surge test
  bookingSurge: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },

  // Webhook stress test
  webhookStress: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.001'],
    http_reqs: ['rate>15'],
  },
};

// ============================================================================
// Stage Configurations
// ============================================================================

export const stages = {
  // Concurrent calls: ramp to 50 VUs, hold, ramp down
  concurrentCalls: [
    { duration: '30s', target: 10 },   // Warm up
    { duration: '1m', target: 25 },    // Ramp to half
    { duration: '1m', target: 50 },    // Ramp to full
    { duration: '3m', target: 50 },    // Hold at 50 concurrent
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Booking surge: steady load over 30 minutes
  bookingSurge: [
    { duration: '1m', target: 5 },     // Warm up
    { duration: '28m', target: 5 },    // Steady ~100 bookings over 30 min
    { duration: '1m', target: 0 },     // Ramp down
  ],

  // Webhook stress: high constant load
  webhookStress: [
    { duration: '30s', target: 17 },   // Ramp to target (1000/min = ~17/s)
    { duration: '5m', target: 17 },    // Sustain load
    { duration: '30s', target: 0 },    // Ramp down
  ],
};

// ============================================================================
// Test Data Generators
// ============================================================================

// Generate random phone number
export function randomPhone() {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const subscriber = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${subscriber}`;
}

// Generate random party size (2-8)
export function randomPartySize() {
  return Math.floor(Math.random() * 7) + 2;
}

// Generate random seating preference
export function randomSeatingPreference() {
  const preferences = ['indoor', 'outdoor', 'bar', 'any'];
  return preferences[Math.floor(Math.random() * preferences.length)];
}

// Generate random time slot for tomorrow
export function randomTimeSlot() {
  const hours = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
  return hours[Math.floor(Math.random() * hours.length)];
}

// Generate date for tomorrow
export function tomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

// Generate date for next Friday
export function nextFridayDate() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  const friday = new Date(today);
  friday.setDate(today.getDate() + daysUntilFriday);
  return friday.toISOString().split('T')[0];
}

// Generate random customer name
export function randomCustomerName() {
  const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Lisa'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson'];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

// Generate unique call ID
export function generateCallId() {
  return `load_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Payload Generators
// ============================================================================

// Generate check_availability function call payload
export function checkAvailabilityPayload(date, time, partySize, seatingPreference) {
  return {
    message: {
      type: 'function-call',
      functionCall: {
        id: generateCallId(),
        name: 'check_availability',
        parameters: {
          search_datetime: `${date}T${time}:00`,
          party_size: partySize || randomPartySize(),
          seating_preference: seatingPreference || randomSeatingPreference(),
        },
      },
    },
  };
}

// Generate create_booking function call payload
export function createBookingPayload(date, time, partySize, customerName, customerPhone) {
  return {
    message: {
      type: 'function-call',
      functionCall: {
        id: generateCallId(),
        name: 'create_booking',
        parameters: {
          customer_name: customerName || randomCustomerName(),
          customer_phone: customerPhone || randomPhone(),
          booking_datetime: `${date}T${time}:00`,
          party_size: partySize || randomPartySize(),
          seating_preference: randomSeatingPreference(),
          special_requests: '',
        },
      },
    },
  };
}

// Generate call status update payload (for end-of-call webhook)
export function callEndPayload(callId, outcome) {
  return {
    message: {
      type: 'end-of-call-report',
      call: {
        id: callId,
        orgId: 'test-org',
        type: 'inboundPhoneCall',
        status: 'ended',
        endedReason: 'customer-ended-call',
      },
      summary: 'Load test call completed',
      outcome: outcome || 'completed',
    },
  };
}

// ============================================================================
// Response Validators
// ============================================================================

// Check if availability response is valid
export function isValidAvailabilityResponse(response) {
  try {
    const body = JSON.parse(response.body);
    return (
      response.status === 200 &&
      body.results !== undefined &&
      Array.isArray(body.results)
    );
  } catch {
    return false;
  }
}

// Check if booking response is valid
export function isValidBookingResponse(response) {
  try {
    const body = JSON.parse(response.body);
    return (
      response.status === 200 &&
      body.results !== undefined &&
      Array.isArray(body.results)
    );
  } catch {
    return false;
  }
}

// Check if response indicates success
export function isSuccessResponse(response) {
  try {
    const body = JSON.parse(response.body);
    return (
      response.status === 200 &&
      body.results &&
      body.results[0] &&
      body.results[0].result &&
      !body.results[0].result.toLowerCase().includes('error')
    );
  } catch {
    return false;
  }
}

// Check if response indicates conflict
export function isConflictResponse(response) {
  try {
    const body = JSON.parse(response.body);
    return (
      response.status === 200 &&
      body.results &&
      body.results[0] &&
      body.results[0].result &&
      (body.results[0].result.toLowerCase().includes('not available') ||
       body.results[0].result.toLowerCase().includes('conflict') ||
       body.results[0].result.toLowerCase().includes('already booked'))
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Custom Metrics
// ============================================================================

import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics for detailed analysis
export const customMetrics = {
  // Availability checks
  availabilityCheckDuration: new Trend('availability_check_duration'),
  availabilityCheckSuccess: new Rate('availability_check_success'),

  // Booking operations
  bookingDuration: new Trend('booking_duration'),
  bookingSuccess: new Rate('booking_success'),
  bookingConflicts: new Counter('booking_conflicts'),

  // Rate limiting
  rateLimitHits: new Counter('rate_limit_hits'),

  // Errors
  errors: new Counter('errors'),
  timeouts: new Counter('timeouts'),
};

// ============================================================================
// Logging Helpers
// ============================================================================

// Log test configuration on startup
export function logConfig() {
  console.log('='.repeat(60));
  console.log('Load Test Configuration');
  console.log('='.repeat(60));
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Restaurant ID: ${config.restaurantId}`);
  console.log(`Webhook Secret: ${config.webhookSecret ? '***' : 'NOT SET'}`);
  console.log('='.repeat(60));
}

// Log scenario summary
export function logScenarioSummary(name, vus, duration) {
  console.log(`\nScenario: ${name}`);
  console.log(`Max VUs: ${vus}`);
  console.log(`Duration: ${duration}`);
}
