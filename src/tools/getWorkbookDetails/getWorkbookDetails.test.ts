/**
 * Tests for getWorkbookDetails tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookDetailsTool } from "./getWorkbookDetails.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
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

    vi.mocked(cachedGet).mockResolvedValueOnce(mockDetails);

    const result = await tool.callback({ workbookUrl: "testuser/sales-dashboard" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Sales Dashboard");

    expect(cachedGet).toHaveBeenCalledWith(
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

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookUrl: "testuser/nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
