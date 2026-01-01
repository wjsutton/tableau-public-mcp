/**
 * Tests for URL Builder Utility
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { constructDirectUrl } from "./urlBuilder.js";

// Mock the config module
vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({
    baseURL: "https://public.tableau.com",
    logLevel: "info",
    cacheEnabled: true,
    maxResultLimit: 1000,
    apiTimeout: 30000,
    cacheMaxEntries: 1000,
    cacheDefaultTTL: 300000,
    maxConcurrency: 3,
    batchDelayMs: 100,
  }))
}));

describe("constructDirectUrl", () => {
  describe("standard case - workbookRepoUrl without username", () => {
    it("should construct valid URL with /sheets/ separator", () => {
      const result = constructDirectUrl({
        authorProfileName: "gbolahan.adebayo",
        workbookRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070",
        defaultViewRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070/sheets/InsightsOverview"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/gbolahan.adebayo/viz/MarketingCampaignPerformanceDashboard_17164464702070/InsightsOverview"
      );
    });

    it("should handle view names with spaces (URL encoded)", () => {
      const result = constructDirectUrl({
        authorProfileName: "wjsutton",
        workbookRepoUrl: "TestWorkbook_12345",
        defaultViewRepoUrl: "TestWorkbook_12345/sheets/Dashboard%201"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/wjsutton/viz/TestWorkbook_12345/Dashboard%201"
      );
    });

    it("should handle view names with special characters", () => {
      const result = constructDirectUrl({
        authorProfileName: "analyst",
        workbookRepoUrl: "SalesDashboard_99999",
        defaultViewRepoUrl: "SalesDashboard_99999/sheets/Dashboard(1)"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/analyst/viz/SalesDashboard_99999/Dashboard(1)"
      );
    });
  });

  describe("defensive case - workbookRepoUrl with username prefix", () => {
    it("should extract workbook name when username prefix is present", () => {
      const result = constructDirectUrl({
        authorProfileName: "tableau.user",
        workbookRepoUrl: "tableau.user/COVID-19Dashboard",
        defaultViewRepoUrl: "tableau.user/COVID-19Dashboard/Overview"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/tableau.user/viz/COVID-19Dashboard/Overview"
      );
    });

    it("should handle nested path separators", () => {
      const result = constructDirectUrl({
        authorProfileName: "user",
        workbookRepoUrl: "user/subfolder/workbook",
        defaultViewRepoUrl: "user/subfolder/workbook/sheets/MainView"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/user/viz/workbook/MainView"
      );
    });
  });

  describe("view name extraction fallback", () => {
    it("should extract view name from last segment when no /sheets/ separator", () => {
      const result = constructDirectUrl({
        authorProfileName: "data.analyst",
        workbookRepoUrl: "COVIDAnalysis",
        defaultViewRepoUrl: "data.analyst/COVIDAnalysis/RegionalView"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/data.analyst/viz/COVIDAnalysis/RegionalView"
      );
    });

    it("should use explicit viewName parameter when provided", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        viewName: "ExplicitView"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/author/viz/Workbook/ExplicitView"
      );
    });

    it("should prioritize explicit viewName over defaultViewRepoUrl", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: "Workbook/sheets/DefaultView",
        viewName: "ExplicitView"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/author/viz/Workbook/ExplicitView"
      );
    });
  });

  describe("edge cases and error handling", () => {
    it("should return null when authorProfileName is missing", () => {
      const result = constructDirectUrl({
        authorProfileName: "",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      expect(result).toBeNull();
    });

    it("should return null when workbookRepoUrl is missing", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      expect(result).toBeNull();
    });

    it("should return null when view name cannot be extracted", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: ""
      });

      expect(result).toBeNull();
    });

    it("should return null when defaultViewRepoUrl is undefined and no viewName", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook"
      });

      expect(result).toBeNull();
    });

    it("should handle workbookRepoUrl that is only slashes", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "///",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      // Should fall back to original workbookRepoUrl when extraction fails
      expect(result).toBe(
        "https://public.tableau.com/app/profile/author/viz//////View"
      );
    });
  });

  describe("real-world examples from spec", () => {
    it("should construct URL for Marketing Campaign Performance Dashboard example", () => {
      const result = constructDirectUrl({
        authorProfileName: "gbolahan.adebayo",
        workbookRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070",
        defaultViewRepoUrl: "MarketingCampaignPerformanceDashboard_17164464702070/sheets/InsightsOverview"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/gbolahan.adebayo/viz/MarketingCampaignPerformanceDashboard_17164464702070/InsightsOverview"
      );
    });

    it("should construct URL for Paid Media Analysis example", () => {
      const result = constructDirectUrl({
        authorProfileName: "keyrus",
        workbookRepoUrl: "PaidMediaAnalysisKeyrus",
        defaultViewRepoUrl: "PaidMediaAnalysisKeyrus/sheets/PaidMediaAnalysisOverview"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/keyrus/viz/PaidMediaAnalysisKeyrus/PaidMediaAnalysisOverview"
      );
    });
  });

  describe("URL format validation", () => {
    it("should always use baseURL from config", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      expect(result).toContain("https://public.tableau.com");
    });

    it("should always include /app/profile/ in path", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      expect(result).toContain("/app/profile/");
    });

    it("should always include /viz/ before workbook name", () => {
      const result = constructDirectUrl({
        authorProfileName: "author",
        workbookRepoUrl: "Workbook",
        defaultViewRepoUrl: "Workbook/sheets/View"
      });

      expect(result).toContain("/viz/");
    });

    it("should construct URL with correct segment order", () => {
      const result = constructDirectUrl({
        authorProfileName: "testauthor",
        workbookRepoUrl: "TestWorkbook",
        defaultViewRepoUrl: "TestWorkbook/sheets/TestView"
      });

      expect(result).toBe(
        "https://public.tableau.com/app/profile/testauthor/viz/TestWorkbook/TestView"
      );
    });
  });
});
