/**
 * Markdown writer for JATS XML conversion.
 *
 * Converts the intermediate JatsDocument representation to Markdown text.
 */

import type {
  JatsDocument,
  JatsSection,
  JatsFootnote,
  BlockElement,
  InlineContent,
  JatsReference,
} from './types.js';

/**
 * Format an author's name in abbreviated form (e.g., "Smith J").
 */
function formatAuthor(author: { surname: string; givenNames?: string }): string {
  if (!author.givenNames) return author.surname;
  const initials = author.givenNames
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('');
  return `${author.surname} ${initials}`;
}

/**
 * Render inline content to Markdown string.
 */
function renderInline(content: InlineContent[]): string {
  return content
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text;
        case 'bold':
          return `**${renderInline(node.children)}**`;
        case 'italic':
          return `*${renderInline(node.children)}*`;
        case 'superscript':
          return `^${node.text}^`;
        case 'subscript':
          return `~${node.text}~`;
        case 'citation':
          return node.text;
        case 'code':
          return `\`${node.text}\``;
        case 'inline-formula':
          return node.tex ? `$${node.tex}$` : node.text;
        case 'link': {
          const linkText = renderInline(node.children);
          if (linkText === node.url) return node.url;
          return `[${linkText}](${node.url})`;
        }
      }
    })
    .join('');
}

/**
 * Render a block element to Markdown lines.
 */
function renderBlock(block: BlockElement): string {
  switch (block.type) {
    case 'paragraph':
      return renderInline(block.content);

    case 'blockquote': {
      const text = renderInline(block.content);
      return text
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
    }

    case 'list': {
      return block.items
        .map((item, i) => {
          const prefix = block.ordered ? `${i + 1}. ` : '- ';
          return `${prefix}${renderInline(item)}`;
        })
        .join('\n');
    }

    case 'table': {
      const lines: string[] = [];
      if (block.caption) {
        lines.push(`*${block.caption}*`);
        lines.push('');
      }
      if (block.headers.length > 0) {
        lines.push(`| ${block.headers.join(' | ')} |`);
        lines.push(`| ${block.headers.map(() => '---').join(' | ')} |`);
      } else if (block.rows.length > 0) {
        const colCount = block.rows[0]!.length;
        lines.push(`| ${Array.from({ length: colCount }, () => '').join(' | ')} |`);
        lines.push(`| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`);
      }
      for (const row of block.rows) {
        lines.push(`| ${row.join(' | ')} |`);
      }
      return lines.join('\n');
    }

    case 'figure': {
      const label = block.label ?? 'Figure';
      const altText = block.caption ? `${label}. ${block.caption}` : label;
      return `![${altText}]()`;
    }

    case 'preformat':
      return '```\n' + block.text + '\n```';

    case 'formula': {
      const lines: string[] = [];
      if (block.tex) {
        lines.push(`$$${block.tex}$$`);
      } else if (block.text) {
        lines.push('```');
        lines.push(block.text);
        lines.push('```');
      }
      if (block.label) {
        lines.push(block.label);
      }
      return lines.join('\n');
    }

    case 'def-list': {
      const lines: string[] = [];
      if (block.title) {
        lines.push(`**${block.title}**`);
        lines.push('');
      }
      for (const item of block.items) {
        lines.push(`**${item.term}**: ${item.definition}`);
      }
      return lines.join('\n');
    }

    case 'boxed-text': {
      const lines: string[] = [];
      if (block.title) {
        lines.push(`> **${block.title}**`);
        lines.push('>');
      }
      for (const inner of block.content) {
        const rendered = renderBlock(inner);
        rendered.split('\n').forEach((line) => {
          lines.push(line === '' ? '>' : `> ${line}`);
        });
      }
      return lines.join('\n');
    }
  }
}

/**
 * Render a section and its subsections to Markdown.
 */
function renderSection(section: JatsSection): string {
  const lines: string[] = [];
  const heading = '#'.repeat(section.level);

  if (section.title.trim()) {
    lines.push(`${heading} ${section.title}`);
    lines.push('');
  }

  for (const block of section.content) {
    lines.push(renderBlock(block));
    lines.push('');
  }

  for (const sub of section.subsections) {
    lines.push(renderSection(sub));
  }

  return lines.join('\n');
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
    links.push(`[pmcid:PMC${ref.pmcid}](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${ref.pmcid}/)`);
  }
  return links.join(' ');
}

function renderReferences(references: JatsReference[]): string {
  if (references.length === 0) return '';
  const lines: string[] = ['## References', ''];
  references.forEach((ref, i) => {
    const pubIdLinks = formatRefPubIds(ref);
    const line = pubIdLinks ? `${i + 1}. ${ref.text} ${pubIdLinks}` : `${i + 1}. ${ref.text}`;
    lines.push(line);
  });
  lines.push('');
  return lines.join('\n');
}

/**
 * Render footnotes section.
 */
function renderFootnotes(footnotes: JatsFootnote[]): string {
  if (footnotes.length === 0) return '';
  const lines: string[] = ['## Footnotes', ''];
  footnotes.forEach((fn, i) => {
    lines.push(`${i + 1}. ${fn.text}`);
  });
  lines.push('');
  return lines.join('\n');
}

/**
 * Render floats (figures and tables) section.
 */
function renderFloats(floats: BlockElement[]): string {
  if (floats.length === 0) return '';
  const lines: string[] = ['## Figures and Tables', ''];
  for (const block of floats) {
    lines.push(renderBlock(block));
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Convert a parsed JATS document to Markdown string.
 */
export function writeMarkdown(doc: JatsDocument): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${doc.metadata.title}`);
  lines.push('');

  // Authors
  if (doc.metadata.authors.length > 0) {
    const authorStr = doc.metadata.authors.map(formatAuthor).join(', ');
    lines.push(`**Authors**: ${authorStr}`);
  }

  // DOI
  if (doc.metadata.doi) {
    lines.push(`**DOI**: ${doc.metadata.doi}`);
  }

  // PMC
  if (doc.metadata.pmcid) {
    lines.push(`**PMC**: PMC${doc.metadata.pmcid}`);
  }

  // PMID
  if (doc.metadata.pmid) {
    lines.push(`**PMID**: ${doc.metadata.pmid}`);
  }

  // Journal
  if (doc.metadata.journal) {
    lines.push(`**Journal**: ${doc.metadata.journal}`);
  }

  // Published date
  if (doc.metadata.publicationDate) {
    const d = doc.metadata.publicationDate;
    let dateStr = d.year;
    if (d.month) {
      dateStr += `-${d.month.padStart(2, '0')}`;
      if (d.day) dateStr += `-${d.day.padStart(2, '0')}`;
    }
    lines.push(`**Published**: ${dateStr}`);
  }

  // Citation (volume/issue/pages)
  if (doc.metadata.volume || doc.metadata.issue || doc.metadata.pages) {
    const parts: string[] = [];
    if (doc.metadata.volume) parts.push(`Vol. ${doc.metadata.volume}`);
    if (doc.metadata.issue) parts.push(`(${doc.metadata.issue})`);
    if (doc.metadata.pages) parts.push(`pp. ${doc.metadata.pages}`);
    // Join: "Vol. 10(2), pp. 100-110" or similar
    let citation = '';
    if (doc.metadata.volume && doc.metadata.issue) {
      citation = `Vol. ${doc.metadata.volume}(${doc.metadata.issue})`;
      if (doc.metadata.pages) citation += `, pp. ${doc.metadata.pages}`;
    } else {
      citation = parts.join(', ');
    }
    lines.push(`**Citation**: ${citation}`);
  }

  // Article type
  if (doc.metadata.articleType) {
    lines.push(`**Article Type**: ${doc.metadata.articleType}`);
  }

  // Keywords
  if (doc.metadata.keywords && doc.metadata.keywords.length > 0) {
    lines.push(`**Keywords**: ${doc.metadata.keywords.join(', ')}`);
  }

  // License
  if (doc.metadata.license) {
    lines.push(`**License**: ${doc.metadata.license}`);
  }

  const hasMetaLines = doc.metadata.authors.length > 0 || doc.metadata.doi || doc.metadata.pmcid || doc.metadata.pmid || doc.metadata.journal || doc.metadata.publicationDate || doc.metadata.volume || doc.metadata.pages || (doc.metadata.keywords && doc.metadata.keywords.length > 0) || doc.metadata.articleType || doc.metadata.license;
  if (hasMetaLines) {
    lines.push('');
  }

  // Abstract
  if (doc.metadata.abstract) {
    lines.push('## Abstract');
    lines.push('');
    lines.push(doc.metadata.abstract);
    lines.push('');
  }

  // Sections
  for (const section of doc.sections) {
    lines.push(renderSection(section));
  }

  // Acknowledgments (before References)
  if (doc.acknowledgments) {
    lines.push('## Acknowledgments');
    lines.push('');
    lines.push(doc.acknowledgments);
    lines.push('');
  }

  // Notes (between Acknowledgments and References)
  if (doc.notes && doc.notes.length > 0) {
    for (const note of doc.notes) {
      lines.push(`## ${note.title}`);
      lines.push('');
      lines.push(note.text);
      lines.push('');
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

  return lines.join('\n').trimEnd() + '\n';
}
