/**
 * Tests for getUserProfileBasic tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getUserProfileBasicTool } from "./getUserProfileBasic.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getUserProfileBasic", () => {
  let server: Server;
  let tool: ReturnType<typeof getUserProfileBasicTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getUserProfileBasicTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_user_profile_basic");
    expect(tool.description).toContain("basic profile");
    expect(tool.annotations?.title).toBe("Get User Profile Basic");
  });

  it("should fetch basic profile successfully", async () => {
    const mockProfile = {
      profileName: "testuser",
      displayName: "Test User"
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockProfile);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("testuser");
    expect(responseText).toContain("Test User");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/authors",
      { profileName: "testuser" }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/public/apis/authors" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
