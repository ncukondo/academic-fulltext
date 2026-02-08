/**
 * CORE API OA discovery client.
 * Checks Open Access availability via the CORE API.
 *
 * API: https://api.core.ac.uk/v3/search/works?q=doi:"{doi}"
 * Auth: Bearer token (API key, free registration)
 * Rate limit: 10 req/sec
 */

import type { OALocation } from "../types.js";

const CORE_API_BASE = "https://api.core.ac.uk/v3";

/** CORE API search result shape */
interface CoreResult {
  downloadUrl?: string | null;
  sourceFulltextUrls?: string[];
}

/**
 * Check CORE API for Open Access availability of an article.
 *
 * @param doi - The article's DOI
 * @param apiKey - CORE API key (required; returns null if empty)
 * @returns Array of OALocations if found, null if not found or no key
 * @throws On rate limit (429) or network errors
 */
export async function checkCore(
  doi: string,
  apiKey: string | undefined
): Promise<OALocation[] | null> {
  if (!doi) return null;
  if (!apiKey) return null;

  const url = `${CORE_API_BASE}/search/works?q=doi:"${doi}"&limit=1`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("CORE API rate limit exceeded");
    }
    throw new Error(`CORE API error: HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    totalHits?: number;
    results?: CoreResult[];
  };

  if (!data.totalHits || !data.results || data.results.length === 0) {
    return null;
  }

  const firstResult = data.results[0 as number];
  if (!firstResult) return null;

  // Prefer downloadUrl (direct PDF from CORE)
  if (firstResult.downloadUrl) {
    return [
      {
        source: "core",
        url: firstResult.downloadUrl,
        urlType: "pdf",
        version: "accepted",
      },
    ];
  }

  // Fall back to sourceFulltextUrls (repository links)
  if (firstResult.sourceFulltextUrls && firstResult.sourceFulltextUrls.length > 0) {
    const repoUrl = firstResult.sourceFulltextUrls[0 as number];
    if (repoUrl) {
      return [
        {
          source: "core",
          url: repoUrl,
          urlType: "repository",
          version: "accepted",
        },
      ];
    }
  }

  return null;
}
