/**
 * Comprehensive Performance Benchmark for All Tableau Public MCP Tools
 *
 * Tests caching performance across all tool endpoints:
 * - User profile tools
 * - Workbook tools
 * - Search tools
 * - Social tools (followers, following, favorites)
 * - Featured content tools
 *
 * Run with: npx tsx src/benchmark/allToolsBenchmark.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import { getAllCacheStats, clearAllCaches } from "../utils/cache.js";

// Test configuration - Use well-known Tableau Public profiles
const TEST_USERNAME = "vizwiz"; // Andy Kriebel's popular Tableau Public profile
const TEST_WORKBOOK = "vizwiz/MakeoverMonday"; // Popular workbook
const REPEAT_COUNT = 3;

interface BenchmarkResult {
  name: string;
  coldTimeMs: number;
  warmTimesMs: number[];
  avgWarmMs: number;
  speedup: number;
  success: boolean;
  error?: string;
}

/**
 * Measure execution time of an async function
 */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
  const start = performance.now();
  const result = await fn();
  const timeMs = performance.now() - start;
  return { result, timeMs };
}

/**
 * Format milliseconds for display
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Test a single endpoint with cold and warm cache
 */
async function testEndpoint(
  name: string,
  fetchFn: () => Promise<unknown>
): Promise<BenchmarkResult> {
  const warmTimes: number[] = [];

  try {
    // Cold cache (first request)
    const cold = await measure(fetchFn);

    // Warm cache (subsequent requests)
    for (let i = 0; i < REPEAT_COUNT; i++) {
      const warm = await measure(fetchFn);
      warmTimes.push(warm.timeMs);
    }

    const avgWarm = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;
    const speedup = cold.timeMs / avgWarm;

    return {
      name,
      coldTimeMs: cold.timeMs,
      warmTimesMs: warmTimes,
      avgWarmMs: avgWarm,
      speedup,
      success: true,
    };
  } catch (error) {
    return {
      name,
      coldTimeMs: 0,
      warmTimesMs: [],
      avgWarmMs: 0,
      speedup: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all benchmarks
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   Comprehensive Tableau Public MCP Tools Performance Benchmark ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`Test user: ${TEST_USERNAME}`);
  console.log(`Test workbook: ${TEST_WORKBOOK}`);
  console.log(`Repeat count: ${REPEAT_COUNT}`);

  // Clear all caches before starting
  clearAllCaches();
  console.log("\n✓ Caches cleared\n");

  const results: BenchmarkResult[] = [];

  // Define all endpoints to test
  const endpoints = [
    {
      name: "get_user_profile",
      fn: () => cachedGet(`/profile/api/${TEST_USERNAME}`),
    },
    {
      name: "get_user_profile_basic",
      fn: () => cachedGet("/public/apis/authors", { profileName: TEST_USERNAME }),
    },
    {
      name: "get_user_profile_categories",
      fn: () => cachedGet(`/public/apis/bff/v1/author/${TEST_USERNAME}/categories`, { startIndex: 0, pageSize: 10 }),
    },
    {
      name: "get_workbooks_list",
      fn: () => cachedGet("/public/apis/workbooks", { profileName: TEST_USERNAME, start: 0, count: 10, visibility: "NON_HIDDEN" }),
    },
    {
      name: "get_followers",
      fn: () => cachedGet(`/profile/api/followers/${TEST_USERNAME}`, { index: 0, count: 10 }),
    },
    {
      name: "get_following",
      fn: () => cachedGet(`/profile/api/following/${TEST_USERNAME}`, { index: 0, count: 10 }),
    },
    {
      name: "get_favorites",
      fn: () => cachedGet(`/profile/api/favorite/${TEST_USERNAME}/workbook`),
    },
    {
      name: "get_featured_authors",
      fn: () => cachedGet("/s/authors/list/feed"),
    },
    {
      name: "search_visualizations",
      fn: () => cachedGet("/api/search/query", { query: "sales", type: "vizzes", count: 10, start: 0, language: "en-us" }),
    },
    {
      name: "get_workbook_details",
      fn: () => cachedGet(`/profile/api/single_workbook/${TEST_WORKBOOK}`),
    },
    {
      name: "get_workbook_contents",
      fn: () => cachedGet(`/profile/api/workbook/${TEST_WORKBOOK}`),
    },
    {
      name: "get_related_workbooks",
      fn: () => cachedGet(`/public/apis/bff/workbooks/v2/${TEST_WORKBOOK}/recommended-workbooks`, { count: 5 }),
    },
  ];

  console.log("=".repeat(70));
  console.log("TESTING ALL ENDPOINTS");
  console.log("=".repeat(70));

  for (const endpoint of endpoints) {
    process.stdout.write(`Testing ${endpoint.name}... `);
    const result = await testEndpoint(endpoint.name, endpoint.fn);
    results.push(result);

    if (result.success) {
      console.log(`✓ Cold: ${formatMs(result.coldTimeMs)}, Warm: ${formatMs(result.avgWarmMs)} (${result.speedup.toFixed(0)}x speedup)`);
    } else {
      console.log(`✗ Failed: ${result.error}`);
    }

    // Small delay between tests to be nice to the API
    await new Promise(r => setTimeout(r, 100));
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    const totalCold = successful.reduce((a, b) => a + b.coldTimeMs, 0);
    const totalWarm = successful.reduce((a, b) => a + b.avgWarmMs, 0);
    const avgSpeedup = successful.reduce((a, b) => a + b.speedup, 0) / successful.length;

    console.log(`\nSuccessful tests: ${successful.length}/${results.length}`);
    console.log(`\nTotal cold cache time: ${formatMs(totalCold)}`);
    console.log(`Total warm cache time: ${formatMs(totalWarm)}`);
    console.log(`Average speedup: ${avgSpeedup.toFixed(0)}x`);

    // Top 5 fastest improvements
    console.log("\nTop 5 Cache Improvements:");
    const sorted = [...successful].sort((a, b) => b.speedup - a.speedup);
    sorted.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name}: ${r.speedup.toFixed(0)}x faster (${formatMs(r.coldTimeMs)} → ${formatMs(r.avgWarmMs)})`);
    });
  }

  if (failed.length > 0) {
    console.log(`\nFailed tests (${failed.length}):`);
    failed.forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  // Cache statistics
  console.log("\n" + "=".repeat(70));
  console.log("CACHE STATISTICS");
  console.log("=".repeat(70));

  const allStats = getAllCacheStats();
  let totalHits = 0;
  let totalMisses = 0;

  for (const [name, stats] of Object.entries(allStats)) {
    if (stats.hits > 0 || stats.misses > 0) {
      console.log(`\n${name}:`);
      console.log(`  Size: ${stats.size} entries`);
      console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}`);
      console.log(`  Hit Rate: ${stats.hitRate.toFixed(1)}%`);
      totalHits += stats.hits;
      totalMisses += stats.misses;
    }
  }

  const overallHitRate = totalHits + totalMisses > 0
    ? (totalHits / (totalHits + totalMisses)) * 100
    : 0;
  console.log(`\nOverall: ${totalHits} hits, ${totalMisses} misses (${overallHitRate.toFixed(1)}% hit rate)`);

  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nFinished at: ${new Date().toISOString()}`);
}

main().catch(console.error);
