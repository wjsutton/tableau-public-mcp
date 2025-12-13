/**
 * Tests for getFollowing tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFollowingTool } from "./getFollowing.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getFollowing", () => {
  let server: Server;
  let tool: ReturnType<typeof getFollowingTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getFollowingTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_following");
    expect(tool.description).toContain("following");
    expect(tool.annotations?.title).toBe("Get Following");
  });

  it("should fetch following accounts successfully", async () => {
    const mockFollowing = [
      { username: "following1", displayName: "Following One" },
      { username: "following2", displayName: "Following Two" }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockFollowing);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("following1");
    expect(responseText).toContain("following2");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/following/testuser",
      { index: 0, count: 24 }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce([]);

    await tool.callback({
      username: "testuser",
      index: 48,
      count: 24
    });

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/following/testuser",
      { index: 48, count: 24 }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/following/nonexistent" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
