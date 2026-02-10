/**
 * arXiv HTML downloader.
 *
 * Downloads LaTeXML-generated HTML from arXiv for conversion to Markdown.
 * Not all arXiv papers have HTML versions; 404 is handled gracefully.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ARXIV_HTML_BASE = "https://arxiv.org/html/";

const USER_AGENT = "search-hub/0.8.0 (https://github.com/ncukondo/search-hub)";

/** Strip common prefixes from arXiv IDs */
function normalizeArxivId(id: string): string {
  return id.replace(/^arXiv:/i, "");
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return base === "text/html";
}

export interface ArxivHtmlResult {
  success: boolean;
  size?: number;
  error?: string;
}

/**
 * Download arXiv HTML for a given arXiv ID.
 *
 * @param arxivId - arXiv identifier (e.g., "2301.13867", "arXiv:2301.13867")
 * @param destPath - Destination file path for the HTML
 * @returns Result with success status and file size
 */
export async function downloadArxivHtml(
  arxivId: string,
  destPath: string
): Promise<ArxivHtmlResult> {
  const id = normalizeArxivId(arxivId);
  const url = `${ARXIV_HTML_BASE}${id}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type");
    if (!isHtmlContentType(contentType)) {
      return {
        success: false,
        error: `Unexpected Content-Type: ${contentType ?? "none"} (expected text/html)`,
      };
    }

    const text = await response.text();

    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, text, "utf-8");

    return { success: true, size: Buffer.byteLength(text) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
