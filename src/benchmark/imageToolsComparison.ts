/**
 * Image Tools Comparison Benchmark
 *
 * Compares performance between:
 * - get_workbook_image (URL generation only)
 * - get_workbook_image_optimized (fetch + resize + compress)
 *
 * Tests against recent VOTDs to measure:
 * - Response time
 * - Output size (bytes/tokens)
 * - Success rate
 * - MCP token limit compliance
 *
 * Run with: npx tsx src/benchmark/imageToolsComparison.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import { fetchAndOptimizeImage } from "../utils/imageProcessing.js";
import { getConfig } from "../config.js";

// Configuration
const TEST_COUNT = 10;
const MCP_TOKEN_LIMIT = 25000;

interface VotdEntry {
  title: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl: string;
}

interface ToolResult {
  tool: string;
  votdTitle: string;
  success: boolean;
  timeMs: number;
  outputSizeBytes: number;
  estimatedTokens: number;
  withinMcpLimit: boolean;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Test get_workbook_image (URL generation only)
 */
async function testGetWorkbookImage(votd: VotdEntry): Promise<ToolResult> {
  const start = performance.now();
  const config = getConfig();
  const viewName = votd.defaultViewRepoUrl.split('/sheets/')[1] || votd.defaultViewRepoUrl;

  try {
    // Simulate what the tool does - just generate URL
    const imageUrl = `${config.baseURL}/views/${votd.workbookRepoUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

    const result = {
      imageUrl,
      workbookUrl: votd.workbookRepoUrl,
      viewName,
      description: "Full-size PNG screenshot of the visualization",
      usage: "This URL can be used directly in <img> tags or downloaded for offline use",
      sizeWarning: "Full-size images are typically 100KB-2MB.",
      estimatedSize: "100KB - 2MB (avg ~500KB)"
    };

    const outputJson = JSON.stringify(result, null, 2);
    const timeMs = performance.now() - start;

    return {
      tool: "get_workbook_image",
      votdTitle: votd.title,
      success: true,
      timeMs,
      outputSizeBytes: outputJson.length,
      estimatedTokens: Math.ceil(outputJson.length / 4),
      withinMcpLimit: true // URL response is always small
    };
  } catch (error) {
    return {
      tool: "get_workbook_image",
      votdTitle: votd.title,
      success: false,
      timeMs: performance.now() - start,
      outputSizeBytes: 0,
      estimatedTokens: 0,
      withinMcpLimit: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test get_workbook_image_optimized (fetch + process)
 */
async function testGetWorkbookImageOptimized(votd: VotdEntry): Promise<ToolResult> {
  const start = performance.now();
  const config = getConfig();
  const viewName = votd.defaultViewRepoUrl.split('/sheets/')[1] || votd.defaultViewRepoUrl;

  try {
    const imageUrl = `${config.baseURL}/views/${votd.workbookRepoUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

    // Fetch and optimize (what the tool actually does)
    const processed = await fetchAndOptimizeImage(imageUrl, {
      maxWidth: 800,
      maxHeight: 600,
      quality: 80,
      format: "jpeg"
    });

    const timeMs = performance.now() - start;

    // The output includes base64 image + metadata
    const metadataSize = 500; // Approximate metadata JSON size
    const totalOutputSize = processed.data.length + metadataSize;
    const estimatedTokens = Math.ceil(totalOutputSize / 4);

    return {
      tool: "get_workbook_image_optimized",
      votdTitle: votd.title,
      success: true,
      timeMs,
      outputSizeBytes: totalOutputSize,
      estimatedTokens,
      withinMcpLimit: estimatedTokens <= MCP_TOKEN_LIMIT
    };
  } catch (error) {
    return {
      tool: "get_workbook_image_optimized",
      votdTitle: votd.title,
      success: false,
      timeMs: performance.now() - start,
      outputSizeBytes: 0,
      estimatedTokens: 0,
      withinMcpLimit: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main benchmark function
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       Image Tools Comparison Benchmark                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`Testing ${TEST_COUNT} VOTDs`);
  console.log(`MCP Token Limit: ${MCP_TOKEN_LIMIT.toLocaleString()}`);

  // Fetch VOTDs
  console.log("\n" + "=".repeat(70));
  console.log("FETCHING VOTD DATA");
  console.log("=".repeat(70));

  const votds = await cachedGet<VotdEntry[]>(
    "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
    { page: 0, limit: 12 }
  );

  if (!votds || votds.length === 0) {
    console.error("Failed to fetch VOTDs");
    return;
  }

  const testVotds = votds.slice(0, TEST_COUNT);
  console.log(`✓ Fetched ${testVotds.length} VOTDs for testing`);

  // Run tests
  console.log("\n" + "=".repeat(70));
  console.log("RUNNING COMPARISON TESTS");
  console.log("=".repeat(70));

  const urlResults: ToolResult[] = [];
  const optimizedResults: ToolResult[] = [];

  for (let i = 0; i < testVotds.length; i++) {
    const votd = testVotds[i];
    console.log(`\n[${i + 1}/${testVotds.length}] ${votd.title.substring(0, 45)}...`);

    // Test URL-only tool
    process.stdout.write("   get_workbook_image: ");
    const urlResult = await testGetWorkbookImage(votd);
    urlResults.push(urlResult);
    console.log(urlResult.success ? `✓ ${formatMs(urlResult.timeMs)}` : `✗ ${urlResult.error}`);

    // Test optimized tool
    process.stdout.write("   get_workbook_image_optimized: ");
    const optResult = await testGetWorkbookImageOptimized(votd);
    optimizedResults.push(optResult);
    if (optResult.success) {
      console.log(`✓ ${formatMs(optResult.timeMs)} (${formatBytes(optResult.outputSizeBytes)}, ${optResult.estimatedTokens.toLocaleString()} tokens)`);
    } else {
      console.log(`✗ ${optResult.error}`);
    }

    // Small delay between tests
    await new Promise(r => setTimeout(r, 100));
  }

  // Calculate statistics
  console.log("\n" + "=".repeat(70));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(70));

  // URL-only tool stats
  const urlSuccess = urlResults.filter(r => r.success);
  const urlAvgTime = urlSuccess.length > 0
    ? urlSuccess.reduce((a, r) => a + r.timeMs, 0) / urlSuccess.length
    : 0;

  console.log("\n📋 get_workbook_image (URL generation only):");
  console.log(`   Success rate: ${urlSuccess.length}/${urlResults.length} (${((urlSuccess.length / urlResults.length) * 100).toFixed(0)}%)`);
  console.log(`   Avg response time: ${formatMs(urlAvgTime)}`);
  console.log(`   Output: URL string (~300 bytes)`);
  console.log(`   MCP limit compliance: 100% (URLs are always small)`);
  console.log(`   Use case: External image access, embedding in HTML`);

  // Optimized tool stats
  const optSuccess = optimizedResults.filter(r => r.success);
  const optAvgTime = optSuccess.length > 0
    ? optSuccess.reduce((a, r) => a + r.timeMs, 0) / optSuccess.length
    : 0;
  const optAvgSize = optSuccess.length > 0
    ? optSuccess.reduce((a, r) => a + r.outputSizeBytes, 0) / optSuccess.length
    : 0;
  const optAvgTokens = optSuccess.length > 0
    ? optSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / optSuccess.length
    : 0;
  const optWithinLimit = optSuccess.filter(r => r.withinMcpLimit).length;

  console.log("\n🖼️  get_workbook_image_optimized (fetch + resize + compress):");
  console.log(`   Success rate: ${optSuccess.length}/${optimizedResults.length} (${((optSuccess.length / optimizedResults.length) * 100).toFixed(0)}%)`);
  console.log(`   Avg response time: ${formatMs(optAvgTime)}`);
  console.log(`   Avg output size: ${formatBytes(optAvgSize)}`);
  console.log(`   Avg tokens: ${Math.round(optAvgTokens).toLocaleString()}`);
  console.log(`   MCP limit compliance: ${optWithinLimit}/${optSuccess.length} (${((optWithinLimit / optSuccess.length) * 100).toFixed(0)}%)`);
  console.log(`   Use case: Inline image display in MCP responses`);

  // Comparison
  console.log("\n" + "=".repeat(70));
  console.log("COMPARISON");
  console.log("=".repeat(70));

  const speedDiff = optAvgTime / urlAvgTime;
  console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│ Metric                    │ URL-only        │ Optimized             │
├─────────────────────────────────────────────────────────────────────┤
│ Response Time             │ ${formatMs(urlAvgTime).padEnd(15)} │ ${formatMs(optAvgTime).padEnd(21)} │
│ Speed                     │ Instant         │ ${speedDiff.toFixed(0)}x slower (network)   │
│ Output Size               │ ~300 bytes      │ ${formatBytes(optAvgSize).padEnd(21)} │
│ Est. Tokens               │ ~75             │ ${Math.round(optAvgTokens).toLocaleString().padEnd(21)} │
│ Returns Actual Image      │ No (URL only)   │ Yes (base64 data)     │
│ MCP Limit Safe            │ Always          │ ${((optWithinLimit / optSuccess.length) * 100).toFixed(0)}% of images        │
│ Requires Network (client) │ Yes             │ No                    │
└─────────────────────────────────────────────────────────────────────┘
`);

  // Recommendations
  console.log("=".repeat(70));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(70));
  console.log(`
✅ Use get_workbook_image when:
   - Speed is critical (instant response)
   - Client will fetch image externally
   - Embedding URL in HTML/markdown
   - Image size doesn't matter

✅ Use get_workbook_image_optimized when:
   - Need actual image data in MCP response
   - Want to display image inline
   - Must stay within MCP token limits
   - Willing to wait ${formatMs(optAvgTime)} for processing
`);

  // Detailed results table
  console.log("=".repeat(70));
  console.log("DETAILED RESULTS");
  console.log("=".repeat(70));
  console.log("\nOptimized tool results:");
  console.log("─".repeat(70));

  for (const result of optimizedResults) {
    const status = result.success
      ? (result.withinMcpLimit ? "✓" : "⚠️")
      : "✗";
    const sizeInfo = result.success
      ? `${formatBytes(result.outputSizeBytes)} / ${result.estimatedTokens.toLocaleString()} tokens`
      : result.error || "Failed";
    console.log(`${status} ${result.votdTitle.substring(0, 35).padEnd(35)} │ ${formatMs(result.timeMs).padEnd(8)} │ ${sizeInfo}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nFinished at: ${new Date().toISOString()}`);
}

main().catch(console.error);
