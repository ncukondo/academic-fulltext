/**
 * PMC OA discovery client.
 * Checks PubMed Central availability and generates download URLs.
 *
 * PDF: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id}/pdf/
 * XML: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcid}&rettype=xml
 * PMID→PMCID: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pmc&id={pmid}&retmode=json
 */

import type { OALocation } from '../types.js';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export interface PmcIdentifiers {
  pmid?: string;
  pmcid?: string;
}

export interface PmcOptions {
  apiKey?: string;
}

/** Strip "PMC" prefix from PMCID, returning just the numeric part */
function stripPmcPrefix(pmcid: string): string {
  return pmcid.replace(/^PMC/i, '');
}

/** Ensure PMCID has the "PMC" prefix */
function ensurePmcPrefix(pmcid: string): string {
  return pmcid.startsWith('PMC') ? pmcid : `PMC${pmcid}`;
}

/**
 * Generate PMC download URLs from a known PMCID.
 */
export function getPmcUrls(pmcid: string): OALocation[] {
  const numericId = stripPmcPrefix(pmcid);
  const fullPmcid = ensurePmcPrefix(pmcid);

  return [
    {
      source: 'pmc',
      url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${fullPmcid}/pdf/`,
      urlType: 'pdf',
      version: 'published',
    },
    {
      source: 'pmc',
      url: `${EUTILS_BASE}/efetch.fcgi?db=pmc&id=${numericId}&rettype=xml`,
      urlType: 'xml',
      version: 'published',
    },
  ];
}

/**
 * Look up PMCID from PMID via E-utilities elink API.
 * @returns PMCID string or null if not in PMC
 */
async function lookupPmcid(pmid: string, options?: PmcOptions): Promise<string | null> {
  let url = `${EUTILS_BASE}/elink.fcgi?dbfrom=pubmed&db=pmc&id=${pmid}&retmode=json`;
  if (options?.apiKey) {
    url += `&api_key=${options.apiKey}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PMC elink API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    linksets?: Array<{
      linksetdbs?: Array<{
        dbto: string;
        links?: string[];
      }>;
    }>;
  };

  const linksets = data.linksets;
  if (!linksets || linksets.length === 0) return null;

  const firstLinkset = linksets[0 as number];
  if (!firstLinkset?.linksetdbs) return null;

  const pmcLink = firstLinkset.linksetdbs.find((db) => db.dbto === 'pmc');
  if (!pmcLink?.links || pmcLink.links.length === 0) return null;

  const pmcNumericId = pmcLink.links[0 as number];
  return pmcNumericId ? `PMC${pmcNumericId}` : null;
}

/**
 * Check PMC availability for an article.
 * If PMCID is known, generates URLs directly.
 * If only PMID is known, looks up PMCID via E-utilities elink.
 */
export async function checkPmc(
  ids: PmcIdentifiers,
  options?: PmcOptions
): Promise<OALocation[] | null> {
  // If PMCID is already known, generate URLs directly
  if (ids.pmcid) {
    return getPmcUrls(ids.pmcid);
  }

  // If only PMID is known, look up PMCID
  if (ids.pmid) {
    const pmcid = await lookupPmcid(ids.pmid, options);
    if (!pmcid) return null;
    return getPmcUrls(pmcid);
  }

  // No identifiers provided
  return null;
}
