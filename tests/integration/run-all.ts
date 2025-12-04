#!/usr/bin/env npx ts-node

/**
 * Integration Test Runner
 *
 * Runs all integration test suites and reports results.
 * Can run individual suites or all tests together.
 *
 * Usage:
 *   npx ts-node tests/integration/run-all.ts           # Run all tests
 *   npx ts-node tests/integration/run-all.ts availability  # Run availability tests only
 *   npx ts-node tests/integration/run-all.ts booking       # Run booking flow tests only
 *   npx ts-node tests/integration/run-all.ts error         # Run error handling tests only
 *   npx ts-node tests/integration/run-all.ts transfer      # Run transfer flow tests only
 */

import { runAvailabilityTests } from './test-check-availability'
import { runBookingFlowTests } from './test-booking-flow'
import { runErrorHandlingTests } from './test-error-handling'
import { runTransferFlowTests } from './test-transfer-flows'
import { config, cleanupTestData, type TestSuiteResult } from './setup'

// ============================================================================
// Types
// ============================================================================

interface OverallResult {
  suites: TestSuiteResult[]
  totalPassed: number
  totalFailed: number
  totalDuration: number
}

type TestSuite = 'availability' | 'booking' | 'error' | 'transfer' | 'all'

// ============================================================================
// Test Suite Registry
// ============================================================================

const testSuites: Record<Exclude<TestSuite, 'all'>, () => Promise<TestSuiteResult>> = {
  availability: runAvailabilityTests,
  booking: runBookingFlowTests,
  error: runErrorHandlingTests,
  transfer: runTransferFlowTests,
}

// ============================================================================
// Runner Functions
// ============================================================================

async function runSuite(name: string, runner: () => Promise<TestSuiteResult>): Promise<TestSuiteResult> {
  console.log(`\n${'#'.repeat(60)}`)
  console.log(`# Running: ${name}`)
  console.log(`${'#'.repeat(60)}\n`)

  try {
    return await runner()
  } catch (error) {
    console.error(`Suite "${name}" crashed:`, error)
    return {
      name,
      tests: [{
        name: 'Suite Execution',
        passed: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      }],
      passed: 0,
      failed: 1,
      duration: 0,
    }
  }
}

async function runAllSuites(): Promise<OverallResult> {
  const suites: TestSuiteResult[] = []

  // Run each suite in order
  for (const [name, runner] of Object.entries(testSuites)) {
    const result = await runSuite(name, runner)
    suites.push(result)
  }

  // Calculate totals
  const totalPassed = suites.reduce((sum, s) => sum + s.passed, 0)
  const totalFailed = suites.reduce((sum, s) => sum + s.failed, 0)
  const totalDuration = suites.reduce((sum, s) => sum + s.duration, 0)

  return { suites, totalPassed, totalFailed, totalDuration }
}

async function runSelectedSuite(suiteName: Exclude<TestSuite, 'all'>): Promise<OverallResult> {
  const runner = testSuites[suiteName]
  if (!runner) {
    console.error(`Unknown test suite: ${suiteName}`)
    console.log('Available suites:', Object.keys(testSuites).join(', '))
    process.exit(1)
  }

  const result = await runSuite(suiteName, runner)

  return {
    suites: [result],
    totalPassed: result.passed,
    totalFailed: result.failed,
    totalDuration: result.duration,
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function printOverallReport(result: OverallResult): void {
  const { suites, totalPassed, totalFailed, totalDuration } = result

  console.log('\n' + '═'.repeat(60))
  console.log('OVERALL TEST RESULTS')
  console.log('═'.repeat(60))

  // Suite summary
  console.log('\nSuite Summary:')
  console.log('─'.repeat(60))

  for (const suite of suites) {
    const status = suite.failed === 0 ? '✓ PASSED' : '✗ FAILED'
    const color = suite.failed === 0 ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(
      `${color}${status}${reset} ${suite.name.padEnd(30)} ` +
      `${suite.passed}/${suite.tests.length} tests (${suite.duration}ms)`
    )
  }

  // Overall totals
  console.log('─'.repeat(60))
  console.log(`\nTotal Tests: ${totalPassed + totalFailed}`)
  console.log(`Passed: \x1b[32m${totalPassed}\x1b[0m`)
  console.log(`Failed: \x1b[31m${totalFailed}\x1b[0m`)
  console.log(`Duration: ${totalDuration}ms`)

  // Failed tests detail
  const failedTests = suites.flatMap(s =>
    s.tests.filter(t => !t.passed).map(t => ({ suite: s.name, ...t }))
  )

  if (failedTests.length > 0) {
    console.log('\n' + '─'.repeat(60))
    console.log('FAILED TESTS:')
    console.log('─'.repeat(60))

    for (const test of failedTests) {
      console.log(`\n\x1b[31m✗\x1b[0m [${test.suite}] ${test.name}`)
      if (test.error) {
        console.log(`  Error: ${test.error}`)
      }
    }
  }

  console.log('\n' + '═'.repeat(60) + '\n')
}

function generateJUnitXml(result: OverallResult): string {
  const { suites, totalPassed, totalFailed, totalDuration } = result

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<testsuites tests="${totalPassed + totalFailed}" failures="${totalFailed}" time="${totalDuration / 1000}">\n`

  for (const suite of suites) {
    xml += `  <testsuite name="${suite.name}" tests="${suite.tests.length}" failures="${suite.failed}" time="${suite.duration / 1000}">\n`

    for (const test of suite.tests) {
      xml += `    <testcase name="${test.name}" time="${test.duration / 1000}">\n`
      if (!test.passed && test.error) {
        xml += `      <failure message="${escapeXml(test.error)}">${escapeXml(test.error)}</failure>\n`
      }
      xml += '    </testcase>\n'
    }

    xml += '  </testsuite>\n'
  }

  xml += '</testsuites>\n'
  return xml
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now()

  // Parse command line arguments
  const args = process.argv.slice(2)
  const suiteName = (args[0]?.toLowerCase() || 'all') as TestSuite
  const outputFormat = args.includes('--junit') ? 'junit' : 'console'

  console.log('═'.repeat(60))
  console.log('VOICE AI RECEPTIONIST - INTEGRATION TESTS')
  console.log('═'.repeat(60))
  console.log(`\nConfiguration:`)
  console.log(`  Supabase URL: ${config.supabaseUrl}`)
  console.log(`  n8n Webhook: ${config.n8nWebhookBaseUrl}`)
  console.log(`  Test Restaurant: ${config.testRestaurantId}`)
  console.log(`  E2E Tests: ${config.enableE2E ? 'Enabled' : 'Disabled'}`)
  console.log(`\nRunning suite: ${suiteName}`)

  let result: OverallResult

  try {
    // Initial cleanup
    console.log('\nCleaning up any existing test data...')
    await cleanupTestData()

    // Run tests
    if (suiteName === 'all') {
      result = await runAllSuites()
    } else {
      result = await runSelectedSuite(suiteName)
    }

    // Final cleanup
    console.log('\nCleaning up test data...')
    await cleanupTestData()
  } catch (error) {
    console.error('Test runner failed:', error)
    process.exit(1)
  }

  // Output results
  if (outputFormat === 'junit') {
    console.log(generateJUnitXml(result))
  } else {
    printOverallReport(result)
  }

  const totalTime = Date.now() - startTime
  console.log(`Total execution time: ${totalTime}ms`)

  // Exit with appropriate code
  process.exit(result.totalFailed > 0 ? 1 : 0)
}

// ============================================================================
// CLI Help
// ============================================================================

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Voice AI Receptionist Integration Test Runner

Usage:
  npx ts-node tests/integration/run-all.ts [suite] [options]

Suites:
  all          Run all test suites (default)
  availability Run availability checking tests
  booking      Run booking flow tests
  error        Run error handling tests
  transfer     Run transfer flow tests

Options:
  --junit      Output results in JUnit XML format
  --help, -h   Show this help message

Environment Variables:
  TEST_SUPABASE_URL          Supabase URL for test database
  TEST_SUPABASE_SERVICE_KEY  Supabase service role key
  TEST_N8N_WEBHOOK_URL       n8n webhook base URL
  TEST_RESTAURANT_ID         Test restaurant ID to use
  ENABLE_E2E_TESTS           Set to 'true' to enable E2E tests

Examples:
  npx ts-node tests/integration/run-all.ts
  npx ts-node tests/integration/run-all.ts availability
  npx ts-node tests/integration/run-all.ts booking --junit > results.xml
`)
  process.exit(0)
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

export { runAllSuites, runSelectedSuite }
