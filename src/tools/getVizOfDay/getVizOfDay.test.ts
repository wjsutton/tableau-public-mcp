/**
 * Tests for getVizOfDay tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getVizOfDayTool } from "./getVizOfDay.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("getVizOfDay", () => {
  let server: Server;
  let tool: ReturnType<typeof getVizOfDayTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getVizOfDayTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_viz_of_day");
    expect(tool.description).toContain("Viz of the Day");
    expect(tool.annotations?.title).toBe("Get Viz of the Day");
  });

  it("should fetch VOTD winners successfully", async () => {
    const mockVotd = {
      vizzes: [
        { title: "Amazing Dashboard", author: "user1", date: "2024-01-01" },
        { title: "Beautiful Viz", author: "user2", date: "2024-01-02" }
      ]
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockVotd,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("Amazing Dashboard");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
      {
        params: {
          page: 0,
          limit: 12
        }
      }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { vizzes: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({
      page: 2,
      limit: 10
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
      {
        params: {
          page: 2,
          limit: 10
        }
      }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 500,
        statusText: "Internal Server Error"
      },
      config: { url: "/public/apis/bff/discover/v1/vizzes/viz-of-the-day" },
      isAxiosError: true
    };

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const result = await tool.callback({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(true);
    }
  });
});
