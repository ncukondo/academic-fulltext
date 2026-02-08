/**
 * Tests for PDF downloader.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPdf } from "./downloader.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

function createMockResponse(
  overrides: Partial<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Map<string, string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
    redirected: boolean;
    url: string;
  }> = {}
) {
  const headers = new Map(overrides.headers ?? [["content-type", "application/pdf"]]);
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    statusText: overrides.statusText ?? "OK",
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
    arrayBuffer: overrides.arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(1024))),
    redirected: overrides.redirected ?? false,
    url: overrides.url ?? "https://example.com/paper.pdf",
  };
}

describe("downloadPdf", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined as never);
  });

  it("downloads PDF from URL to specified path", async () => {
    const pdfData = new ArrayBuffer(2048);
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        arrayBuffer: () => Promise.resolve(pdfData),
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(true);
    expect(result.size).toBe(2048);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/test/fulltext.pdf", expect.any(Buffer));
  });

  it("validates response is PDF (Content-Type check)", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      })
    );

    const result = await downloadPdf("https://example.com/paper", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/content.type/i);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("accepts application/octet-stream as valid PDF content type", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        headers: new Map([["content-type", "application/octet-stream"]]),
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(true);
  });

  it("handles redirects", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        redirected: true,
        url: "https://cdn.example.com/paper.pdf",
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(true);
  });

  it("handles 403 errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("handles 404 errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/404/);
  });

  it("retries on network errors (3x with backoff)", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(createMockResponse());

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf", {
      retries: 3,
      retryDelay: 10,
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("fails after exhausting retries", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf", {
      retries: 3,
      retryDelay: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 rate limit", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
        })
      )
      .mockResolvedValueOnce(createMockResponse());

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf", {
      retries: 3,
      retryDelay: 10,
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 403/404", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })
    );

    const result = await downloadPdf("https://example.com/paper.pdf", "/tmp/test/fulltext.pdf", {
      retries: 3,
      retryDelay: 10,
    });

    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("creates parent directory if it does not exist", async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse());

    await downloadPdf("https://example.com/paper.pdf", "/tmp/test/nested/dir/fulltext.pdf");

    expect(mockMkdir).toHaveBeenCalledWith("/tmp/test/nested/dir", { recursive: true });
  });
});
