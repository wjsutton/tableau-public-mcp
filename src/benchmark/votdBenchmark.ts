/**
 * Performance Benchmark Script for Viz of the Day (VOTD)
 *
 * Tests and compares:
 * 1. Getting the last 100 VOTDs (sequential vs parallel)
 * 2. Finding all VOTDs in a specific month (e.g., October 2024)
 * 3. Cache hit performance for repeated queries
 *
 * Run with: npx tsx src/benchmark/votdBenchmark.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import {
  getAllCacheStats,
  clearAllCaches,
  getDiscoveryCache,
} from "../utils/cache.js";
import { paginateByPage, paginateByPageParallel } from "../utils/pagination.js";

// Benchmark configuration
const VOTD_PAGE_SIZE = 12;
const TARGET_VOTD_COUNT = 100;
const FILTER_MONTH = 10; // October
const FILTER_YEAR = 2024;

interface VotdEntry {
  title?: string;
  authorDisplayName?: string;
  curatedAt?: string;
  viewCount?: number;
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
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Fetch a single page of VOTD data
 * Note: Tableau API requires limit=12 exactly
 */
async function fetchVotdPage(page: number, _limit: number): Promise<VotdEntry[]> {
  // Tableau API only accepts limit=12
  // API returns array directly, not { vizzes: [...] }
  const data = await cachedGet<VotdEntry[]>(
    "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
    { page, limit: 12 }
  );
  return data || [];
}

/**
 * Benchmark 1: Sequential vs Parallel - Get Last 100 VOTDs
 */
async function benchmarkLast100VOTDs(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 1: Get Last 100 VOTDs");
  console.log("=".repeat(60));

  clearAllCaches();

  // Sequential pagination
  console.log("\nSequential pagination...");
  const seqResult = await measure(async () => {
    return await paginateByPage(
      fetchVotdPage,
      { maxResults: TARGET_VOTD_COUNT, pageSize: VOTD_PAGE_SIZE }
    );
  });

  clearAllCaches(); // Clear cache for fair comparison

  // Parallel pagination
  console.log("Parallel pagination...");
  const parResult = await measure(async () => {
    return await paginateByPageParallel(
      fetchVotdPage,
      TARGET_VOTD_COUNT,
      { maxResults: TARGET_VOTD_COUNT, pageSize: VOTD_PAGE_SIZE, concurrency: 3 }
    );
  });

  const speedup = seqResult.timeMs / parResult.timeMs;
  const pagesNeeded = Math.ceil(TARGET_VOTD_COUNT / VOTD_PAGE_SIZE);

  console.log(`\nResults (${TARGET_VOTD_COUNT} VOTDs, ${pagesNeeded} pages):`);
  console.log(`  Sequential: ${formatMs(seqResult.timeMs)} (${seqResult.result.length} items)`);
  console.log(`  Parallel:   ${formatMs(parResult.timeMs)} (${parResult.result.length} items)`);
  console.log(`  Speedup: ${speedup.toFixed(1)}x faster with parallel`);

  // Show sample data
  if (parResult.result.length > 0) {
    const latest = parResult.result[0] as VotdEntry;
    console.log(`\n  Latest VOTD: "${latest.title}" by ${latest.authorDisplayName}`);
    console.log(`  Featured: ${latest.curatedAt}`);
  }
}

/**
 * Benchmark 2: Filter VOTDs by Month
 */
async function benchmarkFilterByMonth(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log(`BENCHMARK 2: Find All VOTDs in ${FILTER_MONTH}/${FILTER_YEAR}`);
  console.log("=".repeat(60));

  clearAllCaches();

  // Fetch enough data to cover the target month
  // VOTD has ~30 per month, so we need ~300 to cover ~10 months back
  const fetchCount = 400;
  const monthName = new Date(FILTER_YEAR, FILTER_MONTH - 1).toLocaleString('default', { month: 'long' });

  console.log(`\nFetching ${fetchCount} VOTDs to find ${monthName} ${FILTER_YEAR} entries...`);

  const result = await measure(async () => {
    const allVotds = await paginateByPageParallel(
      fetchVotdPage,
      fetchCount,
      { maxResults: fetchCount, pageSize: VOTD_PAGE_SIZE, concurrency: 3 }
    );

    // Filter by month
    const filtered = allVotds.filter((viz: VotdEntry) => {
      const dateStr = viz.curatedAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getMonth() + 1 === FILTER_MONTH && date.getFullYear() === FILTER_YEAR;
    });

    return { all: allVotds, filtered };
  });

  console.log(`\nResults:`);
  console.log(`  Total fetched: ${result.result.all.length} VOTDs`);
  console.log(`  Time: ${formatMs(result.timeMs)}`);
  console.log(`  Found ${result.result.filtered.length} VOTDs in ${monthName} ${FILTER_YEAR}`);

  // Show samples
  if (result.result.filtered.length > 0) {
    console.log(`\n  Sample ${monthName} VOTDs:`);
    const samples = result.result.filtered.slice(0, 3);
    for (const viz of samples) {
      const v = viz as VotdEntry;
      console.log(`    - "${v.title}" (${v.curatedAt})`);
    }
  }
}

/**
 * Benchmark 3: Cache Performance for Repeated Queries
 */
async function benchmarkCachePerformance(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 3: Cache Performance (Repeated Queries)");
  console.log("=".repeat(60));

  clearAllCaches();

  const coldTimes: number[] = [];
  const warmTimes: number[] = [];
  const pages = [0, 1, 2, 3, 4]; // First 5 pages

  // Cold cache - fetch each page
  console.log("\nCold cache (first fetch)...");
  for (const page of pages) {
    const cold = await measure(() => fetchVotdPage(page, VOTD_PAGE_SIZE));
    coldTimes.push(cold.timeMs);
  }

  // Warm cache - fetch same pages again
  console.log("Warm cache (cached fetch)...");
  for (const page of pages) {
    const warm = await measure(() => fetchVotdPage(page, VOTD_PAGE_SIZE));
    warmTimes.push(warm.timeMs);
  }

  const avgCold = coldTimes.reduce((a, b) => a + b, 0) / coldTimes.length;
  const avgWarm = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;
  const speedup = avgCold / avgWarm;

  console.log(`\nResults (${pages.length} pages):`);
  console.log(`  Cold Cache (API): avg=${formatMs(avgCold)}, min=${formatMs(Math.min(...coldTimes))}, max=${formatMs(Math.max(...coldTimes))}`);
  console.log(`  Warm Cache:       avg=${formatMs(avgWarm)}, min=${formatMs(Math.min(...warmTimes))}, max=${formatMs(Math.max(...warmTimes))}`);
  console.log(`  Speedup: ${speedup.toFixed(0)}x faster with cache`);

  const stats = getDiscoveryCache().getStats();
  console.log(`\n  Cache Stats: ${stats.hits} hits, ${stats.misses} misses (${stats.hitRate.toFixed(1)}% hit rate)`);
}

/**
 * Benchmark 4: Full Month Extraction with Cache Warmup
 */
async function benchmarkCachedMonthExtraction(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 4: Cached Month Extraction (Warm vs Cold)");
  console.log("=".repeat(60));

  clearAllCaches();
  const fetchCount = 200;
  const monthName = new Date(FILTER_YEAR, FILTER_MONTH - 1).toLocaleString('default', { month: 'long' });

  // First run - cold cache
  console.log(`\nFirst extraction (cold cache)...`);
  const coldResult = await measure(async () => {
    const allVotds = await paginateByPageParallel(
      fetchVotdPage,
      fetchCount,
      { maxResults: fetchCount, pageSize: VOTD_PAGE_SIZE, concurrency: 3 }
    );
    return allVotds.filter((viz: VotdEntry) => {
      const dateStr = viz.curatedAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getMonth() + 1 === FILTER_MONTH && date.getFullYear() === FILTER_YEAR;
    });
  });

  // Second run - warm cache
  console.log("Second extraction (warm cache)...");
  const warmResult = await measure(async () => {
    const allVotds = await paginateByPageParallel(
      fetchVotdPage,
      fetchCount,
      { maxResults: fetchCount, pageSize: VOTD_PAGE_SIZE, concurrency: 3 }
    );
    return allVotds.filter((viz: VotdEntry) => {
      const dateStr = viz.curatedAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getMonth() + 1 === FILTER_MONTH && date.getFullYear() === FILTER_YEAR;
    });
  });

  const speedup = coldResult.timeMs / warmResult.timeMs;

  console.log(`\nResults for ${monthName} ${FILTER_YEAR}:`);
  console.log(`  Cold cache: ${formatMs(coldResult.timeMs)} (${coldResult.result.length} VOTDs found)`);
  console.log(`  Warm cache: ${formatMs(warmResult.timeMs)} (${warmResult.result.length} VOTDs found)`);
  console.log(`  Speedup: ${speedup.toFixed(0)}x faster on second run`);
}

/**
 * Print final cache statistics
 */
function printCacheStats(): void {
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
  console.log("║      Viz of the Day (VOTD) Performance Benchmark           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);

  try {
    await benchmarkLast100VOTDs();
    await benchmarkFilterByMonth();
    await benchmarkCachePerformance();
    await benchmarkCachedMonthExtraction();
    printCacheStats();

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
