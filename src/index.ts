/**
 * # @ncukondo/academic-fulltext
 *
 * Open Access discovery, fulltext download, and Markdown conversion for academic articles.
 *
 * ## Workflow
 *
 * This package provides a three-step pipeline:
 *
 * 1. **Discover** — Find Open Access sources for an article using its DOI, PMID, PMCID, or arXiv ID.
 * 2. **Download** — Fetch PDF, PMC XML, and/or arXiv HTML from discovered sources.
 * 3. **Convert** — Transform PMC JATS XML or arXiv HTML into Markdown.
 *
 * ## Quick Example
 *
 * ```typescript
 * import {
 *   discoverOA,
 *   fetchFulltext,
 *   convertPmcXmlToMarkdown,
 *   convertArxivHtmlToMarkdown,
 *   createMeta,
 *   saveMeta,
 *   generateCitationKey,
 *   generateDirName,
 *   getArticleDir,
 *   getMetaPath,
 * } from "@ncukondo/academic-fulltext";
 *
 * // Step 1: Discover OA sources
 * const discovery = await discoverOA(
 *   { doi: "10.1234/example" },
 *   {
 *     unpaywallEmail: "you@example.com",
 *     coreApiKey: "your-core-api-key",
 *     preferSources: ["pmc", "arxiv", "unpaywall", "core"],
 *   },
 * );
 *
 * // Step 2: Prepare metadata and download
 * const citationKey = generateCitationKey("Smith", "2024");
 * const dirName = generateDirName(citationKey);
 * const meta = createMeta({
 *   citationKey,
 *   uuid: dirName.split("-").pop()!,
 *   title: "Example Article",
 *   doi: "10.1234/example",
 * });
 * await saveMeta(getMetaPath("/session", dirName), meta);
 *
 * const result = await fetchFulltext(
 *   {
 *     dirName,
 *     oaLocations: discovery.locations,
 *     pmcid: discovery.discoveredIds.pmcid,
 *   },
 *   "/session",
 * );
 *
 * // Step 3: Convert to Markdown
 * const articleDir = getArticleDir("/session", dirName);
 * await convertPmcXmlToMarkdown(
 *   `${articleDir}/fulltext.xml`,
 *   `${articleDir}/fulltext.md`,
 *   `${articleDir}/meta.json`,
 * );
 * ```
 *
 * ## Configuration
 *
 * - **unpaywallEmail** (required for Unpaywall): Your email for the Unpaywall API.
 * - **coreApiKey** (required for CORE): API key from https://core.ac.uk/.
 * - **preferSources**: Source priority order. Default: `["pmc", "arxiv", "unpaywall", "core"]`.
 * - **ncbiEmail** / **ncbiTool** (optional): For NCBI E-utilities and ID Converter.
 *
 * ## Modules
 *
 * - **Discovery**: {@link discoverOA}, {@link checkUnpaywall}, {@link checkPmc}, {@link checkArxiv}, {@link checkCore}, {@link resolveDoiToPmcid}
 * - **Download**: {@link fetchFulltext}, {@link fetchAllFulltexts}, {@link downloadPdf}, {@link downloadPmcXml}, {@link downloadArxivHtml}
 * - **Conversion**: {@link convertPmcXmlToMarkdown}, {@link convertArxivHtmlToMarkdown}, {@link parseArxivHtml}
 * - **Metadata**: {@link createMeta}, {@link loadMeta}, {@link saveMeta}, {@link updateMetaFiles}
 * - **Utilities**: {@link generateCitationKey}, {@link generateDirName}, {@link getArticleDir}, {@link getMetaPath}
 *
 * @module @ncukondo/academic-fulltext
 */

// === Discovery ===
export { discoverOA } from "./discovery/index.js";
export type { DiscoveryArticle, DiscoveryConfig, DiscoveryResult } from "./discovery/index.js";
export { checkUnpaywall, checkUnpaywallDetailed } from "./discovery/unpaywall.js";
export type { UnpaywallDetailedResult } from "./discovery/unpaywall.js";
export { checkPmc, getPmcUrls } from "./discovery/pmc.js";
export type { PmcIdentifiers, PmcOptions } from "./discovery/pmc.js";
export { checkArxiv } from "./discovery/arxiv.js";
export { checkCore } from "./discovery/core.js";
export { resolveDoiToPmcid, batchResolveIds } from "./discovery/ncbi-id-converter.js";
export type { IdConversionResult, IdConverterOptions } from "./discovery/ncbi-id-converter.js";

// === Download ===
export { downloadPdf } from "./download/downloader.js";
export type { DownloadOptions, DownloadResult } from "./download/downloader.js";
export { downloadPmcXml } from "./download/pmc-xml.js";
export type { PmcXmlResult } from "./download/pmc-xml.js";
export { downloadArxivHtml } from "./download/arxiv-html.js";
export type { ArxivHtmlResult } from "./download/arxiv-html.js";
export { fetchFulltext, fetchAllFulltexts } from "./download/orchestrator.js";
export type {
  DownloadAttempt,
  FetchArticle,
  FetchOptions,
  FetchResult,
} from "./download/orchestrator.js";

// === Conversion ===
export { convertPmcXmlToMarkdown, convertArxivHtmlToMarkdown } from "./convert/index.js";
export type { ConvertResult } from "./convert/index.js";
export { parseArxivHtml } from "./convert/arxiv-html-parser.js";

// === Metadata & Utilities ===
export { createMeta, loadMeta, saveMeta, updateMetaFiles } from "./meta.js";
export type { CreateMetaOptions } from "./meta.js";
export { generateCitationKey, generateDirName } from "./citation-key.js";
export { generateReadme } from "./readme.js";
export { getFulltextDir, getArticleDir, getMetaPath, getReadmePath } from "./paths.js";

// === Types ===
export type { FileInfo, OALocation, OAStatus, FulltextMeta, ArticleFulltextRef } from "./types.js";
