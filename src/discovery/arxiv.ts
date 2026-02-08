/**
 * arXiv OA discovery client.
 * Generates PDF download URLs for arXiv articles.
 *
 * URL pattern: https://arxiv.org/pdf/{id}.pdf
 * No API call needed — arXiv is always open access.
 */

import type { OALocation } from "../types.js";

/** Strip common prefixes from arXiv IDs */
function normalizeArxivId(id: string): string {
  return id.replace(/^arXiv:/i, "");
}

/**
 * Check arXiv availability for an article.
 * Since all arXiv articles are freely available, this simply
 * generates the PDF URL from the arXiv ID.
 *
 * @param arxivId - arXiv identifier (e.g., "2401.12345", "hep-ph/9901234")
 * @returns Array with a single PDF OALocation, or null if no ID
 */
export function checkArxiv(arxivId: string): OALocation[] | null {
  if (!arxivId) return null;

  const id = normalizeArxivId(arxivId);

  return [
    {
      source: "arxiv",
      url: `https://arxiv.org/pdf/${id}.pdf`,
      urlType: "pdf",
      version: "submitted",
    },
  ];
}
