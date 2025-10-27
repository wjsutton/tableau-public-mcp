/**
 * Tests for getUserProfileCategories tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getUserProfileCategoriesTool } from "./getUserProfileCategories.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getUserProfileCategories", () => {
  let server: Server;
  let tool: ReturnType<typeof getUserProfileCategoriesTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getUserProfileCategoriesTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_user_profile_categories");
    expect(tool.description).toContain("categories");
    expect(tool.annotations?.title).toBe("Get User Profile Categories");
  });

  it("should fetch user categories successfully", async () => {
    const mockCategories = {
      categories: [
        {
          name: "Data Visualizations",
          workbooks: [
            { title: "Sales Dashboard", views: 1000 }
          ]
        },
        {
          name: "Analytics",
          workbooks: [
            { title: "Customer Analysis", views: 500 }
          ]
        }
      ]
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockCategories,
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
      expect(responseText).toContain("Data Visualizations");
      expect(responseText).toContain("Analytics");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/bff/v1/author/testuser/categories",
      {
        params: {
          startIndex: 0,
          pageSize: 500
        }
      }
    );
  });

  it("should support custom pagination parameters", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { categories: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({
      username: "testuser",
      startIndex: 10,
      pageSize: 50
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/bff/v1/author/testuser/categories",
      {
        params: {
          startIndex: 10,
          pageSize: 50
        }
      }
    );
  });

  it("should handle errors gracefully", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/public/apis/bff/v1/author/nonexistent/categories" },
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
