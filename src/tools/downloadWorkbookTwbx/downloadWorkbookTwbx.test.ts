/**
 * Tests for downloadWorkbookTwbx tool — verifies it saves beside the caller's
 * outputs (never the host temp directory).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { downloadWorkbookTwbxTool } from "./downloadWorkbookTwbx.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: { get: vi.fn() }
}));

vi.mock("../../config.js", () => ({
  getConfig: vi.fn()
}));

import { cachedGet } from "../../utils/cachedApiClient.js";
import { apiClient } from "../../utils/apiClient.js";
import { getConfig } from "../../config.js";

function mockConfig(outputBaseDir: string) {
  vi.mocked(getConfig).mockReturnValue({
    baseURL: "https://public.tableau.com",
    apiTimeout: 30000,
    logLevel: "info",
    maxResultLimit: 1000,
    cacheEnabled: true,
    cacheMaxEntries: 1000,
    cacheDefaultTTL: 300000,
    maxConcurrency: 3,
    batchDelayMs: 100,
    maxInlineImageBytes: 1048576,
    outputBaseDir
  });
}

const TWBX_BYTES = Buffer.from("PK fake twbx contents");

describe("downloadWorkbookTwbx", () => {
  let server: Server;
  let tool: ReturnType<typeof downloadWorkbookTwbxTool>;
  let workDir: string;

  beforeEach(async () => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = downloadWorkbookTwbxTool(server);
    vi.clearAllMocks();
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dl-twbx-test-")));
    mockConfig(workDir); // outputBaseDir defaults to the test workspace
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("should have correct metadata stating it never uses temp", () => {
    expect(tool.name).toBe("download_workbook_twbx");
    expect(tool.description).toContain("never the host temp directory");
    expect(tool.annotations?.title).toBe("Download Workbook TWBX");
  });

  it("saves the .twbx into the provided outputPath, not %TEMP%", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ allowDataAccess: true, title: "My Workbook" });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: TWBX_BYTES });

    const result = await tool.callback({ workbookName: "MyWorkbook", outputPath: workDir });

    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const data = JSON.parse((value.content[0] as { text: string }).text);

    const expectedPath = path.join(workDir, "MyWorkbook.twbx");
    // File really written beside the caller's outputs
    const written = await fs.readFile(expectedPath);
    expect(written.equals(TWBX_BYTES)).toBe(true);

    // Returned path is long-form, under the output dir, never the temp dir
    expect(data.filePath).toBe(expectedPath);
    expect(data.filePath).not.toContain("tableau-public-mcp");
    expect(data.filePath).not.toContain("~");
  });

  it("resolves a RELATIVE outputPath against the output base dir, not cwd", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ allowDataAccess: true });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: TWBX_BYTES });

    // workDir is the configured outputBaseDir (set in beforeEach)
    const result = await tool.callback({ workbookName: "RelWorkbook", outputPath: "verification" });

    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const data = JSON.parse((value.content[0] as { text: string }).text);

    const expectedPath = path.join(workDir, "verification", "RelWorkbook.twbx");
    expect(data.filePath).toBe(expectedPath);
    // Crucially NOT resolved against process.cwd() (e.g. C:\windows\system32)
    expect(data.filePath.startsWith(process.cwd())).toBe(false);
    await expect(fs.access(expectedPath)).resolves.toBeUndefined();
  });

  it("rejects download when data access is not allowed", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ allowDataAccess: false });

    const result = await tool.callback({ workbookName: "PrivateWorkbook", outputPath: workDir });

    const value = result.unwrap();
    expect(value.isError).toBe(true);
    expect((value.content[0] as { text: string }).text).toContain("not allowed");
    // Nothing downloaded
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
