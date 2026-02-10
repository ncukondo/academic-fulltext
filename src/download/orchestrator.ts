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

export interface DownloadAttempt {
  source: string;
  url: string;
  fileType: "pdf" | "xml";
  error: string;
}

export interface FetchResult {
  dirName: string;
  status: "downloaded" | "failed" | "skipped";
  filesDownloaded?: string[];
  error?: string;
  attempts?: DownloadAttempt[];
  failureType?: "publisher_block" | "no_sources" | "network_error";
  suggestedUrls?: string[];
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

interface PdfDownloadResult {
  fileInfo?: FileInfo;
  attempts: DownloadAttempt[];
}

/**
 * Try downloading a PDF from prioritized OA locations.
 * Returns FileInfo on success plus all failed attempts.
 */
async function tryDownloadPdf(
  pdfLocations: OALocation[],
  articleDir: string,
  options?: FetchOptions
): Promise<PdfDownloadResult> {
  const pdfPath = join(articleDir, "fulltext.pdf");
  const attempts: DownloadAttempt[] = [];

  for (const loc of pdfLocations) {
    const result = await downloadPdf(loc.url, pdfPath, {
      retries: options?.retries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
    });
    if (result.success) {
      return { fileInfo: buildFileInfo("fulltext.pdf", loc.source, result.size), attempts };
    }
    attempts.push({
      source: loc.source,
      url: loc.url,
      fileType: "pdf",
      error: result.error ?? "Unknown error",
    });
  }
  return { attempts };
}

interface XmlDownloadResult {
  fileInfo?: FileInfo;
  attempt?: DownloadAttempt;
}

/**
 * Try downloading PMC XML for a given PMCID.
 * Returns FileInfo on success plus the failed attempt if applicable.
 */
async function tryDownloadXml(
  pmcid: string | undefined,
  articleDir: string
): Promise<XmlDownloadResult> {
  if (!pmcid) return {};
  const xmlPath = join(articleDir, "fulltext.xml");
  const result = await downloadPmcXml(pmcid, xmlPath);
  if (result.success) {
    return { fileInfo: buildFileInfo("fulltext.xml", "pmc", result.size) };
  }
  const numericId = pmcid.replace(/^PMC/i, "");
  return {
    attempt: {
      source: "pmc",
      url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${numericId}&rettype=xml`,
      fileType: "xml",
      error: result.error ?? "Unknown error",
    },
  };
}

/** Build a detailed error message from download attempts */
function buildDetailedError(attempts: DownloadAttempt[]): string {
  if (attempts.length === 0) return "No download sources available";

  const details = attempts.map((a) => `${a.source} (${a.fileType}): ${a.error}`).join("; ");
  return `All download sources failed: ${details}`;
}

/** Classify the type of failure based on download attempts */
function classifyFailure(
  attempts: DownloadAttempt[]
): "publisher_block" | "no_sources" | "network_error" {
  if (attempts.length === 0) return "no_sources";
  const hasBlock = attempts.some(
    (a) => a.error.includes("HTTP 403") || a.error.includes("HTTP 401")
  );
  if (hasBlock) return "publisher_block";
  return "network_error";
}

/** Collect suggested URLs for manual download from OA locations and failed attempts */
function collectSuggestedUrls(oaLocations: OALocation[], attempts: DownloadAttempt[]): string[] {
  const blockedUrls = new Set(
    attempts
      .filter((a) => a.error.includes("HTTP 403") || a.error.includes("HTTP 401"))
      .map((a) => a.url)
  );

  const sorted = sortByPriority(oaLocations);
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const loc of sorted) {
    if (loc.urlType === "html" && !seen.has(loc.url)) {
      urls.push(loc.url);
      seen.add(loc.url);
    }
  }
  for (const loc of sorted) {
    if (loc.urlType === "pdf" && blockedUrls.has(loc.url) && !seen.has(loc.url)) {
      urls.push(loc.url);
      seen.add(loc.url);
    }
  }

  return urls;
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
  const pdfResult = await tryDownloadPdf(pdfLocations, articleDir, options);

  // Attempt PMC XML download
  const xmlResult = await tryDownloadXml(article.pmcid, articleDir);

  // Collect downloaded filenames and all attempts
  const filesDownloaded: string[] = [];
  if (pdfResult.fileInfo) filesDownloaded.push(pdfResult.fileInfo.filename);
  if (xmlResult.fileInfo) filesDownloaded.push(xmlResult.fileInfo.filename);

  const allAttempts: DownloadAttempt[] = [...pdfResult.attempts];
  if (xmlResult.attempt) allAttempts.push(xmlResult.attempt);

  if (filesDownloaded.length === 0) {
    const failureType = classifyFailure(allAttempts);
    const suggestedUrls = collectSuggestedUrls(article.oaLocations, allAttempts);

    const failResult: FetchResult = {
      dirName: article.dirName,
      status: "failed",
      error: buildDetailedError(allAttempts),
      failureType,
    };
    if (allAttempts.length > 0) failResult.attempts = allAttempts;
    if (suggestedUrls.length > 0) failResult.suggestedUrls = suggestedUrls;

    // Write pendingDownload to meta.json when we have suggested URLs
    if (suggestedUrls.length > 0) {
      const updatedMeta: FulltextMeta = {
        ...meta,
        pendingDownload: {
          suggestedUrls,
          addedAt: new Date().toISOString(),
        },
      };
      await saveMeta(metaPath, updatedMeta);
    }

    return failResult;
  }

  // Update meta.json with new file info
  const updatedMeta: FulltextMeta = {
    ...meta,
    files: {
      ...meta.files,
      ...(pdfResult.fileInfo ? { pdf: pdfResult.fileInfo } : {}),
      ...(xmlResult.fileInfo ? { xml: xmlResult.fileInfo } : {}),
    },
  };
  await saveMeta(metaPath, updatedMeta);

  const successResult: FetchResult = {
    dirName: article.dirName,
    status: "downloaded",
    filesDownloaded,
  };
  if (allAttempts.length > 0) successResult.attempts = allAttempts;
  return successResult;
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
