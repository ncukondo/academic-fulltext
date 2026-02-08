/**
 * Markdown writer for JATS XML conversion.
 *
 * Converts the intermediate JatsDocument representation to Markdown text.
 */

import type {
  BlockElement,
  InlineContent,
  JatsDocument,
  JatsFootnote,
  JatsReference,
  JatsSection,
} from "./types.js";

/**
 * Format an author's name in abbreviated form (e.g., "Smith J").
 */
function formatAuthor(author: { surname: string; givenNames?: string }): string {
  if (!author.givenNames) return author.surname;
  const initials = author.givenNames
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("");
  return `${author.surname} ${initials}`;
}

/**
 * Render inline content to Markdown string.
 */
function renderInline(content: InlineContent[]): string {
  return content
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "bold":
          return `**${renderInline(node.children)}**`;
        case "italic":
          return `*${renderInline(node.children)}*`;
        case "superscript":
          return `^${node.text}^`;
        case "subscript":
          return `~${node.text}~`;
        case "citation":
          return node.text;
        case "code":
          return `\`${node.text}\``;
        case "inline-formula":
          return node.tex ? `$${node.tex}$` : node.text;
        case "link": {
          const linkText = renderInline(node.children);
          if (linkText === node.url) return node.url;
          return `[${linkText}](${node.url})`;
        }
      }
    })
    .join("");
}

/**
 * Render a table block to Markdown.
 */
function renderTable(block: Extract<BlockElement, { type: "table" }>): string {
  const lines: string[] = [];
  if (block.caption) {
    lines.push(`*${block.caption}*`);
    lines.push("");
  }
  if (block.headers.length > 0) {
    lines.push(`| ${block.headers.join(" | ")} |`);
    lines.push(`| ${block.headers.map(() => "---").join(" | ")} |`);
  } else if (block.rows.length > 0) {
    const colCount = block.rows[0]?.length;
    lines.push(`| ${Array.from({ length: colCount }, () => "").join(" | ")} |`);
    lines.push(`| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`);
  }
  for (const row of block.rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

/**
 * Render a formula block to Markdown.
 */
function renderFormula(block: Extract<BlockElement, { type: "formula" }>): string {
  const lines: string[] = [];
  if (block.tex) {
    lines.push(`$$${block.tex}$$`);
  } else if (block.text) {
    lines.push("```");
    lines.push(block.text);
    lines.push("```");
  }
  if (block.label) {
    lines.push(block.label);
  }
  return lines.join("\n");
}

/**
 * Render a definition list block to Markdown.
 */
function renderDefList(block: Extract<BlockElement, { type: "def-list" }>): string {
  const lines: string[] = [];
  if (block.title) {
    lines.push(`**${block.title}**`);
    lines.push("");
  }
  for (const item of block.items) {
    lines.push(`**${item.term}**: ${item.definition}`);
  }
  return lines.join("\n");
}

/**
 * Render a boxed-text block to Markdown.
 */
function renderBoxedText(block: Extract<BlockElement, { type: "boxed-text" }>): string {
  const lines: string[] = [];
  if (block.title) {
    lines.push(`> **${block.title}**`);
    lines.push(">");
  }
  for (const inner of block.content) {
    const rendered = renderBlock(inner);
    for (const line of rendered.split("\n")) {
      lines.push(line === "" ? ">" : `> ${line}`);
    }
  }
  return lines.join("\n");
}

/**
 * Render a block element to Markdown lines.
 */
function renderBlock(block: BlockElement): string {
  switch (block.type) {
    case "paragraph":
      return renderInline(block.content);

    case "blockquote": {
      const text = renderInline(block.content);
      return text
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`))
        .join("\n");
    }

    case "list": {
      return block.items
        .map((item, i) => {
          const prefix = block.ordered ? `${i + 1}. ` : "- ";
          return `${prefix}${renderInline(item)}`;
        })
        .join("\n");
    }

    case "table":
      return renderTable(block);

    case "figure": {
      const label = block.label ?? "Figure";
      const altText = block.caption ? `${label}. ${block.caption}` : label;
      return `![${altText}]()`;
    }

    case "preformat":
      return `\`\`\`\n${block.text}\n\`\`\``;

    case "formula":
      return renderFormula(block);

    case "def-list":
      return renderDefList(block);

    case "boxed-text":
      return renderBoxedText(block);
  }
}

/**
 * Render a section and its subsections to Markdown.
 */
function renderSection(section: JatsSection): string {
  const lines: string[] = [];
  const heading = "#".repeat(section.level);

  if (section.title.trim()) {
    lines.push(`${heading} ${section.title}`);
    lines.push("");
  }

  for (const block of section.content) {
    lines.push(renderBlock(block));
    lines.push("");
  }

  for (const sub of section.subsections) {
    lines.push(renderSection(sub));
  }

  return lines.join("\n");
}

/**
 * Render references section.
 */
function formatRefPubIds(ref: JatsReference): string {
  const links: string[] = [];
  if (ref.doi) {
    links.push(`[doi:${ref.doi}](https://doi.org/${ref.doi})`);
  }
  if (ref.pmid) {
    links.push(`[pmid:${ref.pmid}](https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/)`);
  }
  if (ref.pmcid) {
    links.push(
      `[pmcid:PMC${ref.pmcid}](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${ref.pmcid}/)`
    );
  }
  return links.join(" ");
}

function renderReferences(references: JatsReference[]): string {
  if (references.length === 0) return "";
  const lines: string[] = ["## References", ""];
  references.forEach((ref, i) => {
    const pubIdLinks = formatRefPubIds(ref);
    const line = pubIdLinks ? `${i + 1}. ${ref.text} ${pubIdLinks}` : `${i + 1}. ${ref.text}`;
    lines.push(line);
  });
  lines.push("");
  return lines.join("\n");
}

/**
 * Render footnotes section.
 */
function renderFootnotes(footnotes: JatsFootnote[]): string {
  if (footnotes.length === 0) return "";
  const lines: string[] = ["## Footnotes", ""];
  footnotes.forEach((fn, i) => {
    lines.push(`${i + 1}. ${fn.text}`);
  });
  lines.push("");
  return lines.join("\n");
}

/**
 * Render floats (figures and tables) section.
 */
function renderFloats(floats: BlockElement[]): string {
  if (floats.length === 0) return "";
  const lines: string[] = ["## Figures and Tables", ""];
  for (const block of floats) {
    lines.push(renderBlock(block));
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Format a publication date as a string (e.g., "2024", "2024-01", "2024-01-15").
 */
function formatPublicationDate(date: { year: string; month?: string; day?: string }): string {
  let dateStr = date.year;
  if (date.month) {
    dateStr += `-${date.month.padStart(2, "0")}`;
    if (date.day) dateStr += `-${date.day.padStart(2, "0")}`;
  }
  return dateStr;
}

/**
 * Format a citation string from volume, issue, and pages.
 */
function formatCitation(meta: {
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  if (meta.volume && meta.issue) {
    let citation = `Vol. ${meta.volume}(${meta.issue})`;
    if (meta.pages) citation += `, pp. ${meta.pages}`;
    return citation;
  }
  const parts: string[] = [];
  if (meta.volume) parts.push(`Vol. ${meta.volume}`);
  if (meta.issue) parts.push(`(${meta.issue})`);
  if (meta.pages) parts.push(`pp. ${meta.pages}`);
  return parts.join(", ");
}

/**
 * Render document metadata (authors, DOI, journal, etc.) to Markdown lines.
 */
function renderMetadata(doc: JatsDocument): string[] {
  const lines: string[] = [];
  const meta = doc.metadata;

  // Title
  lines.push(`# ${meta.title}`);
  lines.push("");

  // Track position after title to detect if any metadata fields were added
  const posAfterTitle = lines.length;

  // Authors
  if (meta.authors.length > 0) {
    const authorStr = meta.authors.map(formatAuthor).join(", ");
    lines.push(`**Authors**: ${authorStr}`);
  }

  if (meta.doi) lines.push(`**DOI**: ${meta.doi}`);
  if (meta.pmcid) lines.push(`**PMC**: PMC${meta.pmcid}`);
  if (meta.pmid) lines.push(`**PMID**: ${meta.pmid}`);
  if (meta.journal) lines.push(`**Journal**: ${meta.journal}`);

  if (meta.publicationDate) {
    lines.push(`**Published**: ${formatPublicationDate(meta.publicationDate)}`);
  }

  if (meta.volume || meta.issue || meta.pages) {
    lines.push(`**Citation**: ${formatCitation(meta)}`);
  }

  if (meta.articleType) lines.push(`**Article Type**: ${meta.articleType}`);

  if (meta.keywords && meta.keywords.length > 0) {
    lines.push(`**Keywords**: ${meta.keywords.join(", ")}`);
  }

  if (meta.license) lines.push(`**License**: ${meta.license}`);

  if (lines.length > posAfterTitle) {
    lines.push("");
  }

  // Abstract
  if (meta.abstract) {
    lines.push("## Abstract");
    lines.push("");
    lines.push(meta.abstract);
    lines.push("");
  }

  return lines;
}

/**
 * Render trailing sections (acknowledgments, notes, references, appendices,
 * footnotes, floats) to Markdown lines.
 */
function renderTrailingSections(doc: JatsDocument): string[] {
  const lines: string[] = [];

  // Acknowledgments (before References)
  if (doc.acknowledgments) {
    lines.push("## Acknowledgments");
    lines.push("");
    lines.push(doc.acknowledgments);
    lines.push("");
  }

  // Notes (between Acknowledgments and References)
  if (doc.notes && doc.notes.length > 0) {
    for (const note of doc.notes) {
      lines.push(`## ${note.title}`);
      lines.push("");
      lines.push(note.text);
      lines.push("");
    }
  }

  // References
  if (doc.references.length > 0) {
    lines.push(renderReferences(doc.references));
  }

  // Appendices (after References)
  if (doc.appendices && doc.appendices.length > 0) {
    for (const appendix of doc.appendices) {
      lines.push(renderSection(appendix));
    }
  }

  // Footnotes
  if (doc.footnotes && doc.footnotes.length > 0) {
    lines.push(renderFootnotes(doc.footnotes));
  }

  // Floats (Figures and Tables from floats-group)
  if (doc.floats && doc.floats.length > 0) {
    lines.push(renderFloats(doc.floats));
  }

  return lines;
}

/**
 * Convert a parsed JATS document to Markdown string.
 */
export function writeMarkdown(doc: JatsDocument): string {
  const lines: string[] = [];

  lines.push(...renderMetadata(doc));

  // Sections
  for (const section of doc.sections) {
    lines.push(renderSection(section));
  }

  lines.push(...renderTrailingSections(doc));

  return `${lines.join("\n").trimEnd()}\n`;
}
