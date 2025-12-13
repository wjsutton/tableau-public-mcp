/**
 * Image Tools Performance Benchmark
 *
 * Tests image URL generation and actual image fetching performance
 * across recent Viz of the Day (VOTD) entries.
 *
 * Tests:
 * 1. Full-size PNG image URLs
 * 2. Size parameter effectiveness (does :size=W,H work?)
 * 3. Thumbnail URL availability
 * 4. Token estimation and MCP limit analysis
 *
 * Run with: npx tsx src/benchmark/imageBenchmark.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import { getConfig } from "../config.js";

// Configuration
const TEST_COUNT = 20; // Number of VOTDs to test
const MCP_TOKEN_LIMIT = 25000; // Default MCP tool response limit

interface VotdEntry {
  authorProfileName: string;
  title: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl: string;
  curatedImageUrl?: string;
  curatedAt?: string;
}

interface ImageTestResult {
  votdTitle: string;
  workbookRepoUrl: string;
  canonicalWorkbookName: string;
  viewName: string;
  tests: {
    fullSizePng: UrlTestResult;
    withSizeParam: UrlTestResult;
    thumbnail: UrlTestResult;
    staticThumbnail: UrlTestResult;
    // New tests with canonical name (numeric suffix removed)
    thumbnailCanonical: UrlTestResult;
    staticThumbnailCanonical: UrlTestResult;
  };
}

interface UrlTestResult {
  url: string;
  status: number;
  contentLength: number;
  loadTimeMs: number;
  estimatedTokens: number;
  exceedsMcpLimit: boolean;
  error?: string;
}

/**
 * Measure HTTP HEAD request to get content info
 */
async function testImageUrl(url: string): Promise<UrlTestResult> {
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const loadTimeMs = performance.now() - start;
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    // Estimate tokens: base64 encoding adds ~33% overhead, then ~4 chars per token
    const base64Size = contentLength * 1.33;
    const estimatedTokens = Math.ceil(base64Size / 4);

    return {
      url,
      status: response.status,
      contentLength,
      loadTimeMs,
      estimatedTokens,
      exceedsMcpLimit: estimatedTokens > MCP_TOKEN_LIMIT
    };
  } catch (error) {
    const loadTimeMs = performance.now() - start;
    return {
      url,
      status: 0,
      contentLength: 0,
      loadTimeMs,
      estimatedTokens: 0,
      exceedsMcpLimit: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract view name from defaultViewRepoUrl
 * Format: "workbookRepoUrl/sheets/ViewName"
 */
function extractViewName(defaultViewRepoUrl: string): string {
  const parts = defaultViewRepoUrl.split('/sheets/');
  return parts.length > 1 ? parts[1] : defaultViewRepoUrl;
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format milliseconds for display
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Derive canonical workbook name by removing numeric suffix
 * e.g., "olympic_ages_17646104017530" -> "olympic_ages"
 */
function getCanonicalWorkbookName(workbookRepoUrl: string): string {
  return workbookRepoUrl.replace(/_\d{10,}$/, '');
}

/**
 * Test all image URL types for a single VOTD
 */
async function testVotdImages(votd: VotdEntry): Promise<ImageTestResult> {
  const config = getConfig();
  const baseURL = config.baseURL;
  const workbookRepoUrl = votd.workbookRepoUrl;
  const viewName = extractViewName(votd.defaultViewRepoUrl);
  const firstTwoLetters = workbookRepoUrl.substring(0, 2);

  // Derive canonical name (without numeric suffix)
  const canonicalName = getCanonicalWorkbookName(workbookRepoUrl);
  const canonicalFirstTwoLetters = canonicalName.substring(0, 2);

  // Construct different URL types
  const fullSizeUrl = `${baseURL}/views/${workbookRepoUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;
  const withSizeUrl = `${baseURL}/views/${workbookRepoUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n&:size=800,600`;

  // Old approach: using full workbookRepoUrl (with numeric suffix)
  const thumbUrl = `${baseURL}/thumb/views/${workbookRepoUrl}/${viewName}`;
  const staticThumbUrl = `${baseURL}/static/images/${firstTwoLetters}/${workbookRepoUrl}/${viewName}/4_3.png`;

  // New approach: using canonical name (without numeric suffix)
  const thumbUrlCanonical = `${baseURL}/thumb/views/${canonicalName}/${viewName}`;
  const staticThumbUrlCanonical = `${baseURL}/static/images/${canonicalFirstTwoLetters}/${canonicalName}/${viewName}/4_3.png`;

  // Test all URLs in parallel
  const [fullSize, withSize, thumb, staticThumb, thumbCanonical, staticThumbCanonical] = await Promise.all([
    testImageUrl(fullSizeUrl),
    testImageUrl(withSizeUrl),
    testImageUrl(thumbUrl),
    testImageUrl(staticThumbUrl),
    testImageUrl(thumbUrlCanonical),
    testImageUrl(staticThumbUrlCanonical)
  ]);

  return {
    votdTitle: votd.title,
    workbookRepoUrl,
    canonicalWorkbookName: canonicalName,
    viewName,
    tests: {
      fullSizePng: fullSize,
      withSizeParam: withSize,
      thumbnail: thumb,
      staticThumbnail: staticThumb,
      thumbnailCanonical: thumbCanonical,
      staticThumbnailCanonical: staticThumbCanonical
    }
  };
}

/**
 * Fetch recent VOTDs
 */
async function fetchVotds(count: number): Promise<VotdEntry[]> {
  const allVotds: VotdEntry[] = [];
  const pageSize = 12; // Tableau API only accepts 12
  const pagesNeeded = Math.ceil(count / pageSize);

  for (let page = 0; page < pagesNeeded && allVotds.length < count; page++) {
    const data = await cachedGet<VotdEntry[]>(
      "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
      { page, limit: 12 }
    );
    if (data) {
      allVotds.push(...data);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }

  return allVotds.slice(0, count);
}

/**
 * Main benchmark function
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║         Image Tools Performance Benchmark                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`Testing ${TEST_COUNT} recent VOTDs`);
  console.log(`MCP Token Limit: ${MCP_TOKEN_LIMIT.toLocaleString()}`);

  // Fetch VOTDs
  console.log("\n" + "=".repeat(70));
  console.log("FETCHING VOTD DATA");
  console.log("=".repeat(70));

  const votds = await fetchVotds(TEST_COUNT);
  console.log(`✓ Fetched ${votds.length} VOTDs`);

  // Test each VOTD
  console.log("\n" + "=".repeat(70));
  console.log("TESTING IMAGE URLs");
  console.log("=".repeat(70));

  const results: ImageTestResult[] = [];

  for (let i = 0; i < votds.length; i++) {
    const votd = votds[i];
    process.stdout.write(`\n[${i + 1}/${votds.length}] ${votd.title.substring(0, 40)}... `);

    try {
      const result = await testVotdImages(votd);
      results.push(result);

      const fullSize = result.tests.fullSizePng;
      if (fullSize.status === 200) {
        console.log(`✓ ${formatBytes(fullSize.contentLength)} (${fullSize.estimatedTokens.toLocaleString()} tokens)`);
      } else {
        console.log(`✗ Status ${fullSize.status}`);
      }
    } catch (error) {
      console.log(`✗ Error: ${error}`);
    }

    // Small delay between tests
    await new Promise(r => setTimeout(r, 200));
  }

  // Analyze results
  console.log("\n" + "=".repeat(70));
  console.log("RESULTS ANALYSIS");
  console.log("=".repeat(70));

  // Full-size PNG stats
  const fullSizeResults = results.map(r => r.tests.fullSizePng);
  const fullSizeSuccess = fullSizeResults.filter(r => r.status === 200);
  const fullSizeExceedLimit = fullSizeSuccess.filter(r => r.exceedsMcpLimit);

  console.log("\n📊 FULL-SIZE PNG (.png):");
  console.log(`   Success rate: ${fullSizeSuccess.length}/${results.length} (${((fullSizeSuccess.length/results.length)*100).toFixed(1)}%)`);
  if (fullSizeSuccess.length > 0) {
    const sizes = fullSizeSuccess.map(r => r.contentLength);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const avgTokens = fullSizeSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / fullSizeSuccess.length;
    const avgTime = fullSizeSuccess.reduce((a, r) => a + r.loadTimeMs, 0) / fullSizeSuccess.length;

    console.log(`   Size: avg=${formatBytes(avgSize)}, min=${formatBytes(minSize)}, max=${formatBytes(maxSize)}`);
    console.log(`   Tokens: avg=${Math.round(avgTokens).toLocaleString()}`);
    console.log(`   Load time: avg=${formatMs(avgTime)}`);
    console.log(`   ⚠️  Exceed MCP limit (${MCP_TOKEN_LIMIT.toLocaleString()}): ${fullSizeExceedLimit.length}/${fullSizeSuccess.length} (${((fullSizeExceedLimit.length/fullSizeSuccess.length)*100).toFixed(1)}%)`);
  }

  // Size parameter comparison
  const withSizeResults = results.map(r => r.tests.withSizeParam);
  const withSizeSuccess = withSizeResults.filter(r => r.status === 200);

  console.log("\n📐 WITH :size=800,600 PARAMETER:");
  console.log(`   Success rate: ${withSizeSuccess.length}/${results.length}`);
  if (fullSizeSuccess.length > 0 && withSizeSuccess.length > 0) {
    // Compare sizes
    let sameSize = 0;
    let different = 0;
    for (let i = 0; i < results.length; i++) {
      const full = results[i].tests.fullSizePng;
      const withSize = results[i].tests.withSizeParam;
      if (full.status === 200 && withSize.status === 200) {
        if (full.contentLength === withSize.contentLength) {
          sameSize++;
        } else {
          different++;
        }
      }
    }
    console.log(`   Same size as full: ${sameSize}/${sameSize + different}`);
    console.log(`   Different size: ${different}/${sameSize + different}`);
    if (sameSize > different) {
      console.log(`   ⚠️  :size parameter appears to be IGNORED by Tableau Public`);
    }
  }

  // Thumbnail stats
  const thumbResults = results.map(r => r.tests.thumbnail);
  const thumbSuccess = thumbResults.filter(r => r.status === 200);

  console.log("\n🖼️  THUMBNAIL (/thumb/views/...) [OLD - with suffix]:");
  console.log(`   Success rate: ${thumbSuccess.length}/${results.length} (${((thumbSuccess.length/results.length)*100).toFixed(1)}%)`);
  if (thumbSuccess.length > 0) {
    const avgSize = thumbSuccess.reduce((a, r) => a + r.contentLength, 0) / thumbSuccess.length;
    const avgTokens = thumbSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / thumbSuccess.length;
    console.log(`   Size: avg=${formatBytes(avgSize)}`);
    console.log(`   Tokens: avg=${Math.round(avgTokens).toLocaleString()}`);
    const exceedLimit = thumbSuccess.filter(r => r.exceedsMcpLimit);
    console.log(`   Exceed MCP limit: ${exceedLimit.length}/${thumbSuccess.length}`);
  }

  // Static thumbnail stats
  const staticResults = results.map(r => r.tests.staticThumbnail);
  const staticSuccess = staticResults.filter(r => r.status === 200);

  console.log("\n📁 STATIC THUMBNAIL (/static/images/...) [OLD - with suffix]:");
  console.log(`   Success rate: ${staticSuccess.length}/${results.length} (${((staticSuccess.length/results.length)*100).toFixed(1)}%)`);
  if (staticSuccess.length > 0) {
    const avgSize = staticSuccess.reduce((a, r) => a + r.contentLength, 0) / staticSuccess.length;
    const avgTokens = staticSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / staticSuccess.length;
    console.log(`   Size: avg=${formatBytes(avgSize)}`);
    console.log(`   Tokens: avg=${Math.round(avgTokens).toLocaleString()}`);
  }

  // NEW: Canonical name thumbnail stats
  console.log("\n" + "─".repeat(70));
  console.log("CANONICAL NAME FIX (numeric suffix removed)");
  console.log("─".repeat(70));

  const thumbCanonicalResults = results.map(r => r.tests.thumbnailCanonical);
  const thumbCanonicalSuccess = thumbCanonicalResults.filter(r => r.status === 200);

  console.log("\n🖼️  THUMBNAIL CANONICAL (/thumb/views/...) [NEW - without suffix]:");
  console.log(`   Success rate: ${thumbCanonicalSuccess.length}/${results.length} (${((thumbCanonicalSuccess.length/results.length)*100).toFixed(1)}%)`);
  console.log(`   Improvement: ${thumbSuccess.length} → ${thumbCanonicalSuccess.length} (+${thumbCanonicalSuccess.length - thumbSuccess.length})`);
  if (thumbCanonicalSuccess.length > 0) {
    const avgSize = thumbCanonicalSuccess.reduce((a, r) => a + r.contentLength, 0) / thumbCanonicalSuccess.length;
    const avgTokens = thumbCanonicalSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / thumbCanonicalSuccess.length;
    console.log(`   Size: avg=${formatBytes(avgSize)}`);
    console.log(`   Tokens: avg=${Math.round(avgTokens).toLocaleString()}`);
  }

  const staticCanonicalResults = results.map(r => r.tests.staticThumbnailCanonical);
  const staticCanonicalSuccess = staticCanonicalResults.filter(r => r.status === 200);

  console.log("\n📁 STATIC THUMBNAIL CANONICAL (/static/images/...) [NEW - without suffix]:");
  console.log(`   Success rate: ${staticCanonicalSuccess.length}/${results.length} (${((staticCanonicalSuccess.length/results.length)*100).toFixed(1)}%)`);
  console.log(`   Improvement: ${staticSuccess.length} → ${staticCanonicalSuccess.length} (+${staticCanonicalSuccess.length - staticSuccess.length})`);
  if (staticCanonicalSuccess.length > 0) {
    const avgSize = staticCanonicalSuccess.reduce((a, r) => a + r.contentLength, 0) / staticCanonicalSuccess.length;
    const avgTokens = staticCanonicalSuccess.reduce((a, r) => a + r.estimatedTokens, 0) / staticCanonicalSuccess.length;
    console.log(`   Size: avg=${formatBytes(avgSize)}`);
    console.log(`   Tokens: avg=${Math.round(avgTokens).toLocaleString()}`);
  }

  // Show which workbooks had canonical name different from original
  const withSuffix = results.filter(r => r.canonicalWorkbookName !== r.workbookRepoUrl);
  console.log(`\n   Workbooks with numeric suffix removed: ${withSuffix.length}/${results.length}`);
  if (withSuffix.length > 0 && withSuffix.length <= 5) {
    withSuffix.forEach(r => {
      console.log(`   - ${r.workbookRepoUrl} → ${r.canonicalWorkbookName}`);
    });
  }

  // Summary and recommendations
  console.log("\n" + "=".repeat(70));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(70));

  const exceedRate = fullSizeSuccess.length > 0
    ? (fullSizeExceedLimit.length / fullSizeSuccess.length * 100).toFixed(0)
    : 0;

  const thumbImprovement = thumbCanonicalSuccess.length - thumbSuccess.length;
  const staticImprovement = staticCanonicalSuccess.length - staticSuccess.length;

  console.log(`
1. FULL-SIZE PNG IMAGES:
   - ${exceedRate}% exceed the MCP 25K token limit
   - Should NOT be returned as base64 in MCP responses
   - Safe to return URL only (let client decide how to fetch)

2. :size PARAMETER:
   - Does NOT work on Tableau Public (ignored)
   - Cannot use URL parameters to reduce image size

3. THUMBNAIL ENDPOINTS (OLD - with numeric suffix):
   - /thumb/views/... success rate: ${((thumbSuccess.length/results.length)*100).toFixed(0)}%
   - /static/images/... success rate: ${((staticSuccess.length/results.length)*100).toFixed(0)}%

4. THUMBNAIL ENDPOINTS (NEW - canonical name, suffix removed):
   - /thumb/views/... success rate: ${((thumbCanonicalSuccess.length/results.length)*100).toFixed(0)}% (+${thumbImprovement})
   - /static/images/... success rate: ${((staticCanonicalSuccess.length/results.length)*100).toFixed(0)}% (+${staticImprovement})
   ${staticImprovement > 0 ? '✅ CANONICAL NAME FIX IMPROVES SUCCESS RATE!' : '⚠️  No improvement with canonical name fix'}

5. SUGGESTED IMPLEMENTATION:
   - Keep tools as URL generators (current approach)
   - Use canonical workbook name (remove _\\d{10,}$ suffix) for thumbnails
   - Add clear warnings about image sizes in tool descriptions
`);

  // Print failures for debugging
  const failures = fullSizeResults.filter(r => r.status !== 200);
  if (failures.length > 0) {
    console.log("\n" + "=".repeat(70));
    console.log(`FAILURES (${failures.length})`);
    console.log("=".repeat(70));
    failures.slice(0, 5).forEach((f, i) => {
      const result = results.find(r => r.tests.fullSizePng === f);
      console.log(`${i + 1}. ${result?.votdTitle || 'Unknown'}`);
      console.log(`   Status: ${f.status}`);
      console.log(`   URL: ${f.url}`);
      if (f.error) console.log(`   Error: ${f.error}`);
    });
  }

  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nFinished at: ${new Date().toISOString()}`);
}

// Run benchmark
main().catch(console.error);
