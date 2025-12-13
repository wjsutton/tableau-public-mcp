/**
 * Tests for getRelatedWorkbooks tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getRelatedWorkbooksTool } from "./getRelatedWorkbooks.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

describe("getRelatedWorkbooks", () => {
  let server: Server;
  let tool: ReturnType<typeof getRelatedWorkbooksTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getRelatedWorkbooksTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_related_workbooks");
    expect(tool.description).toContain("related");
    expect(tool.annotations?.title).toBe("Get Related Workbooks");
  });

  it("should fetch related workbooks successfully", async () => {
    const mockRelated = [
      { title: "Similar Dashboard 1", author: "user1" },
      { title: "Similar Dashboard 2", author: "user2" }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockRelated);

    const result = await tool.callback({
      workbookUrl: "testuser/workbook",
      count: 2
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Similar Dashboard 1");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/workbooks/v2/testuser/workbook/recommended-workbooks",
      { count: 2 }
    );
  });

  it("should use default count parameter", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce([]);

    await tool.callback({ workbookUrl: "testuser/workbook" });

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/workbooks/v2/testuser/workbook/recommended-workbooks",
      { count: 10 }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/public/apis/bff/workbooks/v2/testuser/nonexistent/recommended-workbooks" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookUrl: "testuser/nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
