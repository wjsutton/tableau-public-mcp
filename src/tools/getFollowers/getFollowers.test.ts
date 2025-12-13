/**
 * Tests for getFollowers tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFollowersTool } from "./getFollowers.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
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

    vi.mocked(cachedGet).mockResolvedValueOnce(mockFollowers);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("follower1");
    expect(responseText).toContain("follower2");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/followers/testuser",
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
      "/profile/api/followers/testuser",
      { index: 48, count: 24 }
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

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
