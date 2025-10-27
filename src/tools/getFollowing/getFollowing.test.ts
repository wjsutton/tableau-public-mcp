/**
 * Tests for getFollowing tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFollowingTool } from "./getFollowing.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
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

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockFollowing,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({ username: "testuser" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("following1");
      expect(responseText).toContain("following2");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/following/testuser",
      {
        params: {
          index: 0,
          count: 24
        }
      }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [],
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({
      username: "testuser",
      index: 48,
      count: 24
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/following/testuser",
      {
        params: {
          index: 48,
          count: 24
        }
      }
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

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(true);
    }
  });
});
