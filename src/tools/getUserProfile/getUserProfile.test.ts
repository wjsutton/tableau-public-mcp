/**
 * Tests for getUserProfile tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getUserProfileTool } from "./getUserProfile.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getUserProfile", () => {
  let server: Server;
  let tool: ReturnType<typeof getUserProfileTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getUserProfileTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_user_profile");
    expect(tool.description).toContain("profile information");
    expect(tool.annotations?.title).toBe("Get User Profile");
  });

  it("should fetch user profile successfully", async () => {
    const mockProfile = {
      displayName: "Test User",
      username: "testuser",
      workbookCount: 10,
      followers: 100,
      following: 50,
      favorites: 25
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockProfile);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    expect(value.content[0].type).toBe("text");
    const responseText = value.content[0].text;
    expect(responseText).toContain("Test User");
    expect(responseText).toContain("testuser");

    expect(cachedGet).toHaveBeenCalledWith("/profile/api/testuser");
  });

  it("should handle 404 errors for non-existent users", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/nonexistent" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });

  it("should handle network errors", async () => {
    const error = {
      request: {},
      config: { url: "/profile/api/testuser" },
      isAxiosError: true,
      message: "Network Error"
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });

  it("should validate username parameter", () => {
    const schema = tool.paramsSchema;
    expect(() => {
      z.object(schema).parse({ username: "" });
    }).toThrow();
  });
});
