/**
 * Tests for getWorkbooksList tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbooksListTool } from "./getWorkbooksList.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getWorkbooksList", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbooksListTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbooksListTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbooks_list");
    expect(tool.description).toContain("workbooks");
    expect(tool.annotations?.title).toBe("Get Workbooks List");
  });

  it("should fetch workbooks with default parameters", async () => {
    const mockWorkbooks = [
      { title: "Dashboard 1", views: 1000 },
      { title: "Dashboard 2", views: 500 }
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockWorkbooks,
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
      expect(responseText).toContain("Dashboard 1");
      expect(responseText).toContain("Dashboard 2");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/workbooks",
      {
        params: {
          profileName: "testuser",
          start: 0,
          count: 50,
          visibility: "NON_HIDDEN"
        }
      }
    );
  });

  it("should support custom pagination parameters", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [],
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({
      username: "testuser",
      start: 50,
      count: 25,
      visibility: "ALL"
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/workbooks",
      {
        params: {
          profileName: "testuser",
          start: 50,
          count: 25,
          visibility: "ALL"
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
      config: { url: "/public/apis/workbooks" },
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
