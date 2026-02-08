/**
 * Fulltext fetch orchestrator.
 * Coordinates downloads from multiple OA sources with priority-based selection.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadMeta, saveMeta } from "../meta.js";
import { getArticleDir } from "../paths.js";
import type { FileInfo, FulltextMeta, OALocation } from "../types.js";
import { downloadPdf } from "./downloader.js";
import { downloadPmcXml } from "./pmc-xml.js";

/** Source priority order (lower index = higher priority) */
const SOURCE_PRIORITY: string[] = ["pmc", "arxiv", "unpaywall", "core", "publisher"];

export interface FetchArticle {
  dirName: string;
  oaLocations: OALocation[];
  pmcid?: string;
}

export interface FetchOptions {
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  onProgress?: (progress: { completed: number; total: number; dirName: string }) => void;
  sourceFilter?: string[];
}

export interface FetchResult {
  dirName: string;
  status: "downloaded" | "failed" | "skipped";
  filesDownloaded?: string[];
  error?: string;
}

/** Sort OA locations by source priority */
function sortByPriority(locations: OALocation[]): OALocation[] {
  return [...locations].sort((a, b) => {
    const aIdx = SOURCE_PRIORITY.indexOf(a.source);
    const bIdx = SOURCE_PRIORITY.indexOf(b.source);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
}

/** Get only PDF-type locations */
function getPdfLocations(locations: OALocation[]): OALocation[] {
  return locations.filter((loc) => loc.urlType === "pdf");
}

/** Filter locations by source if a filter is specified */
function applySourceFilter(locations: OALocation[], sourceFilter?: string[]): OALocation[] {
  if (sourceFilter && sourceFilter.length > 0) {
    return locations.filter((loc) => sourceFilter.includes(loc.source));
  }
  return locations;
}

/** Build a FileInfo object from a download result */
function buildFileInfo(filename: string, source: string, size?: number): FileInfo {
  const info: FileInfo = {
    filename,
    source,
    retrievedAt: new Date().toISOString(),
  };
  if (size !== undefined) info.size = size;
  return info;
}

/**
 * Try downloading a PDF from prioritized OA locations.
 * Returns FileInfo on success, or undefined if all sources fail.
 */
async function tryDownloadPdf(
  pdfLocations: OALocation[],
  articleDir: string,
  options?: FetchOptions
): Promise<FileInfo | undefined> {
  const pdfPath = join(articleDir, "fulltext.pdf");
  for (const loc of pdfLocations) {
    const result = await downloadPdf(loc.url, pdfPath, {
      retries: options?.retries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
    });
    if (result.success) {
      return buildFileInfo("fulltext.pdf", loc.source, result.size);
    }
  }
  return undefined;
}

/**
 * Try downloading PMC XML for a given PMCID.
 * Returns FileInfo on success, or undefined on failure or if no PMCID.
 */
async function tryDownloadXml(
  pmcid: string | undefined,
  articleDir: string
): Promise<FileInfo | undefined> {
  if (!pmcid) return undefined;
  const xmlPath = join(articleDir, "fulltext.xml");
  const result = await downloadPmcXml(pmcid, xmlPath);
  if (result.success) {
    return buildFileInfo("fulltext.xml", "pmc", result.size);
  }
  return undefined;
}

/**
 * Fetch fulltext for a single article.
 * Downloads PDF from the best available source, plus PMC XML if available.
 */
export async function fetchFulltext(
  article: FetchArticle,
  sessionDir: string,
  options?: FetchOptions
): Promise<FetchResult> {
  const articleDir = getArticleDir(sessionDir, article.dirName);
  const metaPath = join(articleDir, "meta.json");

  // Load meta to check existing files
  let meta: FulltextMeta;
  try {
    meta = await loadMeta(metaPath);
  } catch {
    return { dirName: article.dirName, status: "failed", error: "meta.json not found" };
  }

  // Skip if already has PDF
  if (meta.files.pdf) {
    return { dirName: article.dirName, status: "skipped" };
  }

  // Ensure directory exists
  await mkdir(articleDir, { recursive: true });

  // Filter, sort, and attempt PDF download
  const locations = applySourceFilter(article.oaLocations, options?.sourceFilter);
  const pdfLocations = sortByPriority(getPdfLocations(locations));
  const pdfFileInfo = await tryDownloadPdf(pdfLocations, articleDir, options);

  // Attempt PMC XML download
  const xmlFileInfo = await tryDownloadXml(article.pmcid, articleDir);

  // Collect downloaded filenames
  const filesDownloaded: string[] = [];
  if (pdfFileInfo) filesDownloaded.push(pdfFileInfo.filename);
  if (xmlFileInfo) filesDownloaded.push(xmlFileInfo.filename);

  if (filesDownloaded.length === 0) {
    return {
      dirName: article.dirName,
      status: "failed",
      error: "All download sources failed",
    };
  }

  // Update meta.json with new file info
  const updatedMeta: FulltextMeta = {
    ...meta,
    files: {
      ...meta.files,
      ...(pdfFileInfo ? { pdf: pdfFileInfo } : {}),
      ...(xmlFileInfo ? { xml: xmlFileInfo } : {}),
    },
  };
  await saveMeta(metaPath, updatedMeta);

  return {
    dirName: article.dirName,
    status: "downloaded",
    filesDownloaded,
  };
}

/**
 * Fetch fulltexts for multiple articles with concurrency control.
 */
export async function fetchAllFulltexts(
  articles: FetchArticle[],
  sessionDir: string,
  options?: FetchOptions
): Promise<FetchResult[]> {
  const concurrency = options?.concurrency ?? 3;
  const results: FetchResult[] = new Array(articles.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < articles.length) {
      const index = nextIndex++;
      const article = articles[index];
      if (!article) continue;

      results[index] = await fetchFulltext(article, sessionDir, options);
      completed++;

      if (options?.onProgress) {
        options.onProgress({
          completed,
          total: articles.length,
          dirName: article.dirName,
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, articles.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
