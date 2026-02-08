/**
 * Unpaywall OA discovery client.
 * Checks Open Access availability via the Unpaywall API.
 *
 * API: https://api.unpaywall.org/v2/{doi}?email={email}
 * Rate limit: 100,000 requests/day (no per-second limit documented)
 */

import type { OALocation } from "../types.js";

const UNPAYWALL_BASE_URL = "https://api.unpaywall.org/v2";

/** Unpaywall API response location shape */
interface UnpaywallLocation {
  url_for_pdf?: string | null;
  url_for_landing_page?: string | null;
  license?: string | null;
  version?: string | null;
  host_type?: string | null;
}

/** Map Unpaywall version strings to our OALocation version format */
function mapVersion(version: string | null | undefined): OALocation["version"] {
  switch (version) {
    case "publishedVersion":
      return "published";
    case "acceptedVersion":
      return "accepted";
    case "submittedVersion":
      return "submitted";
    default:
      return "published";
  }
}

/** Convert an Unpaywall location to our OALocation format */
function toOALocation(loc: UnpaywallLocation): OALocation | null {
  const hasPdf = loc.url_for_pdf != null;
  const url = hasPdf ? loc.url_for_pdf : loc.url_for_landing_page;
  if (!url) return null;

  const result: OALocation = {
    source: "unpaywall",
    url,
    urlType: hasPdf ? "pdf" : "html",
    version: mapVersion(loc.version),
  };
  if (loc.license) {
    result.license = loc.license;
  }
  return result;
}

/**
 * Check Unpaywall for Open Access availability of an article.
 *
 * @param doi - The article's DOI
 * @param email - Email address required by Unpaywall API (free, no registration)
 * @returns Array of OALocations if OA, null if closed/not found
 * @throws On rate limit (429) or network errors
 */
export async function checkUnpaywall(doi: string, email: string): Promise<OALocation[] | null> {
  if (!doi) return null;

  if (!email) {
    throw new Error("Unpaywall email is required for API access");
  }

  const url = `${UNPAYWALL_BASE_URL}/${doi}?email=${encodeURIComponent(email)}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new Error("Unpaywall rate limit exceeded");
    }
    throw new Error(`Unpaywall API error: HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    is_oa?: boolean;
    oa_locations?: UnpaywallLocation[];
  };

  if (!data.is_oa || !data.oa_locations || data.oa_locations.length === 0) {
    return null;
  }

  const locations: OALocation[] = [];
  for (const loc of data.oa_locations) {
    const oaLoc = toOALocation(loc);
    if (oaLoc) locations.push(oaLoc);
  }

  return locations.length > 0 ? locations : null;
}
