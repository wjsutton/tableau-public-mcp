/**
 * Tests for unpackTwbx tool
 *
 * Covers the three extraction-location behaviours:
 *  1. Default: extract beside the input .twbx at <dir>/extracted/<workbook-name>
 *  2. Explicit extractTo: extract to the caller-provided directory
 *  3. Read-only source: fall back to a temp directory and return a warning
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import AdmZip from "adm-zip";
import { unpackTwbxTool } from "./unpackTwbx.js";

/** Builds a minimal .twbx (zip containing a single .twb) at the given path. */
async function writeTwbx(twbxPath: string, twbName = "Team Sales.twb"): Promise<void> {
  const zip = new AdmZip();
  zip.addFile(twbName, Buffer.from("<workbook source-platform='win' version='2021.1'/>"));
  zip.writeZip(twbxPath);
}

/** Parses the JSON payload from a tool result. */
function parseResult(result: Awaited<ReturnType<ReturnType<typeof unpackTwbxTool>["callback"]>>) {
  const value = result.unwrap();
  const text = value.content[0].type === "text" ? value.content[0].text : "";
  return { isError: value.isError, data: JSON.parse(text) };
}

describe("unpackTwbx", () => {
  let server: Server;
  let tool: ReturnType<typeof unpackTwbxTool>;
  let workDir: string;

  beforeEach(async () => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = unpackTwbxTool(server);
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "unpack-twbx-test-")));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("should have correct metadata and document the default location", () => {
    expect(tool.name).toBe("unpack_twbx");
    expect(tool.description).toContain("extracted/<workbook-name>");
    expect(tool.annotations?.title).toBe("Unpack TWBX");
  });

  it("extracts beside the input file by default", async () => {
    const twbxPath = path.join(workDir, "Team Sales.twbx");
    await writeTwbx(twbxPath);

    const result = await tool.callback({ filePath: twbxPath });
    const { isError, data } = parseResult(result);

    expect(isError).toBe(false);
    expect(data.warning).toBeUndefined();

    const expectedDir = path.join(workDir, "extracted", "Team Sales");
    expect(data.extractionPath).toBe(expectedDir);
    // Returned path must be long-form, never a Windows 8.3 short path.
    expect(data.extractionPath).not.toContain("~");

    // The .twb really lives beside the input, reachable by the same caller.
    await expect(fs.access(path.join(expectedDir, "Team Sales.twb"))).resolves.toBeUndefined();
    expect(data.mainTwbFile).toBe("Team Sales.twb");
  });

  it("uses an explicit extractTo directory when provided", async () => {
    const twbxPath = path.join(workDir, "Team Sales.twbx");
    await writeTwbx(twbxPath);
    const customDir = path.join(workDir, "custom-out");

    const result = await tool.callback({ filePath: twbxPath, extractTo: customDir });
    const { isError, data } = parseResult(result);

    expect(isError).toBe(false);
    expect(data.warning).toBeUndefined();
    expect(data.extractionPath).toBe(customDir);
    await expect(fs.access(path.join(customDir, "Team Sales.twb"))).resolves.toBeUndefined();
  });

  it("falls back to a temp directory with a warning when the source location is read-only", async () => {
    const twbxPath = path.join(workDir, "Team Sales.twbx");
    await writeTwbx(twbxPath);

    // Block the default location by occupying "extracted" with a file, so
    // creating <dir>/extracted/<name> fails (cross-platform stand-in for a
    // read-only source directory).
    await fs.writeFile(path.join(workDir, "extracted"), "not a directory");

    const result = await tool.callback({ filePath: twbxPath });
    const { isError, data } = parseResult(result);

    expect(isError).toBe(false);
    expect(data.warning).toBeDefined();
    expect(data.warning).toContain("extractTo");
    // Extraction landed under the shared temp directory, not beside the input.
    expect(data.extractionPath).toContain("tableau-public-mcp");
    expect(data.extractionPath.startsWith(workDir)).toBe(false);
    await expect(fs.access(path.join(data.extractionPath, "Team Sales.twb"))).resolves.toBeUndefined();

    // Clean up the temp fallback we created.
    await fs.rm(data.extractionPath, { recursive: true, force: true });
  });

  it("returns an error for a non-existent file", async () => {
    const result = await tool.callback({ filePath: path.join(workDir, "missing.twbx") });
    expect(result.unwrap().isError).toBe(true);
  });

  it("returns an error for a non-.twbx file", async () => {
    const notTwbx = path.join(workDir, "data.txt");
    await fs.writeFile(notTwbx, "hello");
    const result = await tool.callback({ filePath: notTwbx });
    expect(result.unwrap().isError).toBe(true);
  });
});
