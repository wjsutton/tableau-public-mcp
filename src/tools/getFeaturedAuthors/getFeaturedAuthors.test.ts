/**
 * Tests for getFeaturedAuthors tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFeaturedAuthorsTool } from "./getFeaturedAuthors.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
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
    expect(tool.description).toContain("featured authors");
    expect(tool.annotations?.title).toBe("Get Featured Authors");
  });

  it("should fetch featured authors successfully", async () => {
    const mockAuthors = {
      authors: [
        { profileName: "author1", bio: "Data viz expert" },
        { profileName: "author2", bio: "Analytics specialist" }
      ]
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockAuthors,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("author1");
      expect(responseText).toContain("Data viz expert");
    }

    expect(apiClient.get).toHaveBeenCalledWith("/s/authors/list/feed");
  });

  it("should handle empty authors list", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { authors: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
    }
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 503,
        statusText: "Service Unavailable"
      },
      config: { url: "/s/authors/list/feed" },
      isAxiosError: true
    };

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const result = await tool.callback({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(true);
    }
  });
});
