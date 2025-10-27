/**
 * Tests for getWorkbookDetails tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookDetailsTool } from "./getWorkbookDetails.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getWorkbookDetails", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookDetailsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookDetailsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_details");
    expect(tool.description).toContain("detailed metadata");
    expect(tool.annotations?.title).toBe("Get Workbook Details");
  });

  it("should fetch workbook details successfully", async () => {
    const mockDetails = {
      title: "Sales Dashboard",
      description: "A comprehensive sales analysis",
      views: ["Dashboard", "Summary"],
      author: "testuser"
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockDetails,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({ workbookUrl: "testuser/sales-dashboard" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("Sales Dashboard");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/single_workbook/testuser/sales-dashboard"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/single_workbook/testuser/nonexistent" },
      isAxiosError: true
    };

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookUrl: "testuser/nonexistent" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(true);
    }
  });
});
