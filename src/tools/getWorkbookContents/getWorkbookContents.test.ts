/**
 * Tests for getWorkbookContents tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookContentsTool } from "./getWorkbookContents.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getWorkbookContents", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookContentsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookContentsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_contents");
    expect(tool.description).toContain("structure");
    expect(tool.annotations?.title).toBe("Get Workbook Contents");
  });

  it("should fetch workbook contents successfully", async () => {
    const mockContents = {
      sheets: [
        { name: "Dashboard 1", type: "dashboard" },
        { name: "Sheet 1", type: "sheet" }
      ]
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockContents,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({ workbookUrl: "testuser/workbook" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("Dashboard 1");
      expect(responseText).toContain("Sheet 1");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/profile/api/workbook/testuser/workbook"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/workbook/testuser/nonexistent" },
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
