/**
 * Fulltext fetch orchestrator.
 * Coordinates downloads from multiple OA sources with priority-based selection.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { OALocation, FulltextMeta, FileInfo } from '../types.js';
import { downloadPdf } from './downloader.js';
import { downloadPmcXml } from './pmc-xml.js';
import { loadMeta, saveMeta } from '../meta.js';
import { getArticleDir } from '../paths.js';

/** Source priority order (lower index = higher priority) */
const SOURCE_PRIORITY: string[] = ['pmc', 'arxiv', 'unpaywall', 'core', 'publisher'];

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
  status: 'downloaded' | 'failed' | 'skipped';
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
  return locations.filter((loc) => loc.urlType === 'pdf');
}

/**
 * Fetch fulltext for a single article.
 * Downloads PDF from the best available source, plus PMC XML if available.
 */
export async function fetchFulltext(
  article: FetchArticle,
  sessionDir: string,
  options?: FetchOptions,
): Promise<FetchResult> {
  const articleDir = getArticleDir(sessionDir, article.dirName);
  const metaPath = join(articleDir, 'meta.json');

  // Load meta to check existing files
  let meta: FulltextMeta;
  try {
    meta = await loadMeta(metaPath);
  } catch {
    return { dirName: article.dirName, status: 'failed', error: 'meta.json not found' };
  }

  // Skip if already has PDF
  if (meta.files.pdf) {
    return { dirName: article.dirName, status: 'skipped' };
  }

  // Ensure directory exists
  await mkdir(articleDir, { recursive: true });

  const filesDownloaded: string[] = [];
  let pdfFileInfo: FileInfo | undefined;
  let xmlFileInfo: FileInfo | undefined;

  // Filter and sort locations by priority
  let locations = article.oaLocations;
  if (options?.sourceFilter && options.sourceFilter.length > 0) {
    locations = locations.filter((loc) => options.sourceFilter?.includes(loc.source));
  }
  const pdfLocations = sortByPriority(getPdfLocations(locations));

  // Try downloading PDF from best source, falling back to next on failure
  for (const loc of pdfLocations) {
    const pdfPath = join(articleDir, 'fulltext.pdf');
    const downloadResult = await downloadPdf(loc.url, pdfPath, {
      retries: options?.retries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
    });

    if (downloadResult.success) {
      filesDownloaded.push('fulltext.pdf');
      const info: FileInfo = {
        filename: 'fulltext.pdf',
        source: loc.source,
        retrievedAt: new Date().toISOString(),
      };
      if (downloadResult.size !== undefined) info.size = downloadResult.size;
      pdfFileInfo = info;
      break;
    }
  }

  // Download PMC XML if pmcid available
  if (article.pmcid) {
    const xmlPath = join(articleDir, 'fulltext.xml');
    const xmlResult = await downloadPmcXml(article.pmcid, xmlPath);
    if (xmlResult.success) {
      filesDownloaded.push('fulltext.xml');
      const info: FileInfo = {
        filename: 'fulltext.xml',
        source: 'pmc',
        retrievedAt: new Date().toISOString(),
      };
      if (xmlResult.size !== undefined) info.size = xmlResult.size;
      xmlFileInfo = info;
    }
  }

  if (filesDownloaded.length === 0) {
    return {
      dirName: article.dirName,
      status: 'failed',
      error: 'All download sources failed',
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
    status: 'downloaded',
    filesDownloaded,
  };
}

/**
 * Fetch fulltexts for multiple articles with concurrency control.
 */
export async function fetchAllFulltexts(
  articles: FetchArticle[],
  sessionDir: string,
  options?: FetchOptions,
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

  const workers = Array.from(
    { length: Math.min(concurrency, articles.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
