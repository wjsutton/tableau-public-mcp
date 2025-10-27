/**
 * Tests for getFollowers tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFollowersTool } from "./getFollowers.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getFollowers", () => {
  let server: Server;
  let tool: ReturnType<typeof getFollowersTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getFollowersTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_followers");
    expect(tool.description).toContain("followers");
    expect(tool.annotations?.title).toBe("Get Followers");
  });

  it("should fetch followers successfully", async () => {
    const mockFollowers = [
      { username: "follower1", displayName: "Follower One" },
      { username: "follower2", displayName: "Follower Two" }
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockFollowers,
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
      expect(responseText).toContain("follower1");
      expect(responseText).toContain("follower2");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/followers/testuser",
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
      "/profile/api/followers/testuser",
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
      config: { url: "/profile/api/followers/nonexistent" },
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
