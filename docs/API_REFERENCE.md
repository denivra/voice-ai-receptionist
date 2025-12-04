# API Reference

## Overview

This document describes the webhook endpoints and function call interfaces used by the Voice AI Receptionist system.

## n8n Webhook Endpoints

### POST /webhook/vapi-restaurant

Main webhook handler for Vapi function calls.

**Authentication:**
- Header: `X-Vapi-Secret: <N8N_WEBHOOK_SECRET>`

**Request Body (from Vapi):**

```json
{
  "message": {
    "type": "function-call",
    "functionCall": {
      "id": "call_abc123",
      "name": "check_availability",
      "parameters": {
        "search_datetime": "2024-03-15T19:00:00",
        "party_size": 4,
        "seating_preference": "indoor"
      }
    }
  },
  "call": {
    "id": "call_xyz789",
    "phoneNumber": "+15551234567",
    "createdAt": "2024-03-15T18:30:00Z"
  }
}
```

**Response Format:**

```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": "{\"status\":\"available\",\"message\":\"...\"}"
    }
  ]
}
```

---

## Vapi Tool Definitions

### check_availability

Checks the CRM for open tables at the requested time.

**Tool Definition:**

```json
{
  "name": "check_availability",
  "description": "Check CRM for open tables. Returns up to 3 alternative slots if requested time unavailable.",
  "parameters": {
    "type": "object",
    "properties": {
      "search_datetime": {
        "type": "string",
        "description": "ISO 8601 format (YYYY-MM-DDTHH:MM:SS)"
      },
      "party_size": {
        "type": "integer",
        "description": "Number of guests (1-20)"
      },
      "seating_preference": {
        "type": "string",
        "enum": ["indoor", "outdoor", "bar", "any"],
        "default": "any"
      }
    },
    "required": ["search_datetime", "party_size"]
  }
}
```

**Response Schema:**

```json
{
  "status": "available | partial_match | unavailable | error",
  "requested_slot": {
    "datetime": "2024-03-15T19:00:00",
    "available": true
  },
  "alternative_slots": [
    {
      "datetime": "2024-03-15T19:30:00",
      "seating_type": "indoor",
      "capacity": 4
    },
    {
      "datetime": "2024-03-15T18:30:00",
      "seating_type": "outdoor",
      "capacity": 6
    }
  ],
  "message": "Great news! I have 7 PM available for a party of 4.",
  "error_code": null
}
```

**Status Values:**

| Status | Meaning | AI Behavior |
|--------|---------|-------------|
| `available` | Requested slot is open | Confirm and proceed to booking |
| `partial_match` | Alternatives found | Present alternatives |
| `unavailable` | No slots within range | Offer different date or handoff |
| `error` | System error | Graceful fallback, take callback |

**Error Codes:**

| Code | Meaning | Recovery |
|------|---------|----------|
| `CRM_TIMEOUT` | Database query timeout | Take callback, alert manager |
| `INVALID_DATE` | Date in past or too far future | Ask for valid date |
| `RESTAURANT_CLOSED` | Requested day is closed | Inform and offer alternative day |

---

### book_appointment

Creates a reservation in the CRM and triggers SMS confirmation.

**Tool Definition:**

```json
{
  "name": "book_appointment",
  "description": "Creates reservation in CRM and sends SMS confirmation",
  "parameters": {
    "type": "object",
    "properties": {
      "customer_name": {
        "type": "string",
        "description": "Full name of the guest"
      },
      "customer_phone": {
        "type": "string",
        "pattern": "^\\+?[1-9]\\d{1,14}$",
        "description": "E.164 format phone number"
      },
      "datetime": {
        "type": "string",
        "format": "date-time",
        "description": "ISO 8601 reservation datetime"
      },
      "party_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20,
        "description": "Number of guests"
      },
      "seating_type": {
        "type": "string",
        "enum": ["indoor", "outdoor", "bar"],
        "description": "Seating preference"
      },
      "special_requests": {
        "type": "string",
        "maxLength": 500,
        "description": "Any special requests (high chair, anniversary, etc.)"
      },
      "sms_consent": {
        "type": "boolean",
        "default": true,
        "description": "TCPA consent for SMS confirmation"
      }
    },
    "required": ["customer_name", "customer_phone", "datetime", "party_size"]
  }
}
```

**Response Schema:**

```json
{
  "status": "booked | conflict | error",
  "reservation": {
    "id": "res_abc123",
    "confirmation_code": "ABC123",
    "datetime": "2024-03-15T19:00:00",
    "party_size": 4,
    "customer_name": "John Smith"
  },
  "sms_sent": true,
  "message": "Perfect! I've booked a table for 4 at 7 PM. Confirmation sent to your phone.",
  "error_code": null
}
```

**Status Values:**

| Status | Meaning | AI Behavior |
|--------|---------|-------------|
| `booked` | Reservation created | Confirm and end call |
| `conflict` | Slot was taken | Re-check availability, offer alternatives |
| `error` | System error | Take callback, alert manager |

---

### transfer_call

Transfers the call to a human operator or specific queue.

**Tool Definition:**

```json
{
  "name": "transfer_call",
  "description": "Transfers call to human operator or specific queue",
  "parameters": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "enum": [
          "allergy_safety",
          "large_party",
          "customer_request",
          "manager_request",
          "technical_issue"
        ],
        "description": "Reason for transfer"
      },
      "queue": {
        "type": "string",
        "enum": ["general", "events", "manager"],
        "default": "general",
        "description": "Target queue"
      },
      "notes": {
        "type": "string",
        "maxLength": 500,
        "description": "Context for receiving agent"
      }
    },
    "required": ["reason"]
  }
}
```

**Response Schema:**

```json
{
  "status": "transferred | unavailable | error",
  "transfer_id": "xfer_abc123",
  "queue": "manager",
  "estimated_wait": 30,
  "message": "Connecting you now. Hold time is about 30 seconds.",
  "fallback_action": null
}
```

**Queue Routing:**

| Queue | Phone/Extension | Business Hours |
|-------|----------------|----------------|
| `general` | Main line overflow | During business hours |
| `events` | Events coordinator | Tue-Sat 10am-6pm |
| `manager` | On-duty manager | Always (voicemail if unavailable) |

---

## SMS Webhook

### POST /webhook/booking-confirm

Triggered after successful booking to send SMS confirmation.

**Request Body:**

```json
{
  "reservation_id": "res_abc123",
  "customer_phone": "+15551234567",
  "customer_name": "John Smith",
  "datetime": "2024-03-15T19:00:00",
  "party_size": 4,
  "confirmation_code": "ABC123",
  "restaurant_name": "The Test Kitchen",
  "restaurant_phone": "+15559876543"
}
```

**SMS Template:**

```
Confirmed: Table for {party_size} at {restaurant_name}
Date: {formatted_date}
Time: {formatted_time}
Confirmation: {confirmation_code}

To cancel/modify: Reply CANCEL or call {restaurant_phone}
```

---

## Callback Handler

### POST /webhook/callback-handler

Handles failed booking recovery requests.

**Request Body:**

```json
{
  "customer_phone": "+15551234567",
  "customer_name": "John Smith",
  "requested_datetime": "2024-03-15T19:00:00",
  "party_size": 4,
  "failure_reason": "CRM_TIMEOUT",
  "call_id": "call_xyz789",
  "created_at": "2024-03-15T18:35:00Z"
}
```

**Actions:**
1. Creates callback task in CRM
2. Sends Slack alert to manager channel
3. Returns confirmation to Vapi

---

## Error Response Format

All endpoints return errors in this format:

```json
{
  "status": "error",
  "error_code": "VALIDATION_ERROR",
  "message": "Party size must be between 1 and 20",
  "details": {
    "field": "party_size",
    "value": 25,
    "constraint": "maximum: 20"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Invalid parameters |
| `AUTH_ERROR` | 401 | Invalid or missing X-Vapi-Secret |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Booking conflict |
| `CRM_TIMEOUT` | 504 | Database timeout |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/webhook/vapi-restaurant` | 100 req | 1 minute |
| `/webhook/booking-confirm` | 50 req | 1 minute |
| `/webhook/callback-handler` | 20 req | 1 minute |

Rate limit headers:
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Testing

### Test Endpoints

For development/staging:

```
POST /webhook/vapi-restaurant/test
```

Returns mock responses without hitting actual CRM.

### Test Phone Numbers

| Number | Behavior |
|--------|----------|
| `+15550001111` | Always available |
| `+15550002222` | Always unavailable |
| `+15550003333` | Returns timeout error |
| `+15550004444` | Triggers transfer |
