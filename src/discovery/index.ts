/**
 * OA Discovery Aggregator.
 * Combines results from multiple OA discovery sources.
 */

import type { OALocation, OAStatus } from "../types.js";
import { checkArxiv } from "./arxiv.js";
import { checkCore } from "./core.js";
import { resolveDoiToPmcid } from "./ncbi-id-converter.js";
import { checkPmc } from "./pmc.js";
import { checkUnpaywallDetailed } from "./unpaywall.js";

export interface DiscoveryArticle {
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
}

export interface DiscoveryConfig {
  unpaywallEmail: string;
  coreApiKey: string;
  preferSources: string[];
  ncbiEmail?: string;
  ncbiTool?: string;
}

export interface DiscoveryResult {
  oaStatus: OAStatus;
  locations: OALocation[];
  errors: Array<{ source: string; error: string }>;
  skipped: Array<{ source: string; reason: string }>;
  checkedSources: string[];
  discoveredIds: { pmcid?: string; pmid?: string };
}

/** Default source order when preferSources is empty or not specified */
const DEFAULT_SOURCE_ORDER = ["pmc", "arxiv", "unpaywall", "core"];

/**
 * A source checker returns:
 * - { skipped: string } if the source is not applicable (with reason)
 * - OALocation[] | null if the source was checked (null means checked but nothing found)
 */
type SourceCheckerResult =
  | Promise<OALocation[] | null | { skipped: string }>
  | OALocation[]
  | null
  | { skipped: string };
type SourceChecker = (article: DiscoveryArticle, config: DiscoveryConfig) => SourceCheckerResult;

function checkArxivSource(article: DiscoveryArticle): OALocation[] | null | { skipped: string } {
  if (!article.arxivId) return { skipped: "no arXiv ID available" };
  return checkArxiv(article.arxivId);
}

async function checkCoreSource(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<OALocation[] | null | { skipped: string }> {
  if (!config.coreApiKey) return { skipped: "coreApiKey not configured" };
  if (!article.doi) return { skipped: "no DOI available" };
  return await checkCore(article.doi, config.coreApiKey);
}

/** Map of source name to its checker function (excluding unpaywall and pmc, handled specially). */
const sourceCheckers: Record<string, SourceChecker> = {
  arxiv: checkArxivSource,
  core: checkCoreSource,
};

/** Determine OA status from collected locations and errors. */
function determineOAStatus(
  locations: OALocation[],
  errors: Array<{ source: string; error: string }>,
  sourcesChecked: number
): OAStatus {
  if (locations.length > 0) return "open";
  if (errors.length > 0 && errors.length >= sourcesChecked) return "unknown";
  return "closed";
}

interface EnrichResult {
  enriched: DiscoveryArticle;
  discoveredIds: { pmcid?: string; pmid?: string };
}

/**
 * Pre-enrich article with PMCID from NCBI ID Converter when only DOI is available.
 */
async function enrichArticleIds(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<EnrichResult> {
  const discoveredIds: { pmcid?: string; pmid?: string } = {};

  // Only enrich if we have a DOI but no pmcid/pmid
  if (!article.doi || article.pmcid || article.pmid) {
    return { enriched: article, discoveredIds };
  }

  try {
    const email = config.ncbiEmail || config.unpaywallEmail;
    const options: { tool?: string; email?: string } = {};
    if (config.ncbiTool) options.tool = config.ncbiTool;
    if (email) options.email = email;
    const result = await resolveDoiToPmcid(article.doi, options);

    if (result) {
      const enriched = { ...article };
      if (result.pmcid) {
        enriched.pmcid = result.pmcid;
        discoveredIds.pmcid = result.pmcid;
      }
      if (result.pmid) {
        enriched.pmid = result.pmid;
        discoveredIds.pmid = result.pmid;
      }
      return { enriched, discoveredIds };
    }
  } catch {
    // NCBI ID Converter failure is non-fatal; continue without enrichment
  }

  return { enriched: article, discoveredIds };
}

/** Accumulated state during source checking. */
interface CheckState {
  locations: OALocation[];
  errors: Array<{ source: string; error: string }>;
  skipped: Array<{ source: string; reason: string }>;
  checkedSources: string[];
  sourcesChecked: number;
  unpaywallPmcid?: string;
}

/** Check Unpaywall with PMCID extraction. */
async function checkUnpaywallSource(
  enriched: DiscoveryArticle,
  config: DiscoveryConfig,
  state: CheckState
): Promise<void> {
  if (!config.unpaywallEmail) {
    state.skipped.push({ source: "unpaywall", reason: "unpaywallEmail not configured" });
    return;
  }
  if (!enriched.doi) {
    state.skipped.push({ source: "unpaywall", reason: "no DOI available" });
    return;
  }

  state.sourcesChecked++;
  state.checkedSources.push("unpaywall");
  try {
    const detailed = await checkUnpaywallDetailed(enriched.doi, config.unpaywallEmail);
    if (!detailed) return;

    state.locations.push(...detailed.locations);
    if (detailed.pmcid) {
      state.unpaywallPmcid = detailed.pmcid;
    }
  } catch (err) {
    state.errors.push({ source: "unpaywall", error: String(err) });
  }
}

/** Check PMC source with discovered-ID propagation. */
async function checkPmcSourceWithIds(
  enriched: DiscoveryArticle,
  state: CheckState,
  discoveredIds: { pmcid?: string; pmid?: string }
): Promise<void> {
  if (!enriched.pmid && !enriched.pmcid) {
    state.skipped.push({ source: "pmc", reason: "no PMCID or PMID available" });
    return;
  }

  const ids: { pmid?: string; pmcid?: string } = {};
  if (enriched.pmid) ids.pmid = enriched.pmid;
  if (enriched.pmcid) ids.pmcid = enriched.pmcid;

  state.sourcesChecked++;
  state.checkedSources.push("pmc");
  try {
    const result = await checkPmc(ids);
    if (!result) return;

    state.locations.push(...result.locations);
    if (result.discoveredPmcid) {
      discoveredIds.pmcid = discoveredIds.pmcid ?? result.discoveredPmcid;
    }
  } catch (err) {
    state.errors.push({ source: "pmc", error: String(err) });
  }
}

/** Check a single non-unpaywall source, updating state. */
async function checkGenericSource(
  source: string,
  enriched: DiscoveryArticle,
  config: DiscoveryConfig,
  state: CheckState
): Promise<void> {
  const checker = sourceCheckers[source];
  if (!checker) return;

  const result = await runSourceChecker(checker, enriched, config);
  if (result.skipReason) {
    state.skipped.push({ source, reason: result.skipReason });
    return;
  }

  state.sourcesChecked++;
  state.checkedSources.push(source);
  if (result.error) {
    state.errors.push({ source, error: result.error });
  } else if (result.locations) {
    state.locations.push(...result.locations);
  }
}

/** Perform lazy PMC check if Unpaywall revealed a PMCID not already known. */
async function lazyPmcCheck(
  enriched: DiscoveryArticle,
  state: CheckState,
  discoveredIds: { pmcid?: string; pmid?: string }
): Promise<void> {
  if (!state.unpaywallPmcid || enriched.pmcid) return;

  discoveredIds.pmcid = discoveredIds.pmcid ?? state.unpaywallPmcid;
  state.checkedSources.push("pmc-lazy");
  try {
    const pmcResult = await checkPmc({ pmcid: state.unpaywallPmcid });
    if (pmcResult) {
      state.locations.push(...pmcResult.locations);
    }
  } catch (err) {
    state.errors.push({ source: "pmc-lazy", error: String(err) });
  }
}

/**
 * Discover OA availability for an article across all configured sources.
 * Checks sources in the order specified by config.preferSources, falling back
 * to the default order. Individual source errors are caught and reported
 * without failing the whole discovery.
 *
 * When only a DOI is provided, pre-enriches with NCBI ID Converter to resolve
 * PMCID/PMID, enabling PMC discovery. Also extracts PMCID from Unpaywall URLs
 * as a fallback, performing a lazy PMC check if a PMCID is discovered.
 */
export async function discoverOA(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<DiscoveryResult> {
  const { enriched, discoveredIds } = await enrichArticleIds(article, config);

  const state: CheckState = {
    locations: [],
    errors: [],
    skipped: [],
    checkedSources: [],
    sourcesChecked: 0,
  };

  const sourceOrder = config.preferSources.length > 0 ? config.preferSources : DEFAULT_SOURCE_ORDER;

  for (const source of sourceOrder) {
    if (source === "unpaywall") {
      await checkUnpaywallSource(enriched, config, state);
    } else if (source === "pmc") {
      await checkPmcSourceWithIds(enriched, state, discoveredIds);
    } else {
      await checkGenericSource(source, enriched, config, state);
    }
  }

  await lazyPmcCheck(enriched, state, discoveredIds);

  const oaStatus = determineOAStatus(state.locations, state.errors, state.sourcesChecked);
  return {
    oaStatus,
    locations: state.locations,
    errors: state.errors,
    skipped: state.skipped,
    checkedSources: state.checkedSources,
    discoveredIds,
  };
}

interface SourceCheckResult {
  skipReason?: string;
  locations?: OALocation[];
  error?: string;
}

/** Run a single source checker with error handling. */
async function runSourceChecker(
  checker: SourceChecker,
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<SourceCheckResult> {
  try {
    const result = await checker(article, config);
    if (result !== null && typeof result === "object" && "skipped" in result) {
      return { skipReason: result.skipped };
    }
    return { locations: result ?? [] };
  } catch (err) {
    return { error: String(err) };
  }
}
