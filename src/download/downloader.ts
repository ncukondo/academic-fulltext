/**
 * PDF downloader with retry and error handling.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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
const VALID_CONTENT_TYPES = ['application/pdf', 'application/octet-stream'];

const USER_AGENT = 'search-hub/0.8.0 (https://github.com/ncukondo/search-hub)';

function isValidPdfContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  return VALID_CONTENT_TYPES.includes(base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a PDF from a URL to a local file path.
 * Retries on network errors and 429 responses with exponential backoff.
 * Does not retry on 403/404 or other client errors.
 */
export async function downloadPdf(
  url: string,
  destPath: string,
  options?: DownloadOptions,
): Promise<DownloadResult> {
  const retries = options?.retries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        const status = response.status;
        if (NON_RETRYABLE_STATUSES.has(status)) {
          return { success: false, error: `HTTP ${status} ${response.statusText}` };
        }
        // Retryable status (429, 5xx)
        lastError = `HTTP ${status} ${response.statusText}`;
        if (attempt < retries) {
          await sleep(retryDelay * attempt);
          continue;
        }
        return { success: false, error: lastError };
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (!isValidPdfContentType(contentType)) {
        return {
          success: false,
          error: `Unexpected Content-Type: ${contentType ?? 'none'}`,
        };
      }

      const buffer = await response.arrayBuffer();

      // Ensure parent directory exists
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, Buffer.from(buffer));

      return { success: true, size: buffer.byteLength };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        await sleep(retryDelay * attempt);
        continue;
      }
    }
  }

  return { success: false, error: lastError ?? 'Download failed' };
}
