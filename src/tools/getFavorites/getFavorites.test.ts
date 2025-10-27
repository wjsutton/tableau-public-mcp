/**
 * Tests for getFavorites tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFavoritesTool } from "./getFavorites.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getFavorites", () => {
  let server: Server;
  let tool: ReturnType<typeof getFavoritesTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getFavoritesTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_favorites");
    expect(tool.description).toContain("favorites");
    expect(tool.annotations?.title).toBe("Get Favorites");
  });

  it("should fetch favorites successfully", async () => {
    const mockFavorites = [
      "user1/dashboard-1",
      "user2/dashboard-2",
      "user3/dashboard-3"
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockFavorites,
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
      expect(responseText).toContain("user1/dashboard-1");
      expect(responseText).toContain("user2/dashboard-2");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/favorite/testuser/workbook"
    );
  });

  it("should handle empty favorites list", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [],
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({ username: "testuser" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
    }
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/favorite/nonexistent/workbook" },
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
