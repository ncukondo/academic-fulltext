/**
 * PDF downloader with retry and error handling.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface DownloadOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number;
}

export interface DownloadResult {
  success: boolean;
  size?: number;
  error?: string;
}

/** HTTP status codes that should not be retried */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 405, 410]);

/** Content types accepted as valid PDF responses */
const VALID_CONTENT_TYPES = ["application/pdf", "application/octet-stream"];

const USER_AGENT = "search-hub/0.8.0 (https://github.com/ncukondo/search-hub)";

function isValidPdfContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return VALID_CONTENT_TYPES.includes(base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptResult =
  | { kind: "success"; result: DownloadResult }
  | { kind: "fail"; result: DownloadResult }
  | { kind: "retry"; error: string };

async function attemptDownload(url: string, destPath: string): Promise<AttemptResult> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    const error = `HTTP ${response.status} ${response.statusText}`;
    if (NON_RETRYABLE_STATUSES.has(response.status)) {
      return { kind: "fail", result: { success: false, error } };
    }
    return { kind: "retry", error };
  }

  const contentType = response.headers.get("content-type");
  if (!isValidPdfContentType(contentType)) {
    return {
      kind: "fail",
      result: {
        success: false,
        error: `Unexpected Content-Type: ${contentType ?? "none"}`,
      },
    };
  }

  const buffer = await response.arrayBuffer();
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, Buffer.from(buffer));

  return { kind: "success", result: { success: true, size: buffer.byteLength } };
}

/**
 * Download a PDF from a URL to a local file path.
 * Retries on network errors and 429 responses with exponential backoff.
 * Does not retry on 403/404 or other client errors.
 */
export async function downloadPdf(
  url: string,
  destPath: string,
  options?: DownloadOptions
): Promise<DownloadResult> {
  const retries = options?.retries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const outcome = await attemptDownload(url, destPath);
      if (outcome.kind === "success" || outcome.kind === "fail") {
        return outcome.result;
      }
      lastError = outcome.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < retries) {
      await sleep(retryDelay * attempt);
    }
  }

  return { success: false, error: lastError ?? "Download failed" };
}
