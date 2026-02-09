/**
 * Unpaywall OA discovery client.
 * Checks Open Access availability via the Unpaywall API.
 *
 * API: https://api.unpaywall.org/v2/{doi}?email={email}
 * Rate limit: 100,000 requests/day (no per-second limit documented)
 */

import type { OALocation } from "../types.js";

const UNPAYWALL_BASE_URL = "https://api.unpaywall.org/v2";

/** Regex to extract PMCID from PMC URLs */
const PMC_URL_PATTERN = /\/pmc\/articles\/(PMC\d+)/i;

/** Unpaywall API response location shape */
interface UnpaywallLocation {
  url_for_pdf?: string | null;
  url_for_landing_page?: string | null;
  license?: string | null;
  version?: string | null;
  host_type?: string | null;
}

/** Detailed result from Unpaywall including extracted PMCID */
export interface UnpaywallDetailedResult {
  locations: OALocation[];
  pmcid?: string;
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
 * Extract PMCID from a URL containing a PMC article link.
 * E.g., "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/" → "PMC1234567"
 */
export function extractPmcidFromUrl(url: string): string | null {
  const match = PMC_URL_PATTERN.exec(url);
  return match ? (match[1 as number] ?? null) : null;
}

/**
 * Scan Unpaywall locations for a PMCID embedded in any URL.
 */
function extractPmcidFromLocations(locations: UnpaywallLocation[]): string | null {
  for (const loc of locations) {
    if (loc.url_for_pdf) {
      const pmcid = extractPmcidFromUrl(loc.url_for_pdf);
      if (pmcid) return pmcid;
    }
    if (loc.url_for_landing_page) {
      const pmcid = extractPmcidFromUrl(loc.url_for_landing_page);
      if (pmcid) return pmcid;
    }
  }
  return null;
}

interface UnpaywallApiResponse {
  is_oa?: boolean;
  oa_locations?: UnpaywallLocation[];
}

/**
 * Fetch Unpaywall API and return raw response data.
 */
async function fetchUnpaywallData(
  doi: string,
  email: string
): Promise<UnpaywallApiResponse | null> {
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

  return (await response.json()) as UnpaywallApiResponse;
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
  const data = await fetchUnpaywallData(doi, email);

  if (!data || !data.is_oa || !data.oa_locations || data.oa_locations.length === 0) {
    return null;
  }

  const locations: OALocation[] = [];
  for (const loc of data.oa_locations) {
    const oaLoc = toOALocation(loc);
    if (oaLoc) locations.push(oaLoc);
  }

  return locations.length > 0 ? locations : null;
}

/**
 * Check Unpaywall with detailed results including extracted PMCID.
 * Returns both OA locations and any PMCID found in the location URLs.
 *
 * @param doi - The article's DOI
 * @param email - Email address required by Unpaywall API (free, no registration)
 * @returns Detailed result with locations and optional pmcid, or null if closed/not found
 * @throws On rate limit (429) or network errors
 */
export async function checkUnpaywallDetailed(
  doi: string,
  email: string
): Promise<UnpaywallDetailedResult | null> {
  const data = await fetchUnpaywallData(doi, email);

  if (!data || !data.is_oa || !data.oa_locations || data.oa_locations.length === 0) {
    return null;
  }

  const locations: OALocation[] = [];
  for (const loc of data.oa_locations) {
    const oaLoc = toOALocation(loc);
    if (oaLoc) locations.push(oaLoc);
  }

  if (locations.length === 0) return null;

  const pmcid = extractPmcidFromLocations(data.oa_locations);
  const result: UnpaywallDetailedResult = { locations };
  if (pmcid) result.pmcid = pmcid;

  return result;
}
