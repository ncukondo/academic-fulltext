// === Discovery ===
export { discoverOA } from "./discovery/index.js";
export type { DiscoveryArticle, DiscoveryConfig, DiscoveryResult } from "./discovery/index.js";
export { checkUnpaywall } from "./discovery/unpaywall.js";
export { checkPmc, getPmcUrls } from "./discovery/pmc.js";
export type { PmcIdentifiers, PmcOptions } from "./discovery/pmc.js";
export { checkArxiv } from "./discovery/arxiv.js";
export { checkCore } from "./discovery/core.js";

// === Download ===
export { downloadPdf } from "./download/downloader.js";
export type { DownloadOptions, DownloadResult } from "./download/downloader.js";
export { downloadPmcXml } from "./download/pmc-xml.js";
export type { PmcXmlResult } from "./download/pmc-xml.js";
export { fetchFulltext, fetchAllFulltexts } from "./download/orchestrator.js";
export type { FetchArticle, FetchOptions, FetchResult } from "./download/orchestrator.js";

// === Conversion ===
export { convertPmcXmlToMarkdown } from "./convert/index.js";
export type { ConvertResult } from "./convert/index.js";

// === Metadata & Utilities ===
export { createMeta, loadMeta, saveMeta, updateMetaFiles } from "./meta.js";
export type { CreateMetaOptions } from "./meta.js";
export { generateCitationKey, generateDirName } from "./citation-key.js";
export { generateReadme } from "./readme.js";
export { getFulltextDir, getArticleDir, getMetaPath, getReadmePath } from "./paths.js";

// === Types ===
export type { FileInfo, OALocation, OAStatus, FulltextMeta, ArticleFulltextRef } from "./types.js";
