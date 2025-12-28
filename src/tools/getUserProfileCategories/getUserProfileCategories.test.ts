/**
 * Tests for getUserProfileCategories tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getUserProfileCategoriesTool } from "./getUserProfileCategories.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
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

    vi.mocked(cachedGet).mockResolvedValueOnce(mockCategories);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Data Visualizations");
    expect(responseText).toContain("Analytics");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/v1/author/testuser/categories",
      { startIndex: 0, pageSize: 500 }
    );
  });

  it("should support custom pagination parameters", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ categories: [] });

    await tool.callback({
      username: "testuser",
      startIndex: 10,
      pageSize: 50
    });

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/v1/author/testuser/categories",
      { startIndex: 10, pageSize: 50 }
    );
  });

  it("should return empty categories on 404 (user has no categories)", async () => {
    const { AxiosError } = await import("axios");
    const error = new AxiosError(
      "Not Found",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 404,
        statusText: "Not Found",
        data: {},
        headers: {},
        config: {} as never
      }
    );

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "userWithoutCategories" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("categories");
    expect(responseText).toContain("[]");
    expect(responseText).toContain("get_workbooks_list");
  });

  it("should handle other errors gracefully", async () => {
    const { AxiosError } = await import("axios");
    const error = new AxiosError(
      "Server Error",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 500,
        statusText: "Internal Server Error",
        data: {},
        headers: {},
        config: {} as never
      }
    );

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
