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
export { fetchFulltext, fetchAllFulltexts } from "./download/orchestrator.js";
export type {
  DownloadAttempt,
  FetchArticle,
  FetchOptions,
  FetchResult,
} from "./download/orchestrator.js";

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
