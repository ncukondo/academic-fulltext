/**
 * Fulltext management type definitions.
 * Defines interfaces for article fulltext storage, metadata, and indexing.
 */

/**
 * Information about a retrieved or manually added file.
 */
export interface FileInfo {
  /** Fixed filename: "fulltext.pdf", "fulltext.xml", or "fulltext.md" */
  filename: string;
  /** How the file was obtained: "pmc", "arxiv", "unpaywall", "manual", etc. */
  source: string;
  /** ISO 8601 timestamp when the file was retrieved/added */
  retrievedAt: string;
  /** File size in bytes */
  size?: number;
  /** For markdown: source file it was converted from (e.g., "fulltext.xml") */
  convertedFrom?: string;
}

/**
 * An Open Access location discovered for an article.
 */
export interface OALocation {
  /** Discovery source */
  source: "unpaywall" | "pmc" | "arxiv" | "core" | "publisher";
  /** URL to the fulltext */
  url: string;
  /** Type of content at the URL */
  urlType: "pdf" | "xml" | "html" | "repository";
  /** Version of the article */
  version: "published" | "accepted" | "submitted";
  /** License identifier (e.g., "cc-by") */
  license?: string;
}

/**
 * OA status of an article.
 */
export type OAStatus = "open" | "closed" | "unknown" | "unchecked";

/**
 * Metadata for a single article's fulltext directory (meta.json).
 */
export interface FulltextMeta {
  /** Directory name: "{citationKey}-{uuid8}" */
  dirName: string;
  /** Citation key: e.g., "smith2024" */
  citationKey: string;
  /** Full UUID for uniqueness */
  uuid: string;

  // Article identifiers (for matching)
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;

  // Bibliographic info
  /** Article title */
  title: string;
  /** Authors as a display string */
  authors?: string;
  /** Publication year */
  year?: string;

  // OA Discovery results
  /** Current OA status */
  oaStatus: OAStatus;
  /** Discovered OA locations */
  oaLocations?: OALocation[];
  /** ISO 8601 timestamp of last OA check */
  checkedAt?: string;

  // Retrieved files
  files: {
    pdf?: FileInfo;
    xml?: FileInfo;
    html?: FileInfo;
    markdown?: FileInfo;
  };

  // Manual download info
  pendingDownload?: {
    suggestedUrls: string[];
    /** ISO 8601 timestamp */
    addedAt: string;
  };
}

/**
 * Fulltext reference stored in ArticleEntry (reviews.yaml extension).
 * Links an article in reviews.yaml to its fulltext directory.
 */
export interface ArticleFulltextRef {
  /** Directory name: "{citationKey}-{uuid8}" — links to fulltext/<dirName>/ */
  dirName: string;
  /** Which file types are available */
  hasFiles: {
    pdf: boolean;
    xml: boolean;
    html: boolean;
    markdown: boolean;
  };
}
