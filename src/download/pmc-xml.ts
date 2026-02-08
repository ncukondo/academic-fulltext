/**
 * PMC XML downloader via E-utilities.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PMC_EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

/** Content types accepted as valid XML responses */
const VALID_XML_TYPES = ["text/xml", "application/xml"];

const USER_AGENT = "search-hub/0.8.0 (https://github.com/ncukondo/search-hub)";

function isValidXmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return VALID_XML_TYPES.includes(base);
}

/** Strip "PMC" prefix if present, returning numeric ID */
function normalizePmcid(pmcid: string): string {
  return pmcid.replace(/^PMC/i, "");
}

export interface PmcXmlResult {
  success: boolean;
  size?: number;
  error?: string;
}

/**
 * Download PMC XML for a given PMCID via E-utilities efetch.
 */
export async function downloadPmcXml(pmcid: string, destPath: string): Promise<PmcXmlResult> {
  const numericId = normalizePmcid(pmcid);
  const url = `${PMC_EFETCH_URL}?db=pmc&id=${numericId}&rettype=xml`;

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
    if (!isValidXmlContentType(contentType)) {
      return {
        success: false,
        error: `Unexpected Content-Type: ${contentType ?? "none"} (expected XML)`,
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
