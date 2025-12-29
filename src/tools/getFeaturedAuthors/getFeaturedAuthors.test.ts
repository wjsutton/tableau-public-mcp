/**
 * Tests for getFeaturedAuthors tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFeaturedAuthorsTool } from "./getFeaturedAuthors.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getFeaturedAuthors", () => {
  let server: Server;
  let tool: ReturnType<typeof getFeaturedAuthorsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getFeaturedAuthorsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_featured_authors");
    expect(tool.description).toContain("community groups");
    expect(tool.annotations?.title).toBe("Get Featured Authors");
  });

  it("should fetch tableau visionaries (default) successfully", async () => {
    const mockAuthors = {
      authors: [
        { profileName: "author1", bio: "Data viz expert" },
        { profileName: "author2", bio: "Analytics specialist" }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockAuthors);

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const firstContent = value.content[0];
    expect(firstContent.type).toBe("text");
    if (firstContent.type === "text") {
      expect(firstContent.text).toContain("author1");
      expect(firstContent.text).toContain("Data viz expert");
    }

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v3/authors/tableau-visionaries",
      { startIndex: 0, limit: 12 }
    );
  });

  it("should handle empty authors list", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ authors: [] });

    const result = await tool.callback({ group: "tableau-visionaries" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
  });

  it("should handle errors for tableau visionaries", async () => {
    const error = {
      response: {
        status: 503,
        statusText: "Service Unavailable"
      },
      config: { url: "/public/apis/bff/discover/v3/authors/tableau-visionaries" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ group: "tableau-visionaries" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });

  it("should fetch hall of fame visionaries with pagination", async () => {
    const mockAuthors = {
      authors: [
        { profileName: "legend1", bio: "Tableau legend" }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockAuthors);

    const result = await tool.callback({
      group: "hall-of-fame-visionaries",
      startIndex: 0,
      limit: 1
    });

    expect(result.isOk()).toBe(true);
    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v3/authors/hall-of-fame-visionaries",
      { startIndex: 0, limit: 1 }
    );
  });

  it("should fetch tableau ambassadors without pagination parameters", async () => {
    const mockAuthors = {
      authors: [
        { profileName: "ambassador1", bio: "Tableau Ambassador" }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockAuthors);

    const result = await tool.callback({
      group: "tableau-ambassadors-north-america"
    });

    expect(result.isOk()).toBe(true);

    // CRITICAL: Verify pagination params are NOT passed
    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v1/author_channels/tableau-ambassadors-north-america",
      undefined
    );
  });

  it("should support custom pagination for tableau visionaries", async () => {
    const mockAuthors = { authors: [] };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockAuthors);

    await tool.callback({
      group: "tableau-visionaries",
      startIndex: 12,
      limit: 12
    });

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v3/authors/tableau-visionaries",
      { startIndex: 12, limit: 12 }
    );
  });

  it("should handle errors for ambassadors endpoint", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/public/apis/bff/discover/v1/author_channels/tableau-ambassadors-north-america" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({
      group: "tableau-ambassadors-north-america"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
