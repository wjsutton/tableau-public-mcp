/**
 * Performance Benchmark Script for Tableau Public MCP Server
 *
 * Tests and compares:
 * 1. Cold cache vs warm cache (same query repeated)
 * 2. Sequential vs parallel pagination
 * 3. Cache hit rate over multiple queries
 *
 * Run with: npx ts-node src/benchmark/searchBenchmark.ts
 * Or: npx tsx src/benchmark/searchBenchmark.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import {
  getAllCacheStats,
  clearAllCaches,
  getSearchCache,
} from "../utils/cache.js";
import { paginate, paginateParallel } from "../utils/pagination.js";

// Benchmark configuration
const SEARCH_QUERIES = ["COVID", "Sales", "Climate", "Finance", "Sports"];
const REPEAT_COUNT = 3;
const PAGINATION_TOTAL = 100;

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
 * Calculate statistics from timing array
 */
function calculateStats(times: number[]): {
  avg: number;
  min: number;
  max: number;
  p95: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] || max;
  return { avg, min, max, p95 };
}

/**
 * Format milliseconds for display
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Benchmark 1: Cold Cache vs Warm Cache
 *
 * Compare response times for:
 * - First request (cold cache, hits API)
 * - Subsequent requests (warm cache, hits cache)
 */
async function benchmarkCaching(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 1: Cold Cache vs Warm Cache");
  console.log("=".repeat(60));

  clearAllCaches();

  const coldTimes: number[] = [];
  const warmTimes: number[] = [];

  for (const query of SEARCH_QUERIES) {
    // Cold cache request
    const cold = await measure(() =>
      cachedGet<unknown>("/api/search/query", {
        query,
        type: "vizzes",
        count: 20,
        start: 0,
      })
    );
    coldTimes.push(cold.timeMs);

    // Warm cache requests
    for (let i = 0; i < REPEAT_COUNT; i++) {
      const warm = await measure(() =>
        cachedGet<unknown>("/api/search/query", {
          query,
          type: "vizzes",
          count: 20,
          start: 0,
        })
      );
      warmTimes.push(warm.timeMs);
    }
  }

  const coldStats = calculateStats(coldTimes);
  const warmStats = calculateStats(warmTimes);
  const speedup = coldStats.avg / warmStats.avg;

  console.log("\nResults:");
  console.log(`  Cold Cache (API call):  avg=${formatMs(coldStats.avg)}, min=${formatMs(coldStats.min)}, max=${formatMs(coldStats.max)}`);
  console.log(`  Warm Cache (cache hit): avg=${formatMs(warmStats.avg)}, min=${formatMs(warmStats.min)}, max=${formatMs(warmStats.max)}`);
  console.log(`  Speedup: ${speedup.toFixed(1)}x faster with cache`);

  const stats = getSearchCache().getStats();
  console.log(`\nCache Stats:`);
  console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}`);
  console.log(`  Hit Rate: ${stats.hitRate.toFixed(1)}%`);
}

/**
 * Benchmark 2: Sequential vs Parallel Pagination
 *
 * Compare time to fetch multiple pages using:
 * - Sequential pagination (one at a time)
 * - Parallel pagination (concurrent batches)
 */
async function benchmarkPagination(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 2: Sequential vs Parallel Pagination");
  console.log("=".repeat(60));

  const pageSize = 20;
  const totalToFetch = PAGINATION_TOTAL;

  // Mock API call that simulates network latency
  let apiCallCount = 0;
  const mockApiCall = async (start: number, count: number): Promise<{ id: number }[]> => {
    apiCallCount++;
    // Simulate network latency (100-200ms)
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 100));
    return Array(count)
      .fill(null)
      .map((_, i) => ({ id: start + i }));
  };

  // Sequential pagination
  apiCallCount = 0;
  const seqResult = await measure(() =>
    paginate(mockApiCall, { maxResults: totalToFetch, pageSize })
  );
  const seqCalls = apiCallCount;

  // Parallel pagination
  apiCallCount = 0;
  const parResult = await measure(() =>
    paginateParallel(mockApiCall, totalToFetch, {
      maxResults: totalToFetch,
      pageSize,
      concurrency: 3,
      batchDelay: 50,
    })
  );
  const parCalls = apiCallCount;

  const speedup = seqResult.timeMs / parResult.timeMs;

  console.log(`\nFetching ${totalToFetch} items (pageSize=${pageSize}):`);
  console.log(`  Sequential: ${formatMs(seqResult.timeMs)} (${seqCalls} API calls)`);
  console.log(`  Parallel:   ${formatMs(parResult.timeMs)} (${parCalls} API calls)`);
  console.log(`  Speedup: ${speedup.toFixed(1)}x faster with parallel`);
  console.log(`  Items fetched: sequential=${seqResult.result.length}, parallel=${parResult.result.length}`);
}

/**
 * Benchmark 3: Real API Search Performance
 *
 * Test actual search performance against Tableau Public API
 */
async function benchmarkRealSearch(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 3: Real API Search Performance");
  console.log("=".repeat(60));

  clearAllCaches();

  const query = "data visualization";
  const times: number[] = [];

  console.log(`\nSearching for "${query}" (${REPEAT_COUNT + 1} times)...`);

  // First request (cold)
  const firstResult = await measure(() =>
    cachedGet<{ results?: unknown[] }>("/api/search/query", {
      query,
      type: "vizzes",
      count: 20,
      start: 0,
    })
  );
  times.push(firstResult.timeMs);
  console.log(`  Request 1 (cold): ${formatMs(firstResult.timeMs)} - ${firstResult.result?.results?.length || 0} results`);

  // Subsequent requests (warm)
  for (let i = 0; i < REPEAT_COUNT; i++) {
    const result = await measure(() =>
      cachedGet<{ results?: unknown[] }>("/api/search/query", {
        query,
        type: "vizzes",
        count: 20,
        start: 0,
      })
    );
    times.push(result.timeMs);
    console.log(`  Request ${i + 2} (warm): ${formatMs(result.timeMs)}`);
  }

  const stats = calculateStats(times);
  console.log(`\nSummary:`);
  console.log(`  Average: ${formatMs(stats.avg)}`);
  console.log(`  Min: ${formatMs(stats.min)}, Max: ${formatMs(stats.max)}`);
}

/**
 * Benchmark 4: Cache Statistics Summary
 */
async function printCacheStats(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("CACHE STATISTICS SUMMARY");
  console.log("=".repeat(60));

  const allStats = getAllCacheStats();

  for (const [name, stats] of Object.entries(allStats)) {
    if (stats.hits > 0 || stats.misses > 0) {
      console.log(`\n${name.toUpperCase()} Cache:`);
      console.log(`  Size: ${stats.size} entries`);
      console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}`);
      console.log(`  Hit Rate: ${stats.hitRate.toFixed(1)}%`);
      console.log(`  Evictions: ${stats.evictions}`);
    }
  }
}

/**
 * Run all benchmarks
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Tableau Public MCP Server Performance Benchmark        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);

  try {
    await benchmarkCaching();
    await benchmarkPagination();
    await benchmarkRealSearch();
    await printCacheStats();

    console.log("\n" + "=".repeat(60));
    console.log("BENCHMARK COMPLETE");
    console.log("=".repeat(60));
    console.log(`\nFinished at: ${new Date().toISOString()}`);
  } catch (error) {
    console.error("\nBenchmark failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
