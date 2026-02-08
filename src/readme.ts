/**
 * README.md template generation for article fulltext directories.
 */

import type { FulltextMeta } from "./types.js";

/** Generate a README.md for an article's fulltext directory. */
export function generateReadme(meta: FulltextMeta): string {
  const lines: string[] = [];

  // Heading
  lines.push(`# ${meta.citationKey}`);
  lines.push("");
  lines.push(`**Title**: ${meta.title}`);

  if (meta.authors) {
    lines.push(`**Authors**: ${meta.authors}`);
  }
  if (meta.year) {
    lines.push(`**Year**: ${meta.year}`);
  }

  // Identifiers
  const identifiers: string[] = [];
  if (meta.doi) identifiers.push(`- DOI: ${meta.doi}`);
  if (meta.pmid) identifiers.push(`- PMID: ${meta.pmid}`);
  if (meta.pmcid) identifiers.push(`- PMC: ${meta.pmcid}`);
  if (meta.arxivId) identifiers.push(`- arXiv: ${meta.arxivId}`);

  if (identifiers.length > 0) {
    lines.push("");
    lines.push("## Identifiers");
    lines.push("");
    lines.push(...identifiers);
  }

  // Download URLs
  const urls: string[] = [];
  if (meta.doi) {
    urls.push(`- Publisher: https://doi.org/${meta.doi}`);
  }
  if (meta.pmcid) {
    const pmcNum = meta.pmcid.replace(/^PMC/i, "");
    urls.push(`- PMC PDF: https://www.ncbi.nlm.nih.gov/pmc/articles/${meta.pmcid}/pdf/`);
    urls.push(
      `- PMC XML: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcNum}`
    );
  }
  if (meta.arxivId) {
    urls.push(`- arXiv PDF: https://arxiv.org/pdf/${meta.arxivId}.pdf`);
  }

  if (urls.length > 0) {
    lines.push("");
    lines.push("## Download URLs");
    lines.push("");
    lines.push(...urls);
  }

  // Instructions
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push("Place fulltext files in this directory:");
  lines.push("- `fulltext.pdf` - PDF version");
  lines.push("- `fulltext.md` - Markdown version (optional)");
  lines.push("");
  lines.push("After adding files, run:");
  lines.push("```");
  lines.push("search-hub fulltext sync <session-id>");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
