/**
 * Quick test for the getWorkbookImageOptimized tool
 *
 * Tests the image optimization pipeline against a recent VOTD.
 *
 * Run with: npx tsx src/benchmark/testImageOptimized.ts
 */

import { fetchAndOptimizeImage } from "../utils/imageProcessing.js";
import { cachedGet } from "../utils/cachedApiClient.js";

interface VotdEntry {
  title: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       Test: get_workbook_image_optimized Tool                   ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Fetch a recent VOTD to test with
  console.log("Fetching recent VOTD...");
  const votds = await cachedGet<VotdEntry[]>(
    "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
    { page: 0, limit: 12 }
  );

  if (!votds || votds.length === 0) {
    console.error("Failed to fetch VOTDs");
    return;
  }

  const votd = votds[0];
  const viewName = votd.defaultViewRepoUrl.split('/sheets/')[1] || votd.defaultViewRepoUrl;
  const imageUrl = `https://public.tableau.com/views/${votd.workbookRepoUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

  console.log(`\nTesting with: "${votd.title}"`);
  console.log(`Workbook: ${votd.workbookRepoUrl}`);
  console.log(`View: ${viewName}`);
  console.log(`URL: ${imageUrl}`);

  // Test different optimization settings
  const tests = [
    { name: "Default (800x600, JPEG 80)", options: {} },
    { name: "Small (400x300, JPEG 70)", options: { maxWidth: 400, maxHeight: 300, quality: 70 } },
    { name: "WebP (800x600, 80)", options: { format: "webp" as const, quality: 80 } },
    { name: "High Quality (1200x900, JPEG 90)", options: { maxWidth: 1200, maxHeight: 900, quality: 90 } },
  ];

  console.log("\n" + "=".repeat(70));
  console.log("OPTIMIZATION TESTS");
  console.log("=".repeat(70));

  for (const test of tests) {
    console.log(`\n📷 ${test.name}:`);
    try {
      const start = performance.now();
      const result = await fetchAndOptimizeImage(imageUrl, test.options);
      const elapsed = performance.now() - start;

      console.log(`   Original:    ${formatBytes(result.originalSize)}`);
      console.log(`   Processed:   ${formatBytes(result.processedSize)}`);
      console.log(`   Dimensions:  ${result.width}x${result.height}`);
      console.log(`   Compression: ${result.compressionRatio.toFixed(1)}x`);
      console.log(`   Est. Tokens: ${result.estimatedTokens.toLocaleString()}`);
      console.log(`   Time:        ${elapsed.toFixed(0)}ms`);

      const withinLimit = result.estimatedTokens <= 25000;
      console.log(`   MCP Limit:   ${withinLimit ? "✓ Within limit" : "⚠️ EXCEEDS limit"}`);
    } catch (error) {
      console.log(`   ✗ Error: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("TEST COMPLETE");
  console.log("=".repeat(70));
}

main().catch(console.error);
