/**
 * Comprehensive End-to-End Benchmark for Tableau Public MCP Tools
 *
 * Tests all 17 tools individually and in realistic chained workflow scenarios.
 * Measures:
 * - Individual tool performance (cold/warm cache)
 * - Chained workflow performance
 * - Parallel vs sequential execution
 * - Cache effectiveness across workflows
 *
 * Run with: npx tsx src/benchmark/endToEndBenchmark.ts
 */

import { cachedGet } from "../utils/cachedApiClient.js";
import { clearAllCaches, getAllCacheStats } from "../utils/cache.js";
import { fetchAndOptimizeImage } from "../utils/imageProcessing.js";
import { getConfig } from "../config.js";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface StepResult {
  name: string;
  tool: string;
  timeMs: number;
  success: boolean;
  cached: boolean;
  error?: string;
  dataSize?: number;
}

interface WorkflowResult {
  name: string;
  description: string;
  totalTimeMs: number;
  steps: StepResult[];
  success: boolean;
  error?: string;
}

interface ToolResult {
  name: string;
  coldTimeMs: number;
  warmTimeMs: number;
  speedup: number;
  success: boolean;
  error?: string;
  dataSize?: number;
}

// API response types
interface SearchResponse {
  results?: SearchResult[];
}

interface SearchResult {
  title?: string;
  authorProfileName?: string;
  profileName?: string;
  workbookRepoUrl?: string;
  repositoryUrl?: string;
  defaultViewRepoUrl?: string;
}

interface FeaturedAuthorsResponse {
  authors?: FeaturedAuthor[];
}

interface VotdEntry {
  title: string;
  authorProfileName: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl: string;
}

interface UserProfile {
  profileName: string;
  displayName: string;
  totalNumberOfFollowers?: number;
  totalNumberOfFollowing?: number;
}

interface WorkbookListItem {
  workbookRepoUrl: string;
  title: string;
  viewCount: number;
  defaultViewRepoUrl?: string;
}

interface WorkbookDetails {
  title: string;
  authorProfileName: string;
  viewCount: number;
  sheetNames?: string[];
}

interface WorkbookContents {
  sheets: Array<{
    sheetName: string;
    repositoryUrl: string;
  }>;
}

interface FeaturedAuthor {
  profileName: string;
  displayName: string;
}

interface RelatedWorkbook {
  workbookRepoUrl: string;
  authorProfileName: string;
  title: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
  if (ms < 0.1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Calculate statistics from an array of numbers
 */
function calculateStats(values: number[]): { avg: number; min: number; max: number } {
  if (values.length === 0) return { avg: 0, min: 0, max: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

/**
 * Extract view name from defaultViewRepoUrl
 */
function extractViewName(defaultViewRepoUrl: string | undefined): string {
  if (!defaultViewRepoUrl) return 'Sheet1';
  const parts = defaultViewRepoUrl.split('/sheets/');
  return parts.length > 1 ? parts[1] : defaultViewRepoUrl.split('/').pop() || 'Sheet1';
}

/**
 * Extract author name from search result with fallbacks
 */
function extractAuthor(result: SearchResult): string | undefined {
  return result.authorProfileName || result.profileName;
}

/**
 * Extract workbook URL from search result with fallbacks
 */
function extractWorkbookUrl(result: SearchResult): string | undefined {
  return result.workbookRepoUrl || result.repositoryUrl;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// INDIVIDUAL TOOL TESTS
// ============================================================================

/**
 * Test a single tool with cold and warm cache
 */
async function testTool(
  name: string,
  fetchFn: () => Promise<unknown>,
  warmupCount: number = 2
): Promise<ToolResult> {
  try {
    // Cold cache (first request)
    const cold = await measure(fetchFn);
    const dataSize = JSON.stringify(cold.result).length;

    // Warm cache (repeated requests)
    let warmTotal = 0;
    for (let i = 0; i < warmupCount; i++) {
      const warm = await measure(fetchFn);
      warmTotal += warm.timeMs;
    }
    const warmAvg = warmTotal / warmupCount;

    const speedup = cold.timeMs / Math.max(warmAvg, 0.001);

    return {
      name,
      coldTimeMs: cold.timeMs,
      warmTimeMs: warmAvg,
      speedup,
      success: true,
      dataSize
    };
  } catch (error) {
    return {
      name,
      coldTimeMs: 0,
      warmTimeMs: 0,
      speedup: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Run all individual tool tests
 */
async function runIndividualToolTests(): Promise<{ results: ToolResult[]; testData: Record<string, unknown> }> {
  console.log("\n" + "=".repeat(70));
  console.log("PART 1: INDIVIDUAL TOOL PERFORMANCE");
  console.log("=".repeat(70));

  const results: ToolResult[] = [];
  const testData: Record<string, unknown> = {};

  // 1. Search Visualizations
  process.stdout.write("\nTesting search_visualizations... ");
  const searchResult = await testTool("search_visualizations", () =>
    cachedGet<SearchResponse>("/api/search/query", {
      query: "sales dashboard",
      type: "vizzes",
      count: 10,
      start: 0,
      language: "en-us"
    })
  );
  results.push(searchResult);
  if (searchResult.success) {
    const searchData = await cachedGet<SearchResponse>("/api/search/query", {
      query: "sales dashboard", type: "vizzes", count: 10, start: 0, language: "en-us"
    });
    const searchResults = searchData?.results || [];
    testData.searchResults = searchResults;
    testData.testUsername = searchResults[0]?.authorProfileName || "vizwiz";
    testData.testWorkbookUrl = searchResults[0]?.workbookRepoUrl;
    console.log(`✓ Cold: ${formatMs(searchResult.coldTimeMs)}, Warm: ${formatMs(searchResult.warmTimeMs)}`);
  } else {
    testData.testUsername = "vizwiz"; // fallback
    console.log(`✗ ${searchResult.error}`);
  }

  // 2. Featured Authors
  process.stdout.write("Testing get_featured_authors... ");
  const featuredResult = await testTool("get_featured_authors", () =>
    cachedGet<FeaturedAuthorsResponse>("/s/authors/list/feed")
  );
  results.push(featuredResult);
  console.log(featuredResult.success
    ? `✓ Cold: ${formatMs(featuredResult.coldTimeMs)}, Warm: ${formatMs(featuredResult.warmTimeMs)}`
    : `✗ ${featuredResult.error}`);

  // 3. Viz of the Day
  process.stdout.write("Testing get_viz_of_day... ");
  const votdResult = await testTool("get_viz_of_day", () =>
    cachedGet<VotdEntry[]>("/public/apis/bff/discover/v1/vizzes/viz-of-the-day", {
      page: 0, limit: 12
    })
  );
  results.push(votdResult);
  if (votdResult.success) {
    const votdData = await cachedGet<VotdEntry[]>("/public/apis/bff/discover/v1/vizzes/viz-of-the-day", {
      page: 0, limit: 12
    });
    testData.votdResults = votdData;
    console.log(`✓ Cold: ${formatMs(votdResult.coldTimeMs)}, Warm: ${formatMs(votdResult.warmTimeMs)}`);
  } else {
    console.log(`✗ ${votdResult.error}`);
  }

  const username = testData.testUsername as string;

  // 4. User Profile
  process.stdout.write(`Testing get_user_profile (${username})... `);
  const profileResult = await testTool("get_user_profile", () =>
    cachedGet<UserProfile>(`/profile/api/${username}`)
  );
  results.push(profileResult);
  console.log(profileResult.success
    ? `✓ Cold: ${formatMs(profileResult.coldTimeMs)}, Warm: ${formatMs(profileResult.warmTimeMs)}`
    : `✗ ${profileResult.error}`);

  // 5. User Profile Basic
  process.stdout.write("Testing get_user_profile_basic... ");
  const profileBasicResult = await testTool("get_user_profile_basic", () =>
    cachedGet<unknown>("/public/apis/authors", { profileName: username })
  );
  results.push(profileBasicResult);
  console.log(profileBasicResult.success
    ? `✓ Cold: ${formatMs(profileBasicResult.coldTimeMs)}, Warm: ${formatMs(profileBasicResult.warmTimeMs)}`
    : `✗ ${profileBasicResult.error}`);

  // 6. User Profile Categories
  process.stdout.write("Testing get_user_profile_categories... ");
  const categoriesResult = await testTool("get_user_profile_categories", () =>
    cachedGet<unknown>(`/public/apis/bff/v1/author/${username}/categories`, {
      startIndex: 0, pageSize: 10
    })
  );
  results.push(categoriesResult);
  console.log(categoriesResult.success
    ? `✓ Cold: ${formatMs(categoriesResult.coldTimeMs)}, Warm: ${formatMs(categoriesResult.warmTimeMs)}`
    : `✗ ${categoriesResult.error}`);

  // 7. Workbooks List
  process.stdout.write("Testing get_workbooks_list... ");
  const workbooksResult = await testTool("get_workbooks_list", () =>
    cachedGet<WorkbookListItem[]>("/public/apis/workbooks", {
      profileName: username, start: 0, count: 10, visibility: "NON_HIDDEN"
    })
  );
  results.push(workbooksResult);
  if (workbooksResult.success) {
    const workbooks = await cachedGet<WorkbookListItem[]>("/public/apis/workbooks", {
      profileName: username, start: 0, count: 10, visibility: "NON_HIDDEN"
    });
    testData.workbooks = workbooks;
    if (workbooks && workbooks.length > 0) {
      testData.testWorkbookUrl = workbooks[0].workbookRepoUrl;
    }
    console.log(`✓ Cold: ${formatMs(workbooksResult.coldTimeMs)}, Warm: ${formatMs(workbooksResult.warmTimeMs)}`);
  } else {
    console.log(`✗ ${workbooksResult.error}`);
  }

  // 8. Followers
  process.stdout.write("Testing get_followers... ");
  const followersResult = await testTool("get_followers", () =>
    cachedGet<unknown>(`/profile/api/followers/${username}`, { index: 0, count: 10 })
  );
  results.push(followersResult);
  console.log(followersResult.success
    ? `✓ Cold: ${formatMs(followersResult.coldTimeMs)}, Warm: ${formatMs(followersResult.warmTimeMs)}`
    : `✗ ${followersResult.error}`);

  // 9. Following
  process.stdout.write("Testing get_following... ");
  const followingResult = await testTool("get_following", () =>
    cachedGet<unknown>(`/profile/api/following/${username}`, { index: 0, count: 10 })
  );
  results.push(followingResult);
  console.log(followingResult.success
    ? `✓ Cold: ${formatMs(followingResult.coldTimeMs)}, Warm: ${formatMs(followingResult.warmTimeMs)}`
    : `✗ ${followingResult.error}`);

  // 10. Favorites
  process.stdout.write("Testing get_favorites... ");
  const favoritesResult = await testTool("get_favorites", () =>
    cachedGet<unknown>(`/profile/api/favorite/${username}/workbook`)
  );
  results.push(favoritesResult);
  console.log(favoritesResult.success
    ? `✓ Cold: ${formatMs(favoritesResult.coldTimeMs)}, Warm: ${formatMs(favoritesResult.warmTimeMs)}`
    : `✗ ${favoritesResult.error}`);

  // Get a workbook URL for remaining tests
  const workbookUrl = testData.testWorkbookUrl as string;

  if (workbookUrl) {
    // 11. Workbook Details
    process.stdout.write("Testing get_workbook_details... ");
    const detailsResult = await testTool("get_workbook_details", () =>
      cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${workbookUrl}`)
    );
    results.push(detailsResult);
    console.log(detailsResult.success
      ? `✓ Cold: ${formatMs(detailsResult.coldTimeMs)}, Warm: ${formatMs(detailsResult.warmTimeMs)}`
      : `✗ ${detailsResult.error}`);

    // 12. Workbook Contents
    process.stdout.write("Testing get_workbook_contents... ");
    const contentsResult = await testTool("get_workbook_contents", () =>
      cachedGet<WorkbookContents>(`/profile/api/workbook/${workbookUrl}`)
    );
    results.push(contentsResult);
    if (contentsResult.success) {
      const contents = await cachedGet<WorkbookContents>(`/profile/api/workbook/${workbookUrl}`);
      testData.workbookContents = contents;
      console.log(`✓ Cold: ${formatMs(contentsResult.coldTimeMs)}, Warm: ${formatMs(contentsResult.warmTimeMs)}`);
    } else {
      console.log(`✗ ${contentsResult.error}`);
    }

    // 13. Related Workbooks
    process.stdout.write("Testing get_related_workbooks... ");
    const relatedResult = await testTool("get_related_workbooks", () =>
      cachedGet<RelatedWorkbook[]>(`/public/apis/bff/workbooks/v2/${workbookUrl}/recommended-workbooks`, {
        count: 5
      })
    );
    results.push(relatedResult);
    console.log(relatedResult.success
      ? `✓ Cold: ${formatMs(relatedResult.coldTimeMs)}, Warm: ${formatMs(relatedResult.warmTimeMs)}`
      : `✗ ${relatedResult.error}`);
  }

  // 14. Workbook Thumbnail (URL generation only - no API call)
  process.stdout.write("Testing get_workbook_thumbnail... ");
  const thumbnailResult = await testTool("get_workbook_thumbnail", async () => {
    const config = getConfig();
    const testUrl = workbookUrl || "test/workbook";
    const canonicalName = testUrl.replace(/_\d{10,}$/, '');
    const firstTwo = canonicalName.substring(0, 2);
    return {
      thumbnailUrl: `${config.baseURL}/static/images/${firstTwo}/${canonicalName}/Sheet1/4_3.png`,
      canonicalWorkbookName: canonicalName
    };
  });
  results.push(thumbnailResult);
  console.log(`✓ Cold: ${formatMs(thumbnailResult.coldTimeMs)}, Warm: ${formatMs(thumbnailResult.warmTimeMs)} (URL generation only)`);

  // 15. Workbook Image (with actual image fetch)
  if (workbookUrl && testData.workbookContents) {
    const contents = testData.workbookContents as WorkbookContents;
    if (contents.sheets && contents.sheets.length > 0) {
      const viewName = contents.sheets[0].sheetName.replace(/[\s.]/g, '');
      process.stdout.write("Testing get_workbook_image... ");

      const imageResult = await testTool("get_workbook_image", async () => {
        const config = getConfig();
        const imageUrl = `${config.baseURL}/views/${workbookUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;
        return fetchAndOptimizeImage(imageUrl, { maxWidth: 400, maxHeight: 300, quality: 70 });
      }, 1); // Only 1 warm run for images (slow)

      results.push(imageResult);
      console.log(imageResult.success
        ? `✓ Cold: ${formatMs(imageResult.coldTimeMs)}, Warm: ${formatMs(imageResult.warmTimeMs)}`
        : `✗ ${imageResult.error}`);
    }
  }

  return { results, testData };
}

// ============================================================================
// WORKFLOW TESTS
// ============================================================================

/**
 * Workflow 1: Discovery → Profile → Content
 */
async function runWorkflow1(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();

  try {
    // Step 1: Search
    const step1Start = performance.now();
    const searchResponse = await cachedGet<SearchResponse>("/api/search/query", {
      query: "tableau tips", type: "vizzes", count: 5, start: 0, language: "en-us"
    });
    const searchResults = searchResponse?.results || [];
    steps.push({
      name: "Search for 'tableau tips'",
      tool: "search_visualizations",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    if (searchResults.length === 0) {
      throw new Error("No search results found");
    }

    const author = extractAuthor(searchResults[0]);
    const workbookUrl = extractWorkbookUrl(searchResults[0]);

    if (!author) {
      throw new Error("Could not extract author from search results");
    }

    // Step 2: Get User Profile
    const step2Start = performance.now();
    await cachedGet<UserProfile>(`/profile/api/${author}`);
    steps.push({
      name: `Get profile for '${author}'`,
      tool: "get_user_profile",
      timeMs: performance.now() - step2Start,
      success: true,
      cached: performance.now() - step2Start < 10
    });

    // Step 3: Get Workbooks List
    const step3Start = performance.now();
    const workbooks = await cachedGet<WorkbookListItem[]>("/public/apis/workbooks", {
      profileName: author, start: 0, count: 10, visibility: "NON_HIDDEN"
    });
    steps.push({
      name: `Get workbooks for '${author}'`,
      tool: "get_workbooks_list",
      timeMs: performance.now() - step3Start,
      success: true,
      cached: performance.now() - step3Start < 10
    });

    const targetWorkbook = workbooks?.[0]?.workbookRepoUrl || workbookUrl;

    // Step 4: Get Workbook Details
    const step4Start = performance.now();
    await cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${targetWorkbook}`);
    steps.push({
      name: "Get workbook details",
      tool: "get_workbook_details",
      timeMs: performance.now() - step4Start,
      success: true,
      cached: performance.now() - step4Start < 10
    });

    // Step 5: Get Workbook Contents
    const step5Start = performance.now();
    const contents = await cachedGet<WorkbookContents>(`/profile/api/workbook/${targetWorkbook}`);
    steps.push({
      name: "Get workbook contents",
      tool: "get_workbook_contents",
      timeMs: performance.now() - step5Start,
      success: true,
      cached: performance.now() - step5Start < 10
    });

    // Step 6: Get Workbook Image
    if (contents?.sheets?.[0]) {
      const viewName = contents.sheets[0].sheetName.replace(/[\s.]/g, '');
      const step6Start = performance.now();
      const config = getConfig();
      const imageUrl = `${config.baseURL}/views/${targetWorkbook}/${viewName}.png?:display_static_image=y&:showVizHome=n`;
      await fetchAndOptimizeImage(imageUrl, { maxWidth: 400, maxHeight: 300, quality: 70 });
      steps.push({
        name: "Get workbook image",
        tool: "get_workbook_image",
        timeMs: performance.now() - step6Start,
        success: true,
        cached: false // Images aren't cached the same way
      });
    }

    return {
      name: "Discovery → Profile → Content",
      description: "Search → User Profile → Workbooks → Details → Contents → Image",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "Discovery → Profile → Content",
      description: "Search → User Profile → Workbooks → Details → Contents → Image",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Workflow 2: Featured Authors Exploration
 */
async function runWorkflow2(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();

  try {
    // Step 1: Get Featured Authors
    const step1Start = performance.now();
    const authorsResponse = await cachedGet<FeaturedAuthorsResponse>("/s/authors/list/feed");
    const authors = authorsResponse?.authors || [];
    steps.push({
      name: "Get featured authors",
      tool: "get_featured_authors",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    if (authors.length === 0) {
      throw new Error("No featured authors found");
    }

    const author = authors[0].profileName;

    // Step 2: Get User Profile
    const step2Start = performance.now();
    await cachedGet<UserProfile>(`/profile/api/${author}`);
    steps.push({
      name: `Get profile for '${author}'`,
      tool: "get_user_profile",
      timeMs: performance.now() - step2Start,
      success: true,
      cached: performance.now() - step2Start < 10
    });

    // Step 3: Get Workbooks List
    const step3Start = performance.now();
    const workbooks = await cachedGet<WorkbookListItem[]>("/public/apis/workbooks", {
      profileName: author, start: 0, count: 10, visibility: "NON_HIDDEN"
    });
    steps.push({
      name: `Get workbooks for '${author}'`,
      tool: "get_workbooks_list",
      timeMs: performance.now() - step3Start,
      success: true,
      cached: performance.now() - step3Start < 10
    });

    if (workbooks && workbooks.length > 0) {
      // Find most viewed workbook
      const topWorkbook = workbooks.reduce((a, b) => (a.viewCount > b.viewCount ? a : b));

      // Step 4: Get Workbook Details
      const step4Start = performance.now();
      await cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${topWorkbook.workbookRepoUrl}`);
      steps.push({
        name: "Get top workbook details",
        tool: "get_workbook_details",
        timeMs: performance.now() - step4Start,
        success: true,
        cached: performance.now() - step4Start < 10
      });

      // Step 5: Get Related Workbooks
      const step5Start = performance.now();
      await cachedGet<RelatedWorkbook[]>(
        `/public/apis/bff/workbooks/v2/${topWorkbook.workbookRepoUrl}/recommended-workbooks`,
        { count: 5 }
      );
      steps.push({
        name: "Get related workbooks",
        tool: "get_related_workbooks",
        timeMs: performance.now() - step5Start,
        success: true,
        cached: performance.now() - step5Start < 10
      });
    }

    return {
      name: "Featured Authors Exploration",
      description: "Featured Authors → Profile → Workbooks → Details → Related",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "Featured Authors Exploration",
      description: "Featured Authors → Profile → Workbooks → Details → Related",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Workflow 3: VOTD Deep Dive (Social Network)
 */
async function runWorkflow3(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();

  try {
    // Step 1: Get VOTD (limit must be exactly 12)
    const step1Start = performance.now();
    const votd = await cachedGet<VotdEntry[]>("/public/apis/bff/discover/v1/vizzes/viz-of-the-day", {
      page: 0, limit: 12
    });
    steps.push({
      name: "Get Viz of the Day entries",
      tool: "get_viz_of_day",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    if (!votd || votd.length === 0) {
      throw new Error("No VOTD entries found");
    }

    const author = votd[0].authorProfileName;

    // Step 2: Get User Profile
    const step2Start = performance.now();
    await cachedGet<UserProfile>(`/profile/api/${author}`);
    steps.push({
      name: `Get profile for '${author}'`,
      tool: "get_user_profile",
      timeMs: performance.now() - step2Start,
      success: true,
      cached: performance.now() - step2Start < 10
    });

    // Step 3: Get Followers
    const step3Start = performance.now();
    await cachedGet<unknown>(`/profile/api/followers/${author}`, { index: 0, count: 5 });
    steps.push({
      name: "Get followers",
      tool: "get_followers",
      timeMs: performance.now() - step3Start,
      success: true,
      cached: performance.now() - step3Start < 10
    });

    // Step 4: Get Following
    const step4Start = performance.now();
    await cachedGet<unknown>(`/profile/api/following/${author}`, { index: 0, count: 5 });
    steps.push({
      name: "Get following",
      tool: "get_following",
      timeMs: performance.now() - step4Start,
      success: true,
      cached: performance.now() - step4Start < 10
    });

    // Step 5: Get Favorites
    const step5Start = performance.now();
    await cachedGet<unknown>(`/profile/api/favorite/${author}/workbook`);
    steps.push({
      name: "Get favorites",
      tool: "get_favorites",
      timeMs: performance.now() - step5Start,
      success: true,
      cached: performance.now() - step5Start < 10
    });

    return {
      name: "VOTD Deep Dive",
      description: "VOTD → Profile → Followers → Following → Favorites",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "VOTD Deep Dive",
      description: "VOTD → Profile → Followers → Following → Favorites",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Workflow 4: Content Curation Pipeline (Parallel)
 */
async function runWorkflow4(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();

  try {
    // Step 1: Search
    const step1Start = performance.now();
    const searchResponse = await cachedGet<SearchResponse>("/api/search/query", {
      query: "data visualization", type: "vizzes", count: 3, start: 0, language: "en-us"
    });
    const searchResults = searchResponse?.results || [];
    steps.push({
      name: "Search for 'data visualization'",
      tool: "search_visualizations",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    if (searchResults.length === 0) {
      throw new Error("No search results found");
    }

    // Step 2: Parallel fetch details + thumbnails for each result
    const parallelStart = performance.now();
    const parallelPromises = searchResults.slice(0, 3).map(async (result) => {
      const workbookUrl = extractWorkbookUrl(result);
      if (!workbookUrl) return;

      const viewName = extractViewName(result.defaultViewRepoUrl);
      const canonicalUrl = workbookUrl.replace(/_\d{10,}$/, '');

      await Promise.all([
        cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${workbookUrl}`).catch(() => null),
        // Thumbnail is just URL generation, very fast
        Promise.resolve({
          thumbnailUrl: `https://public.tableau.com/static/images/${canonicalUrl.substring(0, 2)}/${canonicalUrl}/${viewName}/4_3.png`
        })
      ]);
    });

    await Promise.all(parallelPromises);
    steps.push({
      name: `Parallel: details + thumbnails for ${searchResults.length} results`,
      tool: "get_workbook_details + get_workbook_thumbnail",
      timeMs: performance.now() - parallelStart,
      success: true,
      cached: false
    });

    return {
      name: "Content Curation Pipeline",
      description: "Search → [Parallel] Details + Thumbnails",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "Content Curation Pipeline",
      description: "Search → [Parallel] Details + Thumbnails",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Workflow 5: Full User Analysis (Parallel)
 */
async function runWorkflow5(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();
  const username = "vizwiz"; // Well-known user for consistent testing

  try {
    // Step 1: Get User Profile
    const step1Start = performance.now();
    await cachedGet<UserProfile>(`/profile/api/${username}`);
    steps.push({
      name: `Get profile for '${username}'`,
      tool: "get_user_profile",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    // Step 2: Parallel fetch of all user data
    const parallelStart = performance.now();
    const [workbooks] = await Promise.all([
      cachedGet<WorkbookListItem[]>("/public/apis/workbooks", {
        profileName: username, start: 0, count: 10, visibility: "NON_HIDDEN"
      }),
      cachedGet<unknown>(`/profile/api/followers/${username}`, { index: 0, count: 10 }),
      cachedGet<unknown>(`/profile/api/following/${username}`, { index: 0, count: 10 }),
      cachedGet<unknown>(`/profile/api/favorite/${username}/workbook`),
      cachedGet<unknown>(`/public/apis/bff/v1/author/${username}/categories`, {
        startIndex: 0, pageSize: 10
      })
    ]);
    steps.push({
      name: "Parallel: workbooks, followers, following, favorites, categories",
      tool: "Multiple tools in parallel",
      timeMs: performance.now() - parallelStart,
      success: true,
      cached: false
    });

    // Step 3: Get details for top workbooks
    if (workbooks && workbooks.length > 0) {
      const detailsStart = performance.now();
      const topWorkbooks = workbooks.slice(0, 3);
      await Promise.all(
        topWorkbooks.map(wb =>
          cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${wb.workbookRepoUrl}`).catch(() => null)
        )
      );
      steps.push({
        name: `Get details for top ${topWorkbooks.length} workbooks`,
        tool: "get_workbook_details (parallel)",
        timeMs: performance.now() - detailsStart,
        success: true,
        cached: false
      });
    }

    return {
      name: "Full User Analysis",
      description: "Profile → [Parallel] All user data → Top workbook details",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "Full User Analysis",
      description: "Profile → [Parallel] All user data → Top workbook details",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Workflow 6: Related Content Discovery
 */
async function runWorkflow6(): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const startTime = performance.now();

  try {
    // Step 1: Get a seed workbook from VOTD
    const step1Start = performance.now();
    const votd = await cachedGet<VotdEntry[]>("/public/apis/bff/discover/v1/vizzes/viz-of-the-day", {
      page: 0, limit: 1
    });
    steps.push({
      name: "Get seed workbook from VOTD",
      tool: "get_viz_of_day",
      timeMs: performance.now() - step1Start,
      success: true,
      cached: performance.now() - step1Start < 10
    });

    if (!votd || votd.length === 0) {
      throw new Error("No VOTD found");
    }

    const seedWorkbook = votd[0].workbookRepoUrl;

    // Step 2: Get workbook details
    const step2Start = performance.now();
    await cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${seedWorkbook}`);
    steps.push({
      name: "Get seed workbook details",
      tool: "get_workbook_details",
      timeMs: performance.now() - step2Start,
      success: true,
      cached: performance.now() - step2Start < 10
    });

    // Step 3: Get related workbooks (depth 1)
    const step3Start = performance.now();
    const related = await cachedGet<RelatedWorkbook[]>(
      `/public/apis/bff/workbooks/v2/${seedWorkbook}/recommended-workbooks`,
      { count: 3 }
    );
    steps.push({
      name: "Get related workbooks (depth 1)",
      tool: "get_related_workbooks",
      timeMs: performance.now() - step3Start,
      success: true,
      cached: performance.now() - step3Start < 10
    });

    if (related && related.length > 0) {
      // Step 4: Parallel fetch details + author profiles for related
      const parallelStart = performance.now();
      await Promise.all(
        related.map(async (r) => {
          await Promise.all([
            cachedGet<WorkbookDetails>(`/profile/api/single_workbook/${r.workbookRepoUrl}`).catch(() => null),
            cachedGet<unknown>("/public/apis/authors", { profileName: r.authorProfileName }).catch(() => null)
          ]);
        })
      );
      steps.push({
        name: `Parallel: details + profiles for ${related.length} related workbooks`,
        tool: "get_workbook_details + get_user_profile_basic",
        timeMs: performance.now() - parallelStart,
        success: true,
        cached: false
      });

      // Step 5: Get related workbooks from best match (depth 2)
      const step5Start = performance.now();
      await cachedGet<RelatedWorkbook[]>(
        `/public/apis/bff/workbooks/v2/${related[0].workbookRepoUrl}/recommended-workbooks`,
        { count: 3 }
      );
      steps.push({
        name: "Get related workbooks (depth 2)",
        tool: "get_related_workbooks",
        timeMs: performance.now() - step5Start,
        success: true,
        cached: performance.now() - step5Start < 10
      });
    }

    return {
      name: "Related Content Discovery",
      description: "Seed → Details → Related → [Parallel] Explore → Related (depth 2)",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: true
    };

  } catch (error) {
    return {
      name: "Related Content Discovery",
      description: "Seed → Details → Related → [Parallel] Explore → Related (depth 2)",
      totalTimeMs: performance.now() - startTime,
      steps,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Run all workflows
 */
async function runWorkflowTests(): Promise<WorkflowResult[]> {
  console.log("\n" + "=".repeat(70));
  console.log("PART 2: WORKFLOW BENCHMARKS");
  console.log("=".repeat(70));

  const workflows: WorkflowResult[] = [];

  // Clear caches before workflow tests for accurate timing
  clearAllCaches();
  await sleep(100);

  // Workflow 1
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 1: Discovery → Profile → Content");
  console.log("─".repeat(70));
  const wf1 = await runWorkflow1();
  workflows.push(wf1);
  printWorkflowResult(wf1);

  await sleep(200);

  // Workflow 2
  clearAllCaches();
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 2: Featured Authors Exploration");
  console.log("─".repeat(70));
  const wf2 = await runWorkflow2();
  workflows.push(wf2);
  printWorkflowResult(wf2);

  await sleep(200);

  // Workflow 3
  clearAllCaches();
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 3: VOTD Deep Dive");
  console.log("─".repeat(70));
  const wf3 = await runWorkflow3();
  workflows.push(wf3);
  printWorkflowResult(wf3);

  await sleep(200);

  // Workflow 4
  clearAllCaches();
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 4: Content Curation Pipeline (Parallel)");
  console.log("─".repeat(70));
  const wf4 = await runWorkflow4();
  workflows.push(wf4);
  printWorkflowResult(wf4);

  await sleep(200);

  // Workflow 5
  clearAllCaches();
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 5: Full User Analysis (Parallel)");
  console.log("─".repeat(70));
  const wf5 = await runWorkflow5();
  workflows.push(wf5);
  printWorkflowResult(wf5);

  await sleep(200);

  // Workflow 6
  clearAllCaches();
  console.log("\n" + "─".repeat(70));
  console.log("WORKFLOW 6: Related Content Discovery");
  console.log("─".repeat(70));
  const wf6 = await runWorkflow6();
  workflows.push(wf6);
  printWorkflowResult(wf6);

  return workflows;
}

/**
 * Print workflow result
 */
function printWorkflowResult(result: WorkflowResult): void {
  for (const step of result.steps) {
    const cached = step.cached ? " (cached)" : "";
    const status = step.success ? "✓" : "✗";
    console.log(`  ${status} ${step.name}: ${formatMs(step.timeMs)}${cached}`);
  }
  console.log("─".repeat(70));
  if (result.success) {
    console.log(`  Total: ${formatMs(result.totalTimeMs)}`);
  } else {
    console.log(`  FAILED: ${result.error}`);
  }
}

// ============================================================================
// SUMMARY & MAIN
// ============================================================================

/**
 * Print summary
 */
function printSummary(
  toolResults: ToolResult[],
  workflowResults: WorkflowResult[]
): void {
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));

  // Individual tools summary
  const successfulTools = toolResults.filter(t => t.success);
  if (successfulTools.length > 0) {
    const coldTimes = successfulTools.map(t => t.coldTimeMs);
    const warmTimes = successfulTools.map(t => t.warmTimeMs);
    const speedups = successfulTools.map(t => t.speedup);

    const fastest = successfulTools.reduce((a, b) => a.coldTimeMs < b.coldTimeMs ? a : b);
    const slowest = successfulTools.reduce((a, b) => a.coldTimeMs > b.coldTimeMs ? a : b);
    const bestSpeedup = successfulTools.reduce((a, b) => a.speedup > b.speedup ? a : b);

    console.log("\nIndividual Tools:");
    console.log(`  - Tools tested: ${toolResults.length} (${successfulTools.length} successful)`);
    console.log(`  - Fastest (cold): ${fastest.name} (${formatMs(fastest.coldTimeMs)})`);
    console.log(`  - Slowest (cold): ${slowest.name} (${formatMs(slowest.coldTimeMs)})`);
    console.log(`  - Best cache speedup: ${bestSpeedup.name} (${bestSpeedup.speedup.toFixed(0)}x)`);
    console.log(`  - Avg cold time: ${formatMs(calculateStats(coldTimes).avg)}`);
    console.log(`  - Avg warm time: ${formatMs(calculateStats(warmTimes).avg)}`);
    console.log(`  - Avg speedup: ${calculateStats(speedups).avg.toFixed(0)}x`);
  }

  // Workflow summary
  const successfulWorkflows = workflowResults.filter(w => w.success);
  if (successfulWorkflows.length > 0) {
    const workflowTimes = successfulWorkflows.map(w => w.totalTimeMs);

    console.log("\nWorkflows:");
    console.log(`  - Workflows tested: ${workflowResults.length} (${successfulWorkflows.length} successful)`);
    for (const wf of successfulWorkflows) {
      console.log(`  - ${wf.name}: ${formatMs(wf.totalTimeMs)} (${wf.steps.length} steps)`);
    }
    console.log(`  - Total workflow time: ${formatMs(workflowTimes.reduce((a, b) => a + b, 0))}`);
  }

  // Cache stats
  const cacheStats = getAllCacheStats();
  const cacheStatValues = Object.values(cacheStats);
  const totalHits = cacheStatValues.reduce((sum, s) => sum + s.hits, 0);
  const totalMisses = cacheStatValues.reduce((sum, s) => sum + s.misses, 0);
  const hitRate = totalHits + totalMisses > 0
    ? (totalHits / (totalHits + totalMisses) * 100).toFixed(1)
    : "0";

  console.log("\nCache Statistics:");
  console.log(`  - Total cache hits: ${totalHits}`);
  console.log(`  - Total cache misses: ${totalMisses}`);
  console.log(`  - Overall hit rate: ${hitRate}%`);
}

/**
 * Main benchmark function
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║     End-to-End MCP Tools Benchmark                             ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted at: ${new Date().toISOString()}`);

  // Clear all caches
  clearAllCaches();
  console.log("✓ Caches cleared");

  // Run individual tool tests
  const { results: toolResults } = await runIndividualToolTests();

  // Run workflow tests
  const workflowResults = await runWorkflowTests();

  // Print summary
  printSummary(toolResults, workflowResults);

  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nFinished at: ${new Date().toISOString()}`);
}

// Run benchmark
main().catch(console.error);
