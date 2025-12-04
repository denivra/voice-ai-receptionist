# Load Testing

Load tests for the Voice AI Receptionist system using [k6](https://k6.io/).

## Requirements

Based on Section 7.2 of the Restaurant AI Automation Master Guide:

| Component | Requirement |
|-----------|-------------|
| Voice AI | 50 concurrent calls sustained for 30 minutes |
| n8n Webhooks | 1000 requests/minute without HTTP 429 errors |

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Windows:**
```bash
winget install k6
# or
choco install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

## Environment Setup

Create environment variables before running tests:

```bash
export LOAD_TEST_BASE_URL="https://your-staging.n8n.cloud/webhook"
export LOAD_TEST_RESTAURANT_ID="test-restaurant-load"
export LOAD_TEST_WEBHOOK_SECRET="your-webhook-secret"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

## Test Scenarios

### 1. Concurrent Calls (`scenarios/concurrent-calls.js`)

Simulates concurrent call handling to test system capacity.

**What it tests:**
- Ramps up to 50 concurrent "calls" (webhook requests)
- Each call simulates: `check_availability` → `create_booking`
- Measures response times and error rates

**Targets:**
| Metric | Target | Threshold |
|--------|--------|-----------|
| Response Time (p95) | < 2 seconds | < 3 seconds |
| Error Rate | < 1% | < 5% |
| Success Rate | > 99% | > 95% |

**Run:**
```bash
k6 run scenarios/concurrent-calls.js
```

### 2. Booking Surge (`scenarios/booking-surge.js`)

Simulates a Friday evening booking rush.

**What it tests:**
- 100 booking attempts over 30 minutes
- Mix of successful bookings and conflicts
- Concurrent requests for same time slots
- Data integrity under load

**Targets:**
| Metric | Target | Threshold |
|--------|--------|-----------|
| Successful Bookings | > 80% of valid requests | > 70% |
| Conflict Detection | 100% accuracy | 100% |
| Data Integrity | 0 duplicates | 0 |
| Response Time (p95) | < 3 seconds | < 5 seconds |

**Run:**
```bash
k6 run scenarios/booking-surge.js
```

### 3. Webhook Stress (`scenarios/webhook-stress.js`)

Stress tests the n8n webhook endpoint.

**What it tests:**
- 1000 requests per minute sustained
- Rate limiting behavior
- Request logging completeness
- System stability under high load

**Targets:**
| Metric | Target | Threshold |
|--------|--------|-----------|
| Requests/sec | 16.67 (1000/min) | 15+ |
| HTTP 429 Errors | 0 | < 10 |
| All Requests Logged | 100% | 100% |
| Response Time (p99) | < 5 seconds | < 10 seconds |

**Run:**
```bash
k6 run scenarios/webhook-stress.js
```

## Running Tests

### Quick Start

```bash
# Run individual scenarios
k6 run scenarios/concurrent-calls.js
k6 run scenarios/booking-surge.js
k6 run scenarios/webhook-stress.js
```

### With Environment Variables

```bash
k6 run -e BASE_URL=https://staging.example.com/webhook \
       -e RESTAURANT_ID=test-restaurant \
       -e WEBHOOK_SECRET=your-secret \
       scenarios/concurrent-calls.js
```

### With Custom Duration/VUs

```bash
# Override virtual users and duration
k6 run --vus 100 --duration 5m scenarios/concurrent-calls.js
```

### Using Docker

```bash
docker run -i grafana/k6 run - <scenarios/concurrent-calls.js

# With environment variables
docker run -i \
  -e BASE_URL=https://staging.example.com/webhook \
  -e RESTAURANT_ID=test-restaurant \
  grafana/k6 run - <scenarios/concurrent-calls.js
```

### Running Against Staging

**Pre-flight checklist:**
1. Ensure staging environment is isolated from production
2. Notify team that load testing is in progress
3. Verify test data exists (test restaurant, availability slots)
4. Confirm monitoring dashboards are accessible

```bash
# Set staging environment
export LOAD_TEST_BASE_URL="https://staging-n8n.example.com/webhook"
export LOAD_TEST_RESTAURANT_ID="load-test-restaurant"
export LOAD_TEST_WEBHOOK_SECRET="staging-secret"

# Run with staging config
k6 run scenarios/concurrent-calls.js
```

## Output & Reporting

### Console Output

k6 provides real-time metrics in the console:

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/

  execution: local
     script: scenarios/concurrent-calls.js
     output: -

  scenarios: (100.00%) 1 scenario, 50 max VUs, 3m30s max duration

     ✓ availability check succeeded
     ✓ booking created successfully
     ✓ response time < 2s

     checks.........................: 99.45% ✓ 2983 ✗ 16
     data_received..................: 1.2 MB 6.8 kB/s
     data_sent......................: 892 kB 5.0 kB/s
     http_req_duration..............: avg=245ms min=89ms max=1.8s p(90)=412ms p(95)=589ms
     http_reqs......................: 3000   16.67/s
     iteration_duration.............: avg=1.2s  min=456ms max=3.2s p(90)=1.8s p(95)=2.1s
     vus............................: 50     min=1   max=50
```

### JSON Output

```bash
k6 run --out json=results.json scenarios/concurrent-calls.js
```

### HTML Report

```bash
# Run with JSON output
k6 run --out json=results.json scenarios/concurrent-calls.js

# Use k6-reporter for HTML (requires npm package)
npx k6-html-reporter -j results.json -o report.html
```

### Grafana Cloud Integration

```bash
# Stream metrics to Grafana Cloud k6
K6_CLOUD_TOKEN=your-token k6 run --out cloud scenarios/concurrent-calls.js
```

## Pass/Fail Criteria

### Concurrent Calls Test

| Criteria | Pass | Fail |
|----------|------|------|
| p95 response time | < 2000ms | >= 3000ms |
| Error rate | < 1% | >= 5% |
| Availability checks | 100% success | < 95% success |
| Booking success | > 95% | < 90% |

### Booking Surge Test

| Criteria | Pass | Fail |
|----------|------|------|
| Valid bookings created | > 80% | < 70% |
| Conflicts detected correctly | 100% | < 100% |
| No duplicate bookings | 0 duplicates | > 0 duplicates |
| Data consistency | 100% | < 100% |

### Webhook Stress Test

| Criteria | Pass | Fail |
|----------|------|------|
| Sustained RPS | > 15/s | < 10/s |
| HTTP 429 errors | 0 | > 10 |
| Request logging | 100% | < 100% |
| System stability | No crashes | Any crash |

## Metrics to Monitor

During load tests, monitor:

### n8n Metrics
- Execution queue length
- Average execution time
- Error rate

### Supabase Metrics
- Connection pool utilization
- Query latency
- CPU/Memory usage

### System Metrics
- Response time (p50, p95, p99)
- Throughput (requests/second)
- Error rate

## Interpreting Results

### Response Time Percentiles

- **p50 (median)**: Half of requests faster than this
- **p90**: 90% of requests faster than this
- **p95**: 95% of requests faster than this (main SLA metric)
- **p99**: 99% of requests faster than this (tail latency)

### Common Issues

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| High p99, low p50 | GC pauses or cold starts | Check function warm-up |
| Increasing latency over time | Memory leak or connection exhaustion | Check resource cleanup |
| Sudden spike in errors | Rate limiting or timeout | Check limits and timeouts |
| 429 errors | Rate limiting triggered | Reduce load or increase limits |

## Success Criteria

| Metric | Target |
|--------|--------|
| p95 Response Time | < 2000ms |
| Error Rate | < 1% |
| Throughput | > 100 req/s |
| CPU Usage (n8n) | < 80% |
| Memory Usage (n8n) | < 80% |

## Directory Structure

```
tests/load/
├── README.md                   # This file
├── k6-config.js               # Shared k6 configuration
└── scenarios/
    ├── concurrent-calls.js    # Concurrent call handling test
    ├── booking-surge.js       # Friday rush simulation
    └── webhook-stress.js      # High-volume stress test
```

## Troubleshooting

### k6 can't connect

```bash
# Check connectivity
curl -v $LOAD_TEST_BASE_URL/health

# Verify environment variables
echo $LOAD_TEST_BASE_URL
```

### Tests timing out

```bash
# Increase timeout
k6 run --http-timeout 60s scenarios/concurrent-calls.js
```

### Out of memory

```bash
# Reduce VUs or use distributed testing
k6 run --vus 25 scenarios/concurrent-calls.js
```
