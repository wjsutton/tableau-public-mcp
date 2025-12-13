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

    vi.mocked(cachedGet).mockResolvedValueOnce(mockAuthors);

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("author1");
    expect(responseText).toContain("Data viz expert");

    expect(cachedGet).toHaveBeenCalledWith("/s/authors/list/feed");
  });

  it("should handle empty authors list", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ authors: [] });

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
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

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
