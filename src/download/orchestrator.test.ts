/**
 * Tests for fulltext fetch orchestrator.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FulltextMeta } from "../types.js";
import {
  type DownloadAttempt,
  type FetchArticle,
  fetchAllFulltexts,
  fetchFulltext,
} from "./orchestrator.js";

// Mock downloader and pmc-xml
vi.mock("./downloader.js", () => ({
  downloadPdf: vi.fn(),
}));

vi.mock("./pmc-xml.js", () => ({
  downloadPmcXml: vi.fn(),
}));

vi.mock("./arxiv-html.js", () => ({
  downloadArxivHtml: vi.fn(),
}));

// Mock meta and paths
vi.mock("../meta.js", () => ({
  loadMeta: vi.fn(),
  saveMeta: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  getArticleDir: vi.fn(
    (_sessionDir: string, dirName: string) => `/sessions/test/fulltext/${dirName}`
  ),
  getFulltextDir: vi.fn(() => "/sessions/test/fulltext"),
}));

// Mock fs
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

import { loadMeta, saveMeta } from "../meta.js";
import { downloadArxivHtml } from "./arxiv-html.js";
import { downloadPdf } from "./downloader.js";
import { downloadPmcXml } from "./pmc-xml.js";

const mockDownloadPdf = vi.mocked(downloadPdf);
const mockDownloadPmcXml = vi.mocked(downloadPmcXml);
const mockDownloadArxivHtml = vi.mocked(downloadArxivHtml);
const mockLoadMeta = vi.mocked(loadMeta);
const mockSaveMeta = vi.mocked(saveMeta);

function createTestMeta(overrides: Partial<FulltextMeta> = {}): FulltextMeta {
  return {
    dirName: "smith2024-a1b2c3d4",
    citationKey: "smith2024",
    uuid: "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
    title: "Test Article",
    oaStatus: "open",
    files: {},
    oaLocations: [
      {
        source: "pmc",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/",
        urlType: "pdf",
        version: "published",
      },
    ],
    pmcid: "PMC1234567",
    ...overrides,
  };
}

function createTestArticle(
  overrides: Partial<FetchArticle> & { noPmcid?: boolean } = {}
): FetchArticle {
  const { noPmcid, ...rest } = overrides;
  const base: FetchArticle = {
    dirName: "smith2024-a1b2c3d4",
    oaLocations: [
      {
        source: "pmc",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/",
        urlType: "pdf",
        version: "published",
      },
    ],
    ...(!noPmcid ? { pmcid: "PMC1234567" } : {}),
    ...rest,
  };
  return base;
}

describe("fetchFulltext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMeta.mockResolvedValue(createTestMeta());
    mockSaveMeta.mockResolvedValue(undefined);
    mockDownloadPdf.mockResolvedValue({ success: true, size: 1024 });
    mockDownloadPmcXml.mockResolvedValue({ success: true, size: 512 });
    mockDownloadArxivHtml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });
  });

  it("fetches from best available source (by priority)", async () => {
    const article = createTestArticle({
      oaLocations: [
        {
          source: "unpaywall",
          url: "https://oa.example.com/paper.pdf",
          urlType: "pdf",
          version: "accepted",
        },
        {
          source: "pmc",
          url: "https://pmc.example.com/pdf/",
          urlType: "pdf",
          version: "published",
        },
      ],
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    // PMC should be preferred over unpaywall
    expect(mockDownloadPdf).toHaveBeenCalledWith(
      "https://pmc.example.com/pdf/",
      expect.stringContaining("fulltext.pdf"),
      expect.anything()
    );
  });

  it("creates directory if not exists", async () => {
    const { mkdir } = await import("node:fs/promises");
    const mockMkdir = vi.mocked(mkdir);
    const article = createTestArticle();

    await fetchFulltext(article, "/sessions/test");

    expect(mockMkdir).toHaveBeenCalledWith("/sessions/test/fulltext/smith2024-a1b2c3d4", {
      recursive: true,
    });
  });

  it("updates meta.json after download", async () => {
    const article = createTestArticle();

    await fetchFulltext(article, "/sessions/test");

    expect(mockSaveMeta).toHaveBeenCalled();
    const savedMeta = mockSaveMeta.mock.calls[0]?.[1] as FulltextMeta;
    expect(savedMeta.files.pdf).toBeDefined();
    expect(savedMeta.files.pdf?.source).toBe("pmc");
  });

  it("downloads PMC XML when pmcid is available", async () => {
    const article = createTestArticle({
      pmcid: "PMC1234567",
    });

    await fetchFulltext(article, "/sessions/test");

    expect(mockDownloadPmcXml).toHaveBeenCalledWith(
      "PMC1234567",
      expect.stringContaining("fulltext.xml")
    );
  });

  it("handles download failure gracefully with detailed error", async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: "HTTP 403 Forbidden" });
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });

    const article = createTestArticle();

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("pmc");
    expect(result.error).toContain("HTTP 403 Forbidden");
    expect(result.attempts).toBeDefined();
    expect(result.attempts?.length).toBeGreaterThan(0);
  });

  it("skips if already has PDF file", async () => {
    mockLoadMeta.mockResolvedValue(
      createTestMeta({
        files: {
          pdf: {
            filename: "fulltext.pdf",
            source: "pmc",
            retrievedAt: "2024-01-01T00:00:00Z",
            size: 1024,
          },
        },
      })
    );

    const article = createTestArticle();

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("skipped");
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it("falls back to next source on failure and records attempts", async () => {
    mockDownloadPdf
      .mockResolvedValueOnce({ success: false, error: "HTTP 403" })
      .mockResolvedValueOnce({ success: true, size: 2048 });

    const article = createTestArticle({
      oaLocations: [
        {
          source: "pmc",
          url: "https://pmc.example.com/pdf/",
          urlType: "pdf",
          version: "published",
        },
        {
          source: "unpaywall",
          url: "https://oa.example.com/paper.pdf",
          urlType: "pdf",
          version: "accepted",
        },
      ],
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    expect(mockDownloadPdf).toHaveBeenCalledTimes(2);
    // Should record the failed PMC attempt even though unpaywall succeeded
    expect(result.attempts).toBeDefined();
    expect(result.attempts).toHaveLength(1);
    const attempt = result.attempts?.[0] as DownloadAttempt;
    expect(attempt.source).toBe("pmc");
    expect(attempt.fileType).toBe("pdf");
    expect(attempt.error).toBe("HTTP 403");
  });

  it("records XML download failure in attempts", async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: "HTTP 403 Forbidden" });
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: "HTTP 500 Server Error" });

    const article = createTestArticle();
    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("failed");
    expect(result.attempts).toBeDefined();
    const xmlAttempt = result.attempts?.find((a) => a.fileType === "xml");
    expect(xmlAttempt).toBeDefined();
    expect(xmlAttempt?.source).toBe("pmc");
    expect(xmlAttempt?.error).toBe("HTTP 500 Server Error");
  });

  it("includes no attempts when download succeeds on first try", async () => {
    const article = createTestArticle();
    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    // No failed attempts when both PDF and XML succeed on first try
    expect(result.attempts).toBeUndefined();
  });

  it("classifies 403 error as publisher_block with suggestedUrls", async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: "HTTP 403 Forbidden" });
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });

    const article = createTestArticle({
      noPmcid: true,
      oaLocations: [
        {
          source: "publisher",
          url: "https://publisher.example.com/article.pdf",
          urlType: "pdf",
          version: "published",
        },
        {
          source: "publisher",
          url: "https://publisher.example.com/article",
          urlType: "html",
          version: "published",
        },
      ],
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("failed");
    expect(result.failureType).toBe("publisher_block");
    expect(result.suggestedUrls).toBeDefined();
    expect(result.suggestedUrls).toContain("https://publisher.example.com/article");
    expect(result.suggestedUrls).toContain("https://publisher.example.com/article.pdf");
  });

  it("classifies no sources as no_sources", async () => {
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: "HTTP 404" });

    const article = createTestArticle({
      noPmcid: true,
      oaLocations: [],
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("failed");
    expect(result.failureType).toBe("no_sources");
  });

  it("classifies 5xx error as network_error", async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: "HTTP 500 Internal Server Error" });
    mockDownloadPmcXml.mockResolvedValue({
      success: false,
      error: "HTTP 500 Internal Server Error",
    });

    const article = createTestArticle({
      oaLocations: [
        {
          source: "pmc",
          url: "https://pmc.example.com/pdf/",
          urlType: "pdf",
          version: "published",
        },
      ],
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("failed");
    expect(result.failureType).toBe("network_error");
  });

  it("writes pendingDownload to meta.json on failure with suggestedUrls", async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: "HTTP 403 Forbidden" });
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });

    const article = createTestArticle({
      noPmcid: true,
      oaLocations: [
        {
          source: "publisher",
          url: "https://publisher.example.com/article.pdf",
          urlType: "pdf",
          version: "published",
        },
        {
          source: "publisher",
          url: "https://publisher.example.com/article",
          urlType: "html",
          version: "published",
        },
      ],
    });

    await fetchFulltext(article, "/sessions/test");

    expect(mockSaveMeta).toHaveBeenCalled();
    const savedMeta = mockSaveMeta.mock.calls[0]?.[1] as FulltextMeta;
    expect(savedMeta.pendingDownload).toBeDefined();
    expect(savedMeta.pendingDownload?.suggestedUrls).toContain(
      "https://publisher.example.com/article"
    );
    expect(savedMeta.pendingDownload?.addedAt).toBeDefined();
  });

  it("downloads arXiv HTML when arxivId is available", async () => {
    mockDownloadArxivHtml.mockResolvedValue({ success: true, size: 2048 });

    const article = createTestArticle({
      arxivId: "2301.13867",
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    expect(mockDownloadArxivHtml).toHaveBeenCalledWith(
      "2301.13867",
      expect.stringContaining("fulltext.html")
    );
    expect(result.filesDownloaded).toContain("fulltext.html");
  });

  it("does not fail overall when arXiv HTML download fails", async () => {
    mockDownloadArxivHtml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });

    const article = createTestArticle({
      arxivId: "2504.10961",
    });

    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    expect(result.filesDownloaded).toContain("fulltext.pdf");
    expect(result.filesDownloaded).not.toContain("fulltext.html");
  });

  it("saves HTML file info to meta.json", async () => {
    mockDownloadArxivHtml.mockResolvedValue({ success: true, size: 2048 });

    const article = createTestArticle({
      arxivId: "2301.13867",
    });

    await fetchFulltext(article, "/sessions/test");

    expect(mockSaveMeta).toHaveBeenCalled();
    const savedMeta = mockSaveMeta.mock.calls[0]?.[1] as FulltextMeta;
    expect(savedMeta.files.html).toBeDefined();
    expect(savedMeta.files.html?.source).toBe("arxiv");
    expect(savedMeta.files.html?.filename).toBe("fulltext.html");
  });

  it("does not set failureType or suggestedUrls on success", async () => {
    const article = createTestArticle();
    const result = await fetchFulltext(article, "/sessions/test");

    expect(result.status).toBe("downloaded");
    expect(result.failureType).toBeUndefined();
    expect(result.suggestedUrls).toBeUndefined();
  });
});

describe("fetchAllFulltexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMeta.mockResolvedValue(createTestMeta());
    mockSaveMeta.mockResolvedValue(undefined);
    mockDownloadPdf.mockResolvedValue({ success: true, size: 1024 });
    mockDownloadPmcXml.mockResolvedValue({ success: true, size: 512 });
    mockDownloadArxivHtml.mockResolvedValue({ success: false, error: "HTTP 404 Not Found" });
  });

  it("processes multiple articles with concurrency limit", async () => {
    const articles = [
      createTestArticle({ dirName: "art1-aaaa" }),
      createTestArticle({ dirName: "art2-bbbb" }),
      createTestArticle({ dirName: "art3-cccc" }),
    ];

    const results = await fetchAllFulltexts(articles, "/sessions/test", {
      concurrency: 2,
      retryDelay: 10,
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "downloaded")).toBe(true);
  });

  it("calls progress callback", async () => {
    const articles = [
      createTestArticle({ dirName: "art1-aaaa" }),
      createTestArticle({ dirName: "art2-bbbb" }),
    ];

    const progress = vi.fn();

    await fetchAllFulltexts(articles, "/sessions/test", {
      concurrency: 1,
      retryDelay: 10,
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: expect.any(Number),
        total: 2,
      })
    );
  });

  it("returns summary with downloaded, failed, skipped counts", async () => {
    mockLoadMeta
      .mockResolvedValueOnce(createTestMeta())
      .mockResolvedValueOnce(
        createTestMeta({
          files: {
            pdf: { filename: "fulltext.pdf", source: "pmc", retrievedAt: "2024-01-01", size: 1024 },
          },
        })
      )
      .mockResolvedValueOnce(createTestMeta());
    mockDownloadPdf
      .mockResolvedValueOnce({ success: true, size: 1024 })
      .mockResolvedValueOnce({ success: false, error: "HTTP 403" });
    mockDownloadPmcXml
      .mockResolvedValueOnce({ success: true, size: 512 })
      .mockResolvedValue({ success: false, error: "HTTP 404" });

    const articles = [
      createTestArticle({ dirName: "art1-aaaa" }),
      createTestArticle({ dirName: "art2-bbbb" }),
      createTestArticle({
        dirName: "art3-cccc",
        noPmcid: true,
        oaLocations: [
          {
            source: "unpaywall",
            url: "https://fail.com/x.pdf",
            urlType: "pdf",
            version: "published",
          },
        ],
      }),
    ];

    const results = await fetchAllFulltexts(articles, "/sessions/test", {
      concurrency: 1,
      retryDelay: 10,
    });

    const downloaded = results.filter((r) => r.status === "downloaded");
    const skipped = results.filter((r) => r.status === "skipped");
    const failed = results.filter((r) => r.status === "failed");

    expect(downloaded).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });
});
