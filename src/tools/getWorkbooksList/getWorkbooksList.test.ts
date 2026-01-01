/**
 * Tests for getWorkbooksList tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbooksListTool } from "./getWorkbooksList.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
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

    // Mock the API response structure with contents array
    vi.mocked(cachedGet).mockResolvedValueOnce({ contents: mockWorkbooks });

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Dashboard 1");
    expect(responseText).toContain("Dashboard 2");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/workbooks",
      {
        profileName: "testuser",
        start: 0,
        count: 50,
        visibility: "NON_HIDDEN"
      }
    );
  });

  it("should support custom pagination parameters", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ contents: [] });

    await tool.callback({
      username: "testuser",
      start: 50,
      count: 25,
      visibility: "ALL"
    });

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/workbooks",
      {
        profileName: "testuser",
        start: 50,
        count: 25,
        visibility: "ALL"
      }
    );
  });

  it("should handle API response with array format (backward compatibility)", async () => {
    const mockWorkbooks = [
      { title: "Dashboard 1", views: 1000 }
    ];

    // Mock direct array response (legacy format)
    vi.mocked(cachedGet).mockResolvedValueOnce(mockWorkbooks);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Dashboard 1");
  });

  it("should handle API response with missing contents property", async () => {
    // Mock response without contents property
    vi.mocked(cachedGet).mockResolvedValueOnce({ current: 0, next: 50 });

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    // Should return empty array when contents is missing
    const responseText = value.content[0].text;
    expect(responseText).toContain("Retrieved 0 workbooks");
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

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
