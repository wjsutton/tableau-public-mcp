/**
 * Tests for getUserProfileBasic tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getUserProfileBasicTool } from "./getUserProfileBasic.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
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

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockProfile,
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
      expect(responseText).toContain("testuser");
      expect(responseText).toContain("Test User");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/authors",
      {
        params: {
          profileName: "testuser"
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
      config: { url: "/public/apis/authors" },
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
