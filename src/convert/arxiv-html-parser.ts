/**
 * arXiv HTML to JatsDocument parser.
 *
 * Parses LaTeXML-generated HTML from arXiv and converts it to the intermediate
 * JatsDocument representation, which can then be rendered to Markdown via writeMarkdown().
 */

import { type HTMLElement, parse as parseHtml } from "node-html-parser";
import type {
  BlockElement,
  InlineContent,
  JatsAuthor,
  JatsDocument,
  JatsMetadata,
  JatsReference,
  JatsSection,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Query a single element, returning null if not found. */
function q(root: HTMLElement, selector: string): HTMLElement | null {
  return root.querySelector(selector);
}

/** Query all matching elements. */
function qa(root: HTMLElement, selector: string): HTMLElement[] {
  return root.querySelectorAll(selector);
}

/** Check if an element has a given CSS class. */
function hasClass(el: HTMLElement, cls: string): boolean {
  return el.classList.contains(cls);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Clone an element and remove <annotation> elements, then return textContent. */
function stripAnnotations(el: HTMLElement): string {
  const clone = parseHtml(el.outerHTML);
  for (const ann of qa(clone, "annotation")) {
    ann.remove();
  }
  return clone.textContent.trim();
}

// ---------------------------------------------------------------------------
// Inline content parsing — class-based handlers
// ---------------------------------------------------------------------------

/** Try matching a class-based inline element. Returns null if no match. */
function matchClassInline(el: HTMLElement): InlineContent | null {
  if (hasClass(el, "ltx_font_bold")) {
    return { type: "bold", children: parseInlineChildren(el) };
  }
  if (hasClass(el, "ltx_font_italic")) {
    return { type: "italic", children: parseInlineChildren(el) };
  }
  if (hasClass(el, "ltx_font_typewriter")) {
    return { type: "code", text: el.textContent.trim() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inline content parsing — tag-based handlers
// ---------------------------------------------------------------------------

type InlineHandler = (el: HTMLElement) => InlineContent | null;

function handleMath(el: HTMLElement): InlineContent {
  const alt = el.getAttribute("alttext");
  const text = stripAnnotations(el);
  const result: InlineContent = { type: "inline-formula", text };
  if (alt) (result as { tex?: string }).tex = alt;
  return result;
}

function handleAnchor(el: HTMLElement): InlineContent {
  const href = el.getAttribute("href") ?? "";
  if (href.startsWith("#bib")) {
    return { type: "citation", refId: href.slice(1), text: el.textContent.trim() };
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return { type: "link", url: href, children: parseInlineChildren(el) };
  }
  return { type: "text", text: el.textContent.trim() };
}

/** Dispatch map for tag names → inline handlers. */
const TAG_INLINE_HANDLERS: Record<string, InlineHandler> = {
  math: handleMath,
  a: handleAnchor,
  b: (el) => ({ type: "bold", children: parseInlineChildren(el) }),
  strong: (el) => ({ type: "bold", children: parseInlineChildren(el) }),
  i: (el) => ({ type: "italic", children: parseInlineChildren(el) }),
  em: (el) => ({ type: "italic", children: parseInlineChildren(el) }),
  code: (el) => ({ type: "code", text: el.textContent.trim() }),
  sup: (el) => ({ type: "superscript", text: el.textContent.trim() }),
  sub: (el) => ({ type: "subscript", text: el.textContent.trim() }),
};

/** Tags that should be recursed into as inline containers. */
const INLINE_CONTAINER_TAGS = new Set(["span", "cite"]);

/** Process a single element node into inline content. */
function processInlineElement(el: HTMLElement): InlineContent[] {
  // Class-based detection first
  const classMatch = matchClassInline(el);
  if (classMatch) return [classMatch];

  // Tag-based dispatch
  const tag = el.tagName?.toLowerCase() ?? "";
  const handler = TAG_INLINE_HANDLERS[tag];
  if (handler) {
    const content = handler(el);
    return content ? [content] : [];
  }

  // Inline containers: recurse
  if (INLINE_CONTAINER_TAGS.has(tag)) {
    return parseInlineChildren(el);
  }

  // Fallback: extract text
  const text = el.textContent.trim();
  return text ? [{ type: "text", text }] : [];
}

/** Parse inline content from child nodes of an element. */
function parseInlineChildren(parent: HTMLElement): InlineContent[] {
  const result: InlineContent[] = [];
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      if (text) result.push({ type: "text", text });
    } else if (node.nodeType === 1) {
      result.push(...processInlineElement(node as HTMLElement));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Block content parsing — individual block handlers
// ---------------------------------------------------------------------------

function parseParagraph(el: HTMLElement): BlockElement {
  const innerP = q(el, "p");
  return { type: "paragraph", content: parseInlineChildren(innerP ?? el) };
}

/**
 * Parse an ltx_para element which may contain a mix of <p> text and
 * block-level elements (equations, tables, etc.).
 */
function parseLtxPara(el: HTMLElement): BlockElement[] {
  const blocks: BlockElement[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    const childEl = child as HTMLElement;
    const tag = childEl.tagName?.toLowerCase() ?? "";
    if (tag === "section" || /^h[1-6]$/.test(tag)) continue;
    const block = matchBlockByClass(childEl) ?? matchBlockByTag(childEl, tag);
    if (block) {
      blocks.push(block);
    }
  }
  if (blocks.length === 0) {
    blocks.push(parseParagraph(el));
  }
  return blocks;
}

function parseList(el: HTMLElement): BlockElement {
  const tag = el.tagName?.toLowerCase() ?? "";
  const ordered = tag === "ol" || hasClass(el, "ltx_enumerate");
  const items: InlineContent[][] = [];
  for (const li of qa(el, "li")) {
    items.push(parseInlineChildren(li));
  }
  return { type: "list", ordered, items };
}

function parseFigure(el: HTMLElement): BlockElement {
  const labelEl = q(el, ".ltx_caption .ltx_tag_figure");
  const captionEl = q(el, ".ltx_caption");
  const id = el.getAttribute("id");

  let label: string | undefined;
  if (labelEl) {
    label = labelEl.textContent.trim().replace(/:$/, "");
  }

  let caption: string | undefined;
  if (captionEl) {
    const captionText = captionEl.textContent.trim();
    caption = label
      ? captionText.replace(new RegExp(`^${escapeRegex(label)}[:\\s]*`), "").trim()
      : captionText;
  }

  const block: BlockElement = { type: "figure" };
  if (id) (block as { id?: string }).id = id;
  if (label) (block as { label?: string }).label = label;
  if (caption) (block as { caption?: string }).caption = caption;
  return block;
}

function parseTableHeaders(thead: HTMLElement): string[] {
  const headers: string[] = [];
  const headerRow = q(thead, "tr") ?? q(thead, ".ltx_tr");
  if (headerRow) {
    for (const th of qa(headerRow, "th, td, .ltx_td")) {
      headers.push(stripAnnotations(th));
    }
  }
  return headers;
}

function parseTableRows(el: HTMLElement, thead: HTMLElement | null): string[][] {
  const rows: string[][] = [];
  const tbody = q(el, "tbody") ?? q(el, ".ltx_tbody") ?? el;
  for (const tr of qa(tbody, "tr, .ltx_tr")) {
    if (thead && tr.parentNode === thead) continue;
    const cells: string[] = [];
    for (const td of qa(tr, "td, th, .ltx_td")) {
      cells.push(stripAnnotations(td));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function parseTable(el: HTMLElement): BlockElement {
  const captionEl = q(el, ".ltx_caption");
  const thead = q(el, "thead") ?? q(el, ".ltx_thead");
  const headers = thead ? parseTableHeaders(thead) : [];
  const rows = parseTableRows(el, thead);

  if (captionEl) {
    return { type: "table", caption: captionEl.textContent.trim(), headers, rows };
  }
  return { type: "table", headers, rows };
}

function parseFormula(el: HTMLElement): BlockElement {
  const mathEl = q(el, "math");
  const id = el.getAttribute("id");
  const labelEl = q(el, ".ltx_tag_equation");
  const label = labelEl ? labelEl.textContent.trim() : undefined;

  let tex: string | undefined;
  let text: string | undefined;
  if (mathEl) {
    const alt = mathEl.getAttribute("alttext");
    if (alt) tex = alt;
    text = stripAnnotations(mathEl);
  } else {
    text = el.textContent.trim();
  }

  const block: BlockElement = { type: "formula" };
  if (id) (block as { id?: string }).id = id;
  if (label) (block as { label?: string }).label = label;
  if (tex) (block as { tex?: string }).tex = tex;
  if (text && !tex) (block as { text?: string }).text = text;
  return block;
}

// ---------------------------------------------------------------------------
// Block content parsing — dispatch
// ---------------------------------------------------------------------------

/** Match block elements by CSS class (checked before tag-based matching). */
function matchBlockByClass(el: HTMLElement): BlockElement | null {
  if (hasClass(el, "ltx_equation") || hasClass(el, "ltx_eqn_table")) return parseFormula(el);
  if (hasClass(el, "ltx_tabular")) return parseTable(el);
  return null;
}

/** Match block elements by tag name. */
function matchBlockByTag(el: HTMLElement, tag: string): BlockElement | null {
  if (tag === "p") return { type: "paragraph", content: parseInlineChildren(el) };
  if (tag === "ol" || tag === "ul") return parseList(el);
  if (tag === "figure" && hasClass(el, "ltx_table")) return parseTable(el);
  if (tag === "table") return parseTable(el);
  if (tag === "figure") return parseFigure(el);
  if (tag === "blockquote") return { type: "blockquote", content: parseInlineChildren(el) };
  if (tag === "pre") return { type: "preformat", text: el.textContent.trim() };
  return null;
}

/** Try to parse an element as a specific block type. Returns null if not matched. */
function matchBlock(el: HTMLElement): BlockElement | null {
  const tag = el.tagName?.toLowerCase() ?? "";
  if (tag === "section" || /^h[1-6]$/.test(tag)) return null;
  return matchBlockByClass(el) ?? matchBlockByTag(el, tag);
}

/** Parse block content from a section's child elements. */
function parseBlockContent(parent: HTMLElement): BlockElement[] {
  const blocks: BlockElement[] = [];
  for (const child of parent.childNodes) {
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    // ltx_para may contain mixed content (text + embedded equations/tables)
    if (hasClass(el, "ltx_para")) {
      blocks.push(...parseLtxPara(el));
      continue;
    }
    const block = matchBlock(el);
    if (block) {
      blocks.push(block);
      continue;
    }
    // Fallback: treat as paragraph if it has text and is not a skipped element
    const tag = el.tagName?.toLowerCase() ?? "";
    if (tag !== "section" && tag !== "nav" && !/^h[1-6]$/.test(tag)) {
      const text = el.textContent.trim();
      if (text) blocks.push({ type: "paragraph", content: parseInlineChildren(el) });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

/** Determine section level from CSS class. */
function getSectionLevel(el: HTMLElement): number {
  if (hasClass(el, "ltx_subsection")) return 3;
  if (hasClass(el, "ltx_subsubsection")) return 4;
  if (hasClass(el, "ltx_paragraph")) return 5;
  return 2;
}

/** Find the heading element for a section. */
function findHeading(el: HTMLElement, level: number): HTMLElement | null {
  return (
    q(el, `:scope > h${level}`) ??
    q(el, ":scope > h2") ??
    q(el, ":scope > h3") ??
    q(el, ":scope > h4") ??
    q(el, ":scope > h5") ??
    q(el, ":scope > h6")
  );
}

/** Parse a section element and its subsections recursively. */
function parseSection(el: HTMLElement): JatsSection {
  const level = getSectionLevel(el);
  const headingEl = findHeading(el, level);
  const title = headingEl ? headingEl.textContent.trim() : "";
  const content = parseBlockContent(el);

  const subsections: JatsSection[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    const childEl = child as HTMLElement;
    if (childEl.tagName?.toLowerCase() === "section") {
      subsections.push(parseSection(childEl));
    }
  }

  return { title, level, content, subsections };
}

// ---------------------------------------------------------------------------
// Metadata parsing
// ---------------------------------------------------------------------------

/** Extract document title from the HTML. */
function parseTitle(root: HTMLElement): string {
  const titleEl = q(root, ".ltx_title.ltx_title_document");
  if (!titleEl) return "";
  const titleClone = parseHtml(titleEl.outerHTML);
  for (const authorInTitle of qa(titleClone, ".ltx_authors")) {
    authorInTitle.remove();
  }
  return titleClone.textContent.trim();
}

/** Try to parse a comma-split part as an author. Returns null for affiliations. */
function parseAuthorName(commaPart: string): JatsAuthor | null {
  // Take the first non-empty line (affiliations appear on subsequent lines after <br>)
  const lines = commaPart.split(/\n/);
  const firstLine = lines.find((l) => l.trim() !== "")?.trim() ?? "";
  if (!firstLine) return null;
  // Skip affiliation entries: start with digit (e.g. "1IBM Research", "2 NASA MFSC")
  if (/^\d/.test(firstLine)) return null;
  // Remove trailing superscript digits (affiliation markers attached to names)
  const name = firstLine.replace(/\d+$/, "").trim();
  if (!name) return null;
  const words = name.split(/\s+/);
  const surname = words.pop() ?? name;
  const author: JatsAuthor = { surname };
  if (words.length > 0) author.givenNames = words.join(" ");
  return author;
}

/** Extract authors from the HTML. */
function parseAuthors(root: HTMLElement): JatsAuthor[] {
  const authors: JatsAuthor[] = [];
  for (const authorEl of qa(root, ".ltx_authors .ltx_personname")) {
    const fullText = authorEl.textContent.trim();
    if (!fullText) continue;
    // Split by comma to handle multiple authors in a single ltx_personname
    for (const part of fullText.split(",")) {
      const author = parseAuthorName(part);
      if (author) authors.push(author);
    }
  }
  return authors;
}

/** Extract abstract text from the HTML. */
function parseAbstract(root: HTMLElement): string | undefined {
  const abstractEl = q(root, ".ltx_abstract");
  if (!abstractEl) return undefined;
  const clone = parseHtml(abstractEl.outerHTML);
  const absTitle = q(clone, ".ltx_title");
  if (absTitle) absTitle.remove();
  for (const note of qa(clone, ".ltx_note")) {
    note.remove();
  }
  const text = clone.textContent.trim();
  return text || undefined;
}

/** Parse document metadata from the HTML. */
function parseMetadata(root: HTMLElement): JatsMetadata {
  const title = parseTitle(root);
  const authors = parseAuthors(root);
  const abstract = parseAbstract(root);

  const keywordEls = qa(root, ".ltx_keywords .ltx_text");
  const keywords = keywordEls.map((kw) => kw.textContent.trim()).filter(Boolean);

  const metadata: JatsMetadata = { title, authors };
  if (abstract) metadata.abstract = abstract;
  if (keywords.length > 0) metadata.keywords = keywords;
  return metadata;
}

// ---------------------------------------------------------------------------
// References parsing
// ---------------------------------------------------------------------------

/** Extract reference text from a bibitem element. */
function extractRefText(item: HTMLElement): string {
  const bibBlock = q(item, ".ltx_bibblock");
  if (bibBlock) return bibBlock.textContent.trim();

  let text = item.textContent.trim();
  const labelEl = q(item, ".ltx_tag_bibitem");
  if (labelEl) {
    const labelText = labelEl.textContent.trim();
    if (text.startsWith(labelText)) {
      text = text.slice(labelText.length).trim();
    }
  }
  return text;
}

/** Extract DOI from links in a bibitem. */
function extractDoi(item: HTMLElement): string | undefined {
  for (const link of qa(item, "a")) {
    const href = link.getAttribute("href") ?? "";
    const doiMatch = href.match(/doi\.org\/(.+)/);
    if (doiMatch) return doiMatch[1];
  }
  return undefined;
}

/** Parse bibliography references. */
function parseReferences(root: HTMLElement): JatsReference[] {
  const refs: JatsReference[] = [];
  for (const item of qa(root, ".ltx_bibitem")) {
    const id = item.getAttribute("id") ?? `ref${refs.length + 1}`;
    const text = extractRefText(item);
    const doi = extractDoi(item);
    const ref: JatsReference = { id, text };
    if (doi) ref.doi = doi;
    refs.push(ref);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Acknowledgments parsing
// ---------------------------------------------------------------------------

function parseAcknowledgments(root: HTMLElement): string | undefined {
  const ackEl = q(root, ".ltx_acknowledgement");
  if (!ackEl) return undefined;
  const clone = parseHtml(ackEl.outerHTML);
  const heading = q(clone, ".ltx_title");
  if (heading) heading.remove();
  const text = clone.textContent.trim();
  return text || undefined;
}

// ---------------------------------------------------------------------------
// Body sections parsing (shared logic)
// ---------------------------------------------------------------------------

/** Check if a section element is a body section (not bibliography or acknowledgements). */
function isBodySection(el: HTMLElement): boolean {
  return (
    el.tagName?.toLowerCase() === "section" &&
    !hasClass(el, "ltx_bibliography") &&
    !hasClass(el, "ltx_acknowledgement")
  );
}

/** Parse body sections from an article root element. */
function parseBodySections(article: HTMLElement): JatsSection[] {
  const sections: JatsSection[] = [];
  for (const child of article.childNodes) {
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    if (isBodySection(el)) {
      sections.push(parseSection(el));
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse arXiv LaTeXML HTML into a JatsDocument.
 * @param html - Full HTML string from arXiv
 * @returns Complete parsed document
 */
export function parseArxivHtml(html: string): JatsDocument {
  const root = parseHtml(html);
  const metadata = parseMetadata(root);
  const references = parseReferences(root);
  const article = q(root, "article.ltx_document") ?? root;
  const sections = parseBodySections(article);
  const acknowledgments = parseAcknowledgments(root);

  const doc: JatsDocument = { metadata, sections, references };
  if (acknowledgments) doc.acknowledgments = acknowledgments;
  return doc;
}

/**
 * Parse only metadata from arXiv HTML.
 */
export function parseArxivHtmlMetadata(html: string): JatsMetadata {
  return parseMetadata(parseHtml(html));
}

/**
 * Parse only body sections from arXiv HTML.
 */
export function parseArxivHtmlBody(html: string): JatsSection[] {
  const root = parseHtml(html);
  const article = q(root, "article.ltx_document") ?? root;
  return parseBodySections(article);
}

/**
 * Parse only references from arXiv HTML.
 */
export function parseArxivHtmlReferences(html: string): JatsReference[] {
  return parseReferences(parseHtml(html));
}
