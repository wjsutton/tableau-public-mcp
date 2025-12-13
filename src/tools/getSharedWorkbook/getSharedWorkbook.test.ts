/**
 * Tests for getSharedWorkbook tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getSharedWorkbookTool } from "./getSharedWorkbook.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getSharedWorkbook", () => {
  let server: Server;
  let tool: ReturnType<typeof getSharedWorkbookTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getSharedWorkbookTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_shared_workbook");
    expect(tool.description).toContain("shared workbook");
    expect(tool.annotations?.title).toBe("Get Shared Workbook");
  });

  it("should fetch shared workbook successfully", async () => {
    const mockWorkbook = {
      title: "Shared Dashboard",
      author: "testuser",
      repositoryUrl: "testuser/shared-dashboard"
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockWorkbook);

    const result = await tool.callback({ shareId: "abc123" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Shared Dashboard");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/workbook/shared/abc123"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/workbook/shared/invalid" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ shareId: "invalid" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
