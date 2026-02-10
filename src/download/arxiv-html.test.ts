/**
 * Tests for arXiv HTML downloader.
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadArxivHtml } from "./arxiv-html.js";

describe("downloadArxivHtml", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arxiv-html-test-"));
    await mkdir(join(tmpDir, "article"), { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("downloads HTML successfully", async () => {
    const sampleHtml = "<html><body><p>Test</p></body></html>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sampleHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );

    const destPath = join(tmpDir, "article", "fulltext.html");
    const result = await downloadArxivHtml("2301.13867", destPath);

    expect(result.success).toBe(true);
    expect(result.size).toBeGreaterThan(0);
    const content = await readFile(destPath, "utf-8");
    expect(content).toBe(sampleHtml);
  });

  it("constructs correct URL from arXiv ID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const destPath = join(tmpDir, "article", "fulltext.html");
    await downloadArxivHtml("2301.13867", destPath);

    expect(fetchSpy).toHaveBeenCalledWith("https://arxiv.org/html/2301.13867", expect.anything());
  });

  it("strips arXiv: prefix from ID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const destPath = join(tmpDir, "article", "fulltext.html");
    await downloadArxivHtml("arXiv:2301.13867", destPath);

    expect(fetchSpy).toHaveBeenCalledWith("https://arxiv.org/html/2301.13867", expect.anything());
  });

  it("handles 404 (HTML not available) gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404, statusText: "Not Found" })
    );

    const destPath = join(tmpDir, "article", "fulltext.html");
    const result = await downloadArxivHtml("2504.10961", destPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });

  it("handles unexpected content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("%PDF-1.4", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      })
    );

    const destPath = join(tmpDir, "article", "fulltext.html");
    const result = await downloadArxivHtml("2301.13867", destPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unexpected Content-Type");
  });

  it("handles network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network timeout"));

    const destPath = join(tmpDir, "article", "fulltext.html");
    const result = await downloadArxivHtml("2301.13867", destPath);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });
});
