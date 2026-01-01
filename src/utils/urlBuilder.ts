/**
 * URL Builder Utility
 *
 * Constructs direct URLs for viewing Tableau Public visualizations.
 * Provides a centralized, defensive approach to URL construction that handles
 * various edge cases and inconsistent API response formats.
 */

import { getConfig } from "../config.js";

export interface DirectUrlParams {
  authorProfileName: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl?: string;
  viewName?: string;
}

/**
 * Constructs a direct URL to view a Tableau Public visualization
 *
 * URL Format: {baseURL}/app/profile/{author}/viz/{workbook}/{view}
 *
 * Handles various edge cases:
 * - workbookRepoUrl with or without username prefix
 * - defaultViewRepoUrl with /sheets/ separator or direct view name
 * - Missing optional fields (returns null)
 *
 * @param params - URL construction parameters
 * @param params.authorProfileName - Author's profile name (username)
 * @param params.workbookRepoUrl - Workbook repository URL (may include username prefix)
 * @param params.defaultViewRepoUrl - Optional default view repository URL
 * @param params.viewName - Optional explicit view name (overrides extraction)
 * @returns Direct URL string, or null if required data is missing
 *
 * @example
 * ```typescript
 * constructDirectUrl({
 *   authorProfileName: "gbolahan.adebayo",
 *   workbookRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070",
 *   defaultViewRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070/sheets/InsightsOverview"
 * })
 * // Returns: "https://public.tableau.com/app/profile/gbolahan.adebayo/viz/MarketingCampaignPerformanceDashboard_17164464702070/InsightsOverview"
 * ```
 */
export function constructDirectUrl(params: DirectUrlParams): string | null {
  const config = getConfig();
  const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl, viewName } = params;

  // Validate required fields
  if (!authorProfileName || !workbookRepoUrl) {
    return null;
  }

  // Defensive: Handle case where workbookRepoUrl might include username prefix
  // Real API should return just the workbook name, but handle both formats
  // Example: "username/workbook" → "workbook"
  let workbookName = workbookRepoUrl;
  if (workbookRepoUrl.includes('/')) {
    const parts = workbookRepoUrl.split('/');
    workbookName = parts[parts.length - 1] || workbookRepoUrl;
  }

  // Extract or use provided view name
  let finalViewName = viewName;
  if (!finalViewName && defaultViewRepoUrl) {
    // Try /sheets/ separator first (most common format)
    // Example: "WorkbookName/sheets/ViewName" → "ViewName"
    const sheetsParts = defaultViewRepoUrl.split('/sheets/');
    if (sheetsParts.length > 1) {
      finalViewName = sheetsParts[1];
    } else {
      // Fallback: take last segment after final slash
      // Example: "username/workbook/ViewName" → "ViewName"
      const segments = defaultViewRepoUrl.split('/');
      finalViewName = segments[segments.length - 1] || '';
    }
  }

  // If we still don't have a view name, cannot construct URL
  if (!finalViewName) {
    return null;
  }

  return `${config.baseURL}/app/profile/${authorProfileName}/viz/${workbookName}/${finalViewName}`;
}
