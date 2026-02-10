/**
 * JATS XML parser for PMC articles.
 *
 * Parses JATS (Journal Article Tag Suite) XML into an intermediate
 * representation for Markdown conversion.
 *
 * Uses fast-xml-parser with `preserveOrder: true` to maintain document order
 * of interleaved elements (e.g. text, citations, formatting).
 */

import { XMLParser } from "fast-xml-parser";
import type {
  BackMatterNote,
  BlockElement,
  InlineContent,
  JatsAuthor,
  JatsFootnote,
  JatsMetadata,
  JatsReference,
  JatsSection,
} from "./types.js";

/**
 * A node in the preserveOrder output.
 * Either a text node `{ "#text": string | number }` or an element node
 * `{ tagName: OrderedNode[], ":@"?: { "@_attr": value } }`.
 */
type OrderedNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,
  preserveOrder: true,
  processEntities: true,
  htmlEntities: true,
});

// ─── Navigation Helpers ──────────────────────────────────────────────

/** Get the tag name of an ordered node (the first key that isn't ":@" or "#text"). */
function getTagName(node: OrderedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return undefined;
}

/** Get the children array of an element node. */
function getChildren(node: OrderedNode): OrderedNode[] {
  const tag = getTagName(node);
  if (!tag) return [];
  const children = node[tag];
  return Array.isArray(children) ? (children as OrderedNode[]) : [];
}

/** Get attributes of an element node. */
function getAttr(node: OrderedNode, attrName: string): string | undefined {
  const attrs = node[":@"] as Record<string, unknown> | undefined;
  if (!attrs) return undefined;
  const val = attrs[`@_${attrName}`];
  return val != null ? String(val) : undefined;
}

/** Get all attributes of an element node (strips @_ prefix for consistency with getAttr). */
function getAttrs(node: OrderedNode): Record<string, string> {
  const attrs = node[":@"] as Record<string, unknown> | undefined;
  if (!attrs) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("@_")) {
      result[key.slice(2)] = String(value);
    }
  }
  return result;
}

/** Find the first child element with the given tag name. */
function findChild(
  children: OrderedNode[],
  tagName: string
): { node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> } | undefined {
  for (const child of children) {
    if (tagName in child) {
      const childArr = child[tagName];
      return {
        node: child,
        children: Array.isArray(childArr) ? (childArr as OrderedNode[]) : [],
        attrs: getAttrs(child),
      };
    }
  }
  return undefined;
}

/** Find all child elements with the given tag name. */
function findChildren(
  children: OrderedNode[],
  tagName: string
): Array<{ node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> }> {
  const results: Array<{
    node: OrderedNode;
    children: OrderedNode[];
    attrs: Record<string, string>;
  }> = [];
  for (const child of children) {
    if (tagName in child) {
      const childArr = child[tagName];
      results.push({
        node: child,
        children: Array.isArray(childArr) ? (childArr as OrderedNode[]) : [],
        attrs: getAttrs(child),
      });
    }
  }
  return results;
}

/** Get text content from a #text node. */
function getTextContent(child: OrderedNode): string | undefined {
  if ("#text" in child) {
    const val = child["#text"];
    return val != null ? String(val) : undefined;
  }
  return undefined;
}

/**
 * Find the <article> element, handling optional <pmc-articleset> wrapper
 * that appears in efetch responses.
 */
function findArticle(
  parsed: OrderedNode[]
): { node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> } | undefined {
  const direct = findChild(parsed, "article");
  if (direct) return direct;
  const wrapper = findChild(parsed, "pmc-articleset");
  if (wrapper) return findChild(wrapper.children, "article");
  return undefined;
}

// ─── Text Extraction ─────────────────────────────────────────────────

/** Tags whose text content should be followed by a space when adjacent to other content. */
const SPACE_AFTER_TAGS = new Set(["surname", "given-names", "name", "string-name"]);

/**
 * Extract plain text from a node that may contain nested elements.
 * Recursively collects all text content from preserveOrder nodes.
 *
 * When extracting text from inline container elements (e.g. `<name>`,
 * `<string-name>`), inserts a space between adjacent child elements
 * that would otherwise concatenate without whitespace (e.g.
 * `<surname>McGuire</surname><given-names>N</given-names>` → `McGuire N`).
 */
function extractAllText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return joinChildTexts(node);
  }
  if (typeof node === "object") {
    const obj = node as OrderedNode;
    // Text node
    const text = getTextContent(obj);
    if (text != null) return text;
    // Element node — recurse into children
    const tag = getTagName(obj);
    if (tag) {
      const children = obj[tag];
      if (Array.isArray(children)) {
        return joinChildTexts(children as OrderedNode[]);
      }
    }
  }
  return "";
}

/**
 * Join extracted text from an array of child nodes, inserting spaces
 * between adjacent inline elements where no whitespace separator exists.
 */
function joinChildTexts(children: OrderedNode[]): string {
  const parts: string[] = [];
  for (const child of children) {
    const text = extractAllText(child);
    if (!text) continue;

    const tag = getTagName(child as OrderedNode);

    // If this is a space-after tag and there's previous content that doesn't
    // end with whitespace or punctuation, insert a space before this text.
    if (tag && SPACE_AFTER_TAGS.has(tag) && parts.length > 0) {
      const prev = parts.at(-1);
      if (prev && !/[\s,;.:()\-/]$/.test(prev)) {
        parts.push(" ");
      }
    }

    parts.push(text);

    // If this is a space-after tag, check if a space is needed after.
    // We handle this by peeking: space will be inserted before the next
    // element if needed (handled above). But we also need to handle
    // the case where the next sibling is a text node starting without space.
    // That's already handled since text nodes include their own whitespace.
  }
  return parts.join("");
}

// ─── Metadata Parsing ────────────────────────────────────────────────

/** Extract DOI, PMCID, and PMID from article-id elements. */
function parseArticleIds(metaChildren: OrderedNode[]): {
  doi?: string;
  pmcid?: string;
  pmid?: string;
} {
  const articleIds = findChildren(metaChildren, "article-id");
  const result: { doi?: string; pmcid?: string; pmid?: string } = {};
  for (const idEntry of articleIds) {
    const idType = idEntry.attrs["pub-id-type"];
    const idText = extractAllText(idEntry.children);
    if (idType === "doi") result.doi = idText;
    if (idType === "pmc" || idType === "pmcid") {
      result.pmcid = idText.replace(/^PMC/, "");
    }
    if (idType === "pmid") result.pmid = idText;
  }
  return result;
}

/** Extract authors from contrib-group. */
function parseAuthors(metaChildren: OrderedNode[]): JatsAuthor[] {
  const authors: JatsAuthor[] = [];
  const contribGroup = findChild(metaChildren, "contrib-group");
  if (!contribGroup) return authors;

  const contribs = findChildren(contribGroup.children, "contrib");
  for (const contrib of contribs) {
    if (contrib.attrs["contrib-type"] !== "author") continue;
    const nameNode = findChild(contrib.children, "name");
    if (!nameNode) continue;
    const surnameNode = findChild(nameNode.children, "surname");
    const givenNamesNode = findChild(nameNode.children, "given-names");
    const author: JatsAuthor = {
      surname: surnameNode ? extractAllText(surnameNode.children) : "",
    };
    const givenNames = givenNamesNode ? extractAllText(givenNamesNode.children) : "";
    if (givenNames) {
      author.givenNames = givenNames;
    }
    authors.push(author);
  }
  return authors;
}

/** Extract abstract text, handling both structured and simple formats. */
function parseAbstract(metaChildren: OrderedNode[]): string | undefined {
  const abstractNode = findChild(metaChildren, "abstract");
  if (!abstractNode) return undefined;

  // Structured abstract with <sec> elements
  const sections = findChildren(abstractNode.children, "sec");
  if (sections.length > 0) {
    return parseStructuredAbstract(sections);
  }

  // Simple abstract with <p>
  const paragraphs = findChildren(abstractNode.children, "p");
  if (paragraphs.length > 0) {
    return paragraphs.map((p) => extractAllText(p.children)).join("\n\n");
  }

  const text = extractAllText(abstractNode.children);
  return text || undefined;
}

/** Parse a structured abstract with <sec> elements. */
function parseStructuredAbstract(sections: Array<{ children: OrderedNode[] }>): string {
  const parts: string[] = [];
  for (const sec of sections) {
    const secTitleNode = findChild(sec.children, "title");
    const secTitle = secTitleNode ? extractAllText(secTitleNode.children) : "";
    const secPs = findChildren(sec.children, "p");
    const text = secPs.map((p) => extractAllText(p.children)).join(" ");
    parts.push(secTitle ? `${secTitle}: ${text}` : text);
  }
  return parts.join("\n\n");
}

/** Extract a date from a pub-date node. */
function extractDateFromNode(pd: { children: OrderedNode[] }):
  | { year: string; month?: string; day?: string }
  | undefined {
  const yearNode = findChild(pd.children, "year");
  if (!yearNode) return undefined;
  const year = extractAllText(yearNode.children);
  const monthNode = findChild(pd.children, "month");
  const dayNode = findChild(pd.children, "day");
  const date: { year: string; month?: string; day?: string } = { year };
  if (monthNode) date.month = extractAllText(monthNode.children);
  if (dayNode) date.day = extractAllText(dayNode.children);
  return date;
}

/**
 * Extract publication date with priority: epub > ppub > collection > any other.
 * Falls back to first available date if none match priority.
 */
function parsePublicationDate(
  metaChildren: OrderedNode[]
): { year: string; month?: string; day?: string } | undefined {
  const pubDates = findChildren(metaChildren, "pub-date");
  const datePriority: Record<string, number> = { epub: 0, ppub: 1, collection: 2 };
  let bestPriority = Number.POSITIVE_INFINITY;
  let publicationDate: { year: string; month?: string; day?: string } | undefined;

  for (const pd of pubDates) {
    const dateType = pd.attrs["pub-type"] ?? pd.attrs["date-type"] ?? "";
    const priority = datePriority[dateType] ?? 3;
    if (priority < bestPriority) {
      bestPriority = priority;
      publicationDate = extractDateFromNode(pd);
    }
  }

  // If no prioritized date found, take first available
  if (!publicationDate && pubDates.length > 0) {
    const pd = pubDates.at(0);
    if (pd) {
      publicationDate = extractDateFromNode(pd);
    }
  }

  return publicationDate;
}

/** Extract license information from permissions. */
function parseLicense(metaChildren: OrderedNode[]): string | undefined {
  const permissions = findChild(metaChildren, "permissions");
  if (!permissions) return undefined;

  const licenseNode = findChild(permissions.children, "license");
  if (!licenseNode) return undefined;

  // Prefer @xlink:href (standardized URL) over <license-p> (free-text)
  const href = licenseNode.attrs["xlink:href"];
  if (href) return href;

  const licenseP = findChild(licenseNode.children, "license-p");
  if (licenseP) return extractAllText(licenseP.children).trim();

  return undefined;
}

/** Extract keywords from all kwd-group elements. */
function parseKeywords(metaChildren: OrderedNode[]): string[] {
  const kwdGroups = findChildren(metaChildren, "kwd-group");
  const keywords: string[] = [];
  for (const kwdGroup of kwdGroups) {
    const kwds = findChildren(kwdGroup.children, "kwd");
    for (const kwd of kwds) {
      const text = extractAllText(kwd.children).trim();
      if (text) keywords.push(text);
    }
  }
  return keywords;
}

/** Extract volume, issue, and pages from article meta. */
function parseVolumeAndPages(metaChildren: OrderedNode[]): {
  volume?: string;
  issue?: string;
  pages?: string;
} {
  const volumeNode = findChild(metaChildren, "volume");
  const volume = volumeNode ? extractAllText(volumeNode.children) : undefined;
  const issueNode = findChild(metaChildren, "issue");
  const issue = issueNode ? extractAllText(issueNode.children) : undefined;

  let pages: string | undefined;
  const fpageNode = findChild(metaChildren, "fpage");
  const lpageNode = findChild(metaChildren, "lpage");
  if (fpageNode) {
    const fp = extractAllText(fpageNode.children);
    const lp = lpageNode ? extractAllText(lpageNode.children) : "";
    pages = lp ? `${fp}-${lp}` : fp;
  } else {
    const elocationNode = findChild(metaChildren, "elocation-id");
    if (elocationNode) pages = extractAllText(elocationNode.children);
  }

  const result: { volume?: string; issue?: string; pages?: string } = {};
  if (volume !== undefined) result.volume = volume;
  if (issue !== undefined) result.issue = issue;
  if (pages !== undefined) result.pages = pages;
  return result;
}

/** Extract journal name from front matter journal-meta. */
function parseJournalName(frontChildren: OrderedNode[]): string | undefined {
  const journalMeta = findChild(frontChildren, "journal-meta");
  if (!journalMeta) return undefined;

  const titleGroup = findChild(journalMeta.children, "journal-title-group");
  if (titleGroup) {
    const jTitle = findChild(titleGroup.children, "journal-title");
    if (jTitle) return extractAllText(jTitle.children);
  }

  const jTitle = findChild(journalMeta.children, "journal-title");
  if (jTitle) return extractAllText(jTitle.children);

  return undefined;
}

/** Extract article title from title-group. */
function parseArticleTitle(metaChildren: OrderedNode[]): string {
  const titleGroup = findChild(metaChildren, "title-group");
  const articleTitle = titleGroup ? findChild(titleGroup.children, "article-title") : undefined;
  return articleTitle ? extractAllText(articleTitle.children) : "";
}

/** Assemble optional metadata fields into a JatsMetadata result. */
function assembleMetadata(
  base: { title: string; authors: JatsAuthor[] },
  fields: {
    doi?: string;
    pmcid?: string;
    pmid?: string;
    journal?: string;
    publicationDate?: { year: string; month?: string; day?: string };
    volume?: string;
    issue?: string;
    pages?: string;
    keywords: string[];
    articleType?: string;
    license?: string;
    abstract?: string;
  }
): JatsMetadata {
  const result: JatsMetadata = { ...base };
  if (fields.doi) result.doi = fields.doi;
  if (fields.pmcid) result.pmcid = fields.pmcid;
  if (fields.pmid) result.pmid = fields.pmid;
  if (fields.journal) result.journal = fields.journal;
  if (fields.publicationDate) result.publicationDate = fields.publicationDate;
  if (fields.volume) result.volume = fields.volume;
  if (fields.issue) result.issue = fields.issue;
  if (fields.pages) result.pages = fields.pages;
  if (fields.keywords.length > 0) result.keywords = fields.keywords;
  if (fields.articleType) result.articleType = fields.articleType;
  if (fields.license) result.license = fields.license;
  if (fields.abstract) result.abstract = fields.abstract;
  return result;
}

/**
 * Parse JATS XML front matter to extract article metadata.
 */
export function parseJatsMetadata(xml: string): JatsMetadata {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return { title: "", authors: [] };

  const front = findChild(article.children, "front");
  if (!front) return { title: "", authors: [] };

  const articleMeta = findChild(front.children, "article-meta");
  if (!articleMeta) return { title: "", authors: [] };

  const metaChildren = articleMeta.children;

  const journal = parseJournalName(front.children);
  const publicationDate = parsePublicationDate(metaChildren);
  const articleType = article.attrs["article-type"] || undefined;
  const license = parseLicense(metaChildren);
  const abstract = parseAbstract(metaChildren);

  return assembleMetadata(
    { title: parseArticleTitle(metaChildren), authors: parseAuthors(metaChildren) },
    {
      ...parseArticleIds(metaChildren),
      ...(journal !== undefined ? { journal } : {}),
      ...(publicationDate !== undefined ? { publicationDate } : {}),
      ...parseVolumeAndPages(metaChildren),
      keywords: parseKeywords(metaChildren),
      ...(articleType !== undefined ? { articleType } : {}),
      ...(license !== undefined ? { license } : {}),
      ...(abstract !== undefined ? { abstract } : {}),
    }
  );
}

// ─── Inline Content Parsing ──────────────────────────────────────────

/** Handle <inline-formula> tag. */
function handleInlineFormula(innerChildren: OrderedNode[]): InlineContent {
  // Try to find <tex-math> directly or inside <alternatives>
  let texMath = findChild(innerChildren, "tex-math");
  if (!texMath) {
    const alternatives = findChild(innerChildren, "alternatives");
    if (alternatives) {
      texMath = findChild(alternatives.children, "tex-math");
    }
  }
  const tex = texMath ? extractAllText(texMath.children) : undefined;
  const text = tex || extractAllText(innerChildren);
  const entry: { type: "inline-formula"; tex?: string; text: string } = {
    type: "inline-formula",
    text,
  };
  if (tex) entry.tex = tex;
  return entry;
}

/** Handle <ext-link> tag. */
function handleExtLink(child: OrderedNode, innerChildren: OrderedNode[]): InlineContent | null {
  const href = getAttr(child, "xlink:href");
  if (href) {
    return { type: "link", url: href, children: parseInlineContent(innerChildren) };
  }
  const linkText = extractAllText(innerChildren);
  if (linkText) return { type: "text", text: linkText };
  return null;
}

/** Handle <uri> tag. */
function handleUri(child: OrderedNode, innerChildren: OrderedNode[]): InlineContent | null {
  const href = getAttr(child, "xlink:href");
  const textContent = extractAllText(innerChildren);
  const url = href || textContent;
  if (url) {
    return { type: "link", url, children: parseInlineContent(innerChildren) };
  }
  return null;
}

/** Handle <xref> tag. */
function handleXref(child: OrderedNode, innerChildren: OrderedNode[]): InlineContent | null {
  const refType = getAttr(child, "ref-type");
  if (refType === "bibr") {
    return {
      type: "citation",
      refId: getAttr(child, "rid") ?? "",
      text: extractAllText(innerChildren),
    };
  }
  const xrefText = extractAllText(innerChildren);
  if (xrefText) return { type: "text", text: xrefText };
  return null;
}

/** Tag handler type for inline content. */
type InlineTagHandler = (child: OrderedNode, innerChildren: OrderedNode[]) => InlineContent | null;

/** Map of tag names to their inline content handlers. */
const inlineTagHandlers: Record<string, InlineTagHandler> = {
  bold: (_child, innerChildren) => ({
    type: "bold",
    children: parseInlineContent(innerChildren),
  }),
  italic: (_child, innerChildren) => ({
    type: "italic",
    children: parseInlineContent(innerChildren),
  }),
  sup: (_child, innerChildren) => ({
    type: "superscript",
    text: extractAllText(innerChildren),
  }),
  sub: (_child, innerChildren) => ({
    type: "subscript",
    text: extractAllText(innerChildren),
  }),
  "inline-formula": (_child, innerChildren) => handleInlineFormula(innerChildren),
  monospace: (_child, innerChildren) => ({
    type: "code",
    text: extractAllText(innerChildren),
  }),
  "ext-link": (child, innerChildren) => handleExtLink(child, innerChildren),
  uri: (child, innerChildren) => handleUri(child, innerChildren),
  underline: (_child, innerChildren) => {
    const passText = extractAllText(innerChildren);
    return passText ? { type: "text", text: passText } : null;
  },
  sc: (_child, innerChildren) => {
    const passText = extractAllText(innerChildren);
    return passText ? { type: "text", text: passText } : null;
  },
  xref: (child, innerChildren) => handleXref(child, innerChildren),
};

/** Process a single inline child node into an InlineContent, or return null. */
function processInlineChild(child: OrderedNode): InlineContent | null {
  // Text node
  const text = getTextContent(child);
  if (text != null) {
    return text ? { type: "text", text } : null;
  }

  const tag = getTagName(child);
  if (!tag) return null;

  const innerChildren = getChildren(child);
  const handler = inlineTagHandlers[tag];
  if (handler) return handler(child, innerChildren);

  // Unknown inline element -- extract text
  const unknownText = extractAllText(innerChildren);
  return unknownText ? { type: "text", text: unknownText } : null;
}

/**
 * Parse inline content from a paragraph's children array.
 * Iterates in document order to preserve interleaving of text, citations,
 * and formatting elements.
 */
function parseInlineContent(children: OrderedNode[]): InlineContent[] {
  const result: InlineContent[] = [];
  for (const child of children) {
    const content = processInlineChild(child);
    if (content) result.push(content);
  }
  return result;
}

// ─── Block Content Parsing ───────────────────────────────────────────

/**
 * Parse a <list> element into a BlockElement.
 */
function parseList(listNode: OrderedNode): BlockElement {
  const listType = getAttr(listNode, "list-type");
  const ordered = listType === "order";
  const listChildren = getChildren(listNode);
  const listItems = findChildren(listChildren, "list-item");
  const items: InlineContent[][] = [];

  for (const item of listItems) {
    const pNodes = findChildren(item.children, "p");
    const content = pNodes.flatMap((p) => parseInlineContent(p.children));
    items.push(content);
  }

  return { type: "list", ordered, items };
}

/**
 * Parse a table row into an array of cell text content.
 */
function parseTableRow(trChildren: OrderedNode[]): string[] {
  const cells: string[] = [];
  for (const child of trChildren) {
    const tag = getTagName(child);
    if (tag === "th" || tag === "td") {
      const cellChildren = getChildren(child);
      // Check if cell contains multiple <p> elements
      const paragraphs = findChildren(cellChildren, "p");
      if (paragraphs.length > 1) {
        cells.push(paragraphs.map((p) => extractAllText(p.children)).join("<br>"));
      } else {
        cells.push(extractAllText(cellChildren));
      }
    }
  }
  return cells;
}

/**
 * Parse an already-parsed table-wrap node.
 */
function parseTableWrap(tableWrapNode: OrderedNode): {
  caption?: string;
  headers: string[];
  rows: string[][];
} {
  const children = getChildren(tableWrapNode);

  // Caption
  const labelNode = findChild(children, "label");
  const label = labelNode ? extractAllText(labelNode.children) : "";
  const captionNode = findChild(children, "caption");
  const captionText = captionNode ? extractAllText(captionNode.children) : "";
  const captionStr = [label, captionText].filter(Boolean).join(". ");

  const tableNode = findChild(children, "table");
  const result: { caption?: string; headers: string[]; rows: string[][] } = {
    headers: [],
    rows: [],
  };
  if (captionStr) result.caption = captionStr;
  if (!tableNode) return result;

  // Headers from thead
  const thead = findChild(tableNode.children, "thead");
  if (thead) {
    const headRows = findChildren(thead.children, "tr");
    if (headRows.length > 0) {
      result.headers.push(...parseTableRow(headRows[0]?.children ?? []));
    }
  }

  // Body rows
  const tbody = findChild(tableNode.children, "tbody");
  if (tbody) {
    const bodyRows = findChildren(tbody.children, "tr");
    for (const row of bodyRows) {
      result.rows.push(parseTableRow(row.children));
    }
  }

  return result;
}

/**
 * Parse a <table-wrap> element into a table block.
 * Exported for standalone use and used internally by parseBlockContent.
 */
export function parseJatsTable(xml: string): {
  caption?: string;
  headers: string[];
  rows: string[][];
} {
  const parsed = parser.parse(xml) as OrderedNode[];
  const tableWrap = findChild(parsed, "table-wrap");
  if (tableWrap) {
    return parseTableWrap(tableWrap.node);
  }
  // Fallback: if not wrapped, try to find table directly
  return { headers: [], rows: [] };
}

/**
 * Parse a <boxed-text> element into a boxed-text block.
 * Extracts optional title and recursively parses inner block content.
 */
function parseBoxedText(node: OrderedNode): BlockElement {
  const children = getChildren(node);
  const titleNode = findChild(children, "title");
  const title = titleNode ? extractAllText(titleNode.children) : undefined;
  const content = parseBlockContent(children);
  const block: BlockElement = { type: "boxed-text", content };
  if (title) block.title = title;
  return block;
}

/**
 * Parse a <def-list> element into a def-list block.
 * Extracts optional title and <def-item> pairs with <term> and <def>.
 */
function parseDefList(node: OrderedNode): BlockElement {
  const children = getChildren(node);
  const titleNode = findChild(children, "title");
  const title = titleNode ? extractAllText(titleNode.children) : undefined;
  const defItems = findChildren(children, "def-item");
  const items: { term: string; definition: string }[] = [];
  for (const item of defItems) {
    const termNode = findChild(item.children, "term");
    const defNode = findChild(item.children, "def");
    const term = termNode ? extractAllText(termNode.children) : "";
    const definition = defNode ? extractAllText(defNode.children) : "";
    items.push({ term, definition });
  }
  const block: BlockElement = { type: "def-list", items };
  if (title) block.title = title;
  return block;
}

/**
 * Parse a <disp-formula> element into a formula block.
 * Extracts TeX content from <tex-math> preferentially (inside <alternatives> or direct),
 * falls back to extractAllText for plain text.
 */
function parseDispFormula(node: OrderedNode): BlockElement {
  const children = getChildren(node);
  const id = getAttr(node, "id");
  const labelNode = findChild(children, "label");
  const label = labelNode ? extractAllText(labelNode.children) : undefined;

  // Try <alternatives> wrapper first
  const alternatives = findChild(children, "alternatives");
  const searchChildren = alternatives ? alternatives.children : children;

  const texMath = findChild(searchChildren, "tex-math");
  const block: BlockElement = { type: "formula" };
  if (id) block.id = id;
  if (label) block.label = label;

  if (texMath) {
    block.tex = extractAllText(texMath.children);
  } else {
    // Fall back to plain text extraction (skip label)
    const textChildren = children.filter((c) => !("label" in c));
    const text = extractAllText(textChildren).trim();
    if (text) block.text = text;
  }

  return block;
}

/** Tags that represent block-level elements when nested inside <p>. */
const BLOCK_TAGS = new Set(["table-wrap", "fig", "disp-quote", "boxed-text"]);

/**
 * Parse a <disp-quote> element into a blockquote block.
 * Extracts <p> children and concatenates their inline content.
 */
function parseDispQuote(node: OrderedNode): BlockElement {
  const children = getChildren(node);
  const paragraphs = findChildren(children, "p");
  const content: InlineContent[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0) content.push({ type: "text", text: "\n\n" });
    const para = paragraphs[i];
    if (para) content.push(...parseInlineContent(para.children));
  }
  // If no <p> children, extract inline content directly
  if (paragraphs.length === 0) {
    content.push(...parseInlineContent(children));
  }
  return { type: "blockquote", content };
}

/**
 * Parse a <table-wrap> node into a table block element.
 */
function parseTableBlock(node: OrderedNode): BlockElement {
  const tableResult = parseTableWrap(node);
  const tableBlock: BlockElement = {
    type: "table",
    headers: tableResult.headers,
    rows: tableResult.rows,
  };
  if (tableResult.caption) tableBlock.caption = tableResult.caption;
  return tableBlock;
}

/**
 * Parse a <fig> node into a figure block element.
 */
function parseFigBlock(node: OrderedNode): BlockElement {
  const innerChildren = getChildren(node);
  const figBlock: BlockElement = { type: "figure" };
  const figId = getAttr(node, "id");
  if (figId) figBlock.id = figId;
  const figLabel = findChild(innerChildren, "label");
  if (figLabel) {
    const labelText = extractAllText(figLabel.children);
    if (labelText) figBlock.label = labelText;
  }
  const figCaption = findChild(innerChildren, "caption");
  if (figCaption) {
    const captionText = extractAllText(figCaption.children);
    if (captionText) figBlock.caption = captionText;
  }
  return figBlock;
}

/**
 * Parse a <p> element, splitting it if it contains nested block elements
 * (table-wrap, fig, disp-quote). Returns one or more block elements.
 */
function parseParagraph(pChildren: OrderedNode[]): BlockElement[] {
  // Check if <p> contains any nested block elements
  const hasNestedBlocks = pChildren.some((child) => {
    const tag = getTagName(child);
    return tag != null && BLOCK_TAGS.has(tag);
  });

  if (!hasNestedBlocks) {
    return [{ type: "paragraph", content: parseInlineContent(pChildren) }];
  }

  // Split into inline runs and block elements
  const blocks: BlockElement[] = [];
  let inlineBuffer: OrderedNode[] = [];

  const flushInline = () => {
    if (inlineBuffer.length > 0) {
      const content = parseInlineContent(inlineBuffer);
      // Skip whitespace-only paragraphs created by XML formatting
      const hasNonWhitespace = content.some((c) => c.type !== "text" || c.text.trim() !== "");
      if (content.length > 0 && hasNonWhitespace) {
        blocks.push({ type: "paragraph", content });
      }
      inlineBuffer = [];
    }
  };

  for (const child of pChildren) {
    const tag = getTagName(child);
    if (tag === "table-wrap") {
      flushInline();
      blocks.push(parseTableBlock(child));
    } else if (tag === "fig") {
      flushInline();
      blocks.push(parseFigBlock(child));
    } else if (tag === "disp-quote") {
      flushInline();
      blocks.push(parseDispQuote(child));
    } else if (tag === "boxed-text") {
      flushInline();
      blocks.push(parseBoxedText(child));
    } else {
      inlineBuffer.push(child);
    }
  }
  flushInline();

  return blocks;
}

/** Parse a <supplementary-material> element into a paragraph block. */
function parseSupplementaryMaterial(child: OrderedNode): BlockElement | null {
  const innerChildren = getChildren(child);
  const labelNode = findChild(innerChildren, "label");
  const captionNode = findChild(innerChildren, "caption");
  const labelText = labelNode ? extractAllText(labelNode.children) : "";
  const captionText = captionNode ? extractAllText(captionNode.children) : "";
  const text = [labelText, captionText].filter(Boolean).join(": ");
  if (text) {
    return { type: "paragraph", content: [{ type: "text", text }] };
  }
  return null;
}

/** Block tag handler type. */
type BlockTagHandler = (child: OrderedNode) => BlockElement | BlockElement[] | null;

/** Map of tag names to their block content handlers. */
const blockTagHandlers: Record<string, BlockTagHandler> = {
  p: (child) => parseParagraph(getChildren(child)),
  list: (child) => parseList(child),
  "table-wrap": (child) => parseTableBlock(child),
  fig: (child) => parseFigBlock(child),
  "disp-quote": (child) => parseDispQuote(child),
  "boxed-text": (child) => parseBoxedText(child),
  "def-list": (child) => parseDefList(child),
  "disp-formula": (child) => parseDispFormula(child),
  preformat: (child) => ({ type: "preformat", text: extractAllText(getChildren(child)) }),
  "supplementary-material": (child) => parseSupplementaryMaterial(child),
};

/**
 * Parse block-level content from a section's children.
 * Iterates in document order to preserve ordering of paragraphs, lists,
 * tables, figures, and blockquotes.
 */
function parseBlockContent(sectionChildren: OrderedNode[]): BlockElement[] {
  const blocks: BlockElement[] = [];

  for (const child of sectionChildren) {
    const tag = getTagName(child);
    if (!tag) continue;

    const handler = blockTagHandlers[tag];
    if (!handler) continue;

    const result = handler(child);
    if (result == null) continue;

    if (Array.isArray(result)) {
      blocks.push(...result);
    } else {
      blocks.push(result);
    }
  }

  return blocks;
}

// ─── Section Parsing ─────────────────────────────────────────────────

/**
 * Parse a <sec> element into a JatsSection, recursively handling subsections.
 */
function parseSection(secChildren: OrderedNode[], level: number): JatsSection {
  const titleNode = findChild(secChildren, "title");
  const title = titleNode ? extractAllText(titleNode.children) : "";
  const content = parseBlockContent(secChildren);

  // Nested sections
  const subsections: JatsSection[] = [];
  const nestedSecs = findChildren(secChildren, "sec");
  for (const sub of nestedSecs) {
    subsections.push(parseSection(sub.children, level + 1));
  }

  return { title, level, content, subsections };
}

/** Flush buffered block nodes as an untitled section if non-empty. */
function flushBlockBuffer(buffer: OrderedNode[], sections: JatsSection[]): void {
  const content = parseBlockContent(buffer);
  if (content.length > 0) {
    sections.push({ title: "", level: 2, content, subsections: [] });
  }
}

/** Parse mixed body children (interleaved <p> and <sec>) in document order. */
function parseMixedBodyChildren(children: OrderedNode[], sections: JatsSection[]): void {
  let blockBuffer: OrderedNode[] = [];
  for (const child of children) {
    if (getTagName(child) === "sec") {
      if (blockBuffer.length > 0) {
        flushBlockBuffer(blockBuffer, sections);
        blockBuffer = [];
      }
      sections.push(parseSection(getChildren(child), 2));
    } else {
      blockBuffer.push(child);
    }
  }
  if (blockBuffer.length > 0) {
    flushBlockBuffer(blockBuffer, sections);
  }
}

/**
 * Parse JATS XML body to extract sections and content.
 */
export function parseJatsBody(xml: string): JatsSection[] {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return [];

  const body = findChild(article.children, "body");
  if (!body) return [];

  const sections: JatsSection[] = [];
  const secs = findChildren(body.children, "sec");

  if (secs.length > 0) {
    parseMixedBodyChildren(body.children, sections);
  } else {
    flushBlockBuffer(body.children, sections);
  }

  return sections;
}

// ─── Reference Parsing ───────────────────────────────────────────────

/** Extract authors from a <person-group> element. */
function extractCitationAuthors(children: OrderedNode[]): string | undefined {
  const personGroup = findChild(children, "person-group");
  if (!personGroup) return undefined;

  const names = findChildren(personGroup.children, "name");
  const authorParts: string[] = [];
  for (const name of names) {
    const surname = findChild(name.children, "surname");
    const givenNames = findChild(name.children, "given-names");
    const surnameText = surname ? extractAllText(surname.children) : "";
    const givenText = givenNames ? extractAllText(givenNames.children) : "";
    if (surnameText && givenText) {
      authorParts.push(`${surnameText} ${givenText}`);
    } else if (surnameText) {
      authorParts.push(surnameText);
    }
  }
  return authorParts.length > 0 ? authorParts.join(", ") : undefined;
}

/** Format year, volume, and pages into a citation string part. */
function formatYearVolumePage(children: OrderedNode[]): string | undefined {
  const year = findChild(children, "year");
  if (!year) return undefined;

  let yearStr = extractAllText(year.children);
  const volume = findChild(children, "volume");
  if (volume) {
    yearStr += `;${extractAllText(volume.children)}`;
  }

  const fpage = findChild(children, "fpage");
  if (fpage) {
    const fpageText = extractAllText(fpage.children);
    const lpage = findChild(children, "lpage");
    const lpageText = lpage ? extractAllText(lpage.children) : "";
    yearStr += `:${fpageText}${lpageText ? `-${lpageText}` : ""}`;
  }

  return yearStr;
}

/**
 * Format a structured <element-citation> into a readable reference string.
 * Produces: "Author1, Author2. Title. Source. Year;Volume:FirstPage-LastPage."
 */
function formatElementCitation(children: OrderedNode[]): string {
  const parts: string[] = [];

  const authorsStr = extractCitationAuthors(children);
  if (authorsStr) parts.push(authorsStr);

  // Article title
  const articleTitle = findChild(children, "article-title");
  if (articleTitle) {
    parts.push(extractAllText(articleTitle.children));
  }

  // Source (journal name)
  const source = findChild(children, "source");
  if (source) {
    parts.push(extractAllText(source.children));
  }

  // Year, volume, pages
  const yearVolumePage = formatYearVolumePage(children);
  if (yearVolumePage) parts.push(yearVolumePage);

  return `${parts.join(". ")}.`;
}

/**
 * Extract text from a <mixed-citation>'s children, deduplicating any
 * <pub-id> content that also appears as inline text.
 *
 * Some publishers include the DOI/PMID both as a text node and inside
 * a <pub-id> element, causing duplication like "10.1234/x 10.1234/x".
 */
function extractMixedCitationText(children: OrderedNode[]): string {
  // Collect pub-id values
  const pubIds = findChildren(children, "pub-id");
  const pubIdValues = pubIds.map((p) => extractAllText(p.children).trim()).filter(Boolean);

  if (pubIdValues.length === 0) {
    return extractAllText(children).trim();
  }

  // Extract full text
  const fullText = extractAllText(children).trim();

  // For each pub-id value, if it appears more than once, remove extra occurrences
  let result = fullText;
  for (const val of pubIdValues) {
    // Escape regex special characters
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = result.match(new RegExp(escaped, "g"));
    if (matches && matches.length > 1) {
      // Remove the first occurrence (typically the inline text), keep the last (pub-id element)
      result = result.replace(val, "");
      // Clean up any leftover extra whitespace
      result = result.replace(/\s{2,}/g, " ").trim();
    }
  }

  return result;
}

/**
 * Extract structured pub-id values (DOI, PMID, PMCID) from children nodes.
 */
function extractPubIds(children: OrderedNode[]): {
  doi?: string;
  pmid?: string;
  pmcid?: string;
} {
  const pubIds = findChildren(children, "pub-id");
  const result: { doi?: string; pmid?: string; pmcid?: string } = {};
  for (const p of pubIds) {
    const idType = p.attrs["pub-id-type"];
    const value = extractAllText(p.children).trim();
    if (!value) continue;
    if (idType === "doi") result.doi = value;
    if (idType === "pmid") result.pmid = value;
    if (idType === "pmc" || idType === "pmcid") {
      result.pmcid = value.replace(/^PMC/, "");
    }
  }
  return result;
}

/**
 * Strip extracted pub-id values from reference text to avoid duplication
 * when pub-ids are rendered separately as links.
 */
function stripPubIdValues(
  text: string,
  pubIds: { doi?: string; pmid?: string; pmcid?: string }
): string {
  let result = text;
  const values = [pubIds.doi, pubIds.pmid, pubIds.pmcid].filter(Boolean) as string[];
  for (const val of values) {
    // Strip common label prefixes (e.g. "doi: ", "PMID: ", "DOI:", "pmid:") followed by the value
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?:doi|PMID|pmid|PMC|pmc)[:\\s]*${escaped}`, "gi"), "");
    // Also strip the bare value itself
    result = result.replace(new RegExp(escaped, "g"), "");
  }
  // Also strip PMC-prefixed form of pmcid
  if (pubIds.pmcid) {
    const pmcFull = `PMC${pubIds.pmcid}`;
    const escaped = pmcFull.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?:pmc|pmcid)[:\\s]*${escaped}`, "gi"), "");
    result = result.replace(new RegExp(escaped, "g"), "");
  }
  // Clean up trailing/leading whitespace and extra spaces
  result = result.replace(/\s{2,}/g, " ").trim();
  // Clean up trailing period after stripped content (e.g. "Title. ." -> "Title.")
  result = result.replace(/\.\s*\.$/, ".");
  return result;
}

/** Parse a single <ref> element into a JatsReference, or return null if invalid. */
function parseSingleReference(ref: {
  node: OrderedNode;
  children: OrderedNode[];
  attrs: Record<string, string>;
}): JatsReference | null {
  const id = getAttr(ref.node, "id") ?? "";

  // Determine the search scope: if <citation-alternatives> exists, search within it;
  // otherwise search direct children of <ref>
  const citationAlternatives = findChild(ref.children, "citation-alternatives");
  const searchChildren = citationAlternatives ? citationAlternatives.children : ref.children;

  // Try mixed-citation first (already formatted), then element-citation (structured)
  const mixedCitation = findChild(searchChildren, "mixed-citation");
  if (mixedCitation) {
    const rawText = extractMixedCitationText(mixedCitation.children);
    const pubIds = extractPubIds(mixedCitation.children);
    const text = stripPubIdValues(rawText, pubIds);
    if (id && text) return { id, text, ...pubIds };
    return null;
  }

  const elementCitation = findChild(searchChildren, "element-citation");
  if (elementCitation) {
    const rawText = formatElementCitation(elementCitation.children);
    const pubIds = extractPubIds(elementCitation.children);
    const text = stripPubIdValues(rawText, pubIds);
    if (id && text) return { id, text, ...pubIds };
    return null;
  }

  // Fallback: extract all text from ref, skipping <label>
  const childrenWithoutLabel = ref.children.filter((c) => !("label" in c));
  const text = extractAllText(childrenWithoutLabel).trim();
  if (id && text) return { id, text };
  return null;
}

/**
 * Parse JATS XML back matter to extract references.
 */
export function parseJatsReferences(xml: string): JatsReference[] {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return [];

  const back = findChild(article.children, "back");
  if (!back) return [];

  const refList = findChild(back.children, "ref-list");
  if (!refList) return [];

  const refs = findChildren(refList.children, "ref");
  const references: JatsReference[] = [];

  for (const ref of refs) {
    const reference = parseSingleReference(ref);
    if (reference) references.push(reference);
  }

  return references;
}

// ─── Back Matter & Floats Parsing ────────────────────────────────────

/** Result of parsing back matter and floats-group. */
export interface BackMatterResult {
  acknowledgments?: string;
  appendices?: JatsSection[];
  footnotes?: JatsFootnote[];
  floats?: BlockElement[];
  notes?: BackMatterNote[];
}

/** Parse acknowledgments from <ack> element. */
function parseAcknowledgments(backChildren: OrderedNode[]): string | undefined {
  const ack = findChild(backChildren, "ack");
  if (!ack) return undefined;

  const paragraphs = findChildren(ack.children, "p");
  if (paragraphs.length > 0) {
    return paragraphs.map((p) => extractAllText(p.children)).join("\n\n");
  }
  return undefined;
}

/** Parse appendices from <app-group>/<app> elements. */
function parseAppendices(backChildren: OrderedNode[]): JatsSection[] | undefined {
  const appGroup = findChild(backChildren, "app-group");
  if (!appGroup) return undefined;

  const apps = findChildren(appGroup.children, "app");
  if (apps.length === 0) return undefined;

  return apps.map((app) => parseSection(app.children, 2));
}

/** Parse a single footnote element into a JatsFootnote. */
function parseSingleFootnote(fn: {
  node: OrderedNode;
  children: OrderedNode[];
  attrs: Record<string, string>;
}): JatsFootnote {
  const parts: string[] = [];
  // Include <title> if present
  const titleNode = findChild(fn.children, "title");
  if (titleNode) {
    const titleText = extractAllText(titleNode.children).trim();
    if (titleText) parts.push(titleText);
  }
  // Extract text from each <p> separately and join with space
  const paragraphs = findChildren(fn.children, "p");
  for (const p of paragraphs) {
    const pText = extractAllText(p.children).trim();
    if (pText) parts.push(pText);
  }
  return {
    id: getAttr(fn.node, "id") ?? "",
    text: parts.join(" "),
  };
}

/** Parse footnotes from <fn-group>/<fn> elements. */
function parseFootnotes(backChildren: OrderedNode[]): JatsFootnote[] | undefined {
  const fnGroup = findChild(backChildren, "fn-group");
  if (!fnGroup) return undefined;

  const fns = findChildren(fnGroup.children, "fn");
  if (fns.length === 0) return undefined;

  return fns.map(parseSingleFootnote);
}

/** Parse a single notes element into BackMatterNote entries. */
function parseSingleNotesElement(note: { children: OrderedNode[] }): BackMatterNote[] {
  const notes: BackMatterNote[] = [];

  // Check if this <notes> contains <sec> or nested <notes> children
  const secs = findChildren(note.children, "sec");
  const nestedNotes = findChildren(note.children, "notes");
  const subItems = secs.length > 0 ? secs : nestedNotes;

  if (subItems.length > 0) {
    for (const sub of subItems) {
      const subTitleNode = findChild(sub.children, "title");
      const subTitle = subTitleNode ? extractAllText(subTitleNode.children) : "";
      const subParagraphs = findChildren(sub.children, "p");
      const subText = subParagraphs.map((p) => extractAllText(p.children)).join("\n\n");
      if (subTitle || subText) {
        notes.push({ title: subTitle, text: subText });
      }
    }
    return notes;
  }

  const titleNode = findChild(note.children, "title");
  const title = titleNode ? extractAllText(titleNode.children) : "";
  const paragraphs = findChildren(note.children, "p");
  const text = paragraphs.map((p) => extractAllText(p.children)).join("\n\n");
  if (title || text) {
    notes.push({ title, text });
  }
  return notes;
}

/** Parse notes from <notes> elements (author contributions, funding, etc.). */
function parseNotes(backChildren: OrderedNode[]): BackMatterNote[] | undefined {
  const notesElements = findChildren(backChildren, "notes");
  if (notesElements.length === 0) return undefined;

  const notes: BackMatterNote[] = [];
  for (const note of notesElements) {
    notes.push(...parseSingleNotesElement(note));
  }
  return notes.length > 0 ? notes : undefined;
}

/** Parse glossary elements into BackMatterNote entries. */
function parseGlossary(backChildren: OrderedNode[]): BackMatterNote[] {
  const glossaryElements = findChildren(backChildren, "glossary");
  const notes: BackMatterNote[] = [];

  for (const glossary of glossaryElements) {
    const titleNode = findChild(glossary.children, "title");
    const title = titleNode ? extractAllText(titleNode.children) : "Glossary";
    const defList = findChild(glossary.children, "def-list");
    if (!defList) continue;

    const defItems = findChildren(defList.children, "def-item");
    const lines: string[] = [];
    for (const item of defItems) {
      const termNode = findChild(item.children, "term");
      const defNode = findChild(item.children, "def");
      const term = termNode ? extractAllText(termNode.children) : "";
      const definition = defNode ? extractAllText(defNode.children) : "";
      lines.push(`${term}: ${definition}`);
    }
    notes.push({ title, text: lines.join("\n") });
  }

  return notes;
}

/** Parse <floats-group> into block elements. */
function parseFloatsGroup(articleChildren: OrderedNode[]): BlockElement[] | undefined {
  const floatsGroup = findChild(articleChildren, "floats-group");
  if (!floatsGroup) return undefined;

  const blocks: BlockElement[] = [];
  for (const child of floatsGroup.children) {
    const tag = getTagName(child);
    if (tag === "fig") {
      blocks.push(parseFigBlock(child));
    } else if (tag === "table-wrap") {
      blocks.push(parseTableBlock(child));
    }
  }
  return blocks.length > 0 ? blocks : undefined;
}

/**
 * Parse JATS XML back matter sections (ack, app-group, fn-group)
 * and top-level floats-group.
 */
export function parseJatsBackMatter(xml: string): BackMatterResult {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return {};

  const result: BackMatterResult = {};

  // Parse <back> children
  const back = findChild(article.children, "back");
  if (back) {
    const ack = parseAcknowledgments(back.children);
    if (ack) result.acknowledgments = ack;
    const app = parseAppendices(back.children);
    if (app) result.appendices = app;
    const fn = parseFootnotes(back.children);
    if (fn) result.footnotes = fn;

    const notes = parseNotes(back.children);
    const glossaryNotes = parseGlossary(back.children);
    if (notes || glossaryNotes.length > 0) {
      result.notes = [...(notes ?? []), ...glossaryNotes];
    }
  }

  // Floats-group: <floats-group> (sibling of <body> and <back>)
  const floats = parseFloatsGroup(article.children);
  if (floats) result.floats = floats;

  return result;
}
