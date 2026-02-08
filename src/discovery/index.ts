/**
 * OA Discovery Aggregator.
 * Combines results from multiple OA discovery sources.
 */

import type { OALocation, OAStatus } from "../types.js";
import { checkArxiv } from "./arxiv.js";
import { checkCore } from "./core.js";
import { checkPmc } from "./pmc.js";
import { checkUnpaywall } from "./unpaywall.js";

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
}

export interface DiscoveryResult {
  oaStatus: OAStatus;
  locations: OALocation[];
  errors: Array<{ source: string; error: string }>;
}

/** Default source order when preferSources is empty or not specified */
const DEFAULT_SOURCE_ORDER = ["pmc", "arxiv", "unpaywall", "core"];

/**
 * A source checker returns:
 * - undefined if the source is not applicable (precondition not met, skip entirely)
 * - OALocation[] | null if the source was checked (null means checked but nothing found)
 */
type SourceCheckerResult =
  | Promise<OALocation[] | null | undefined>
  | OALocation[]
  | null
  | undefined;
type SourceChecker = (article: DiscoveryArticle, config: DiscoveryConfig) => SourceCheckerResult;

async function checkPmcSource(article: DiscoveryArticle): Promise<OALocation[] | null | undefined> {
  if (!article.pmid && !article.pmcid) return undefined;
  const ids: { pmid?: string; pmcid?: string } = {};
  if (article.pmid) ids.pmid = article.pmid;
  if (article.pmcid) ids.pmcid = article.pmcid;
  return await checkPmc(ids);
}

function checkArxivSource(article: DiscoveryArticle): OALocation[] | null | undefined {
  if (!article.arxivId) return undefined;
  return checkArxiv(article.arxivId);
}

async function checkUnpaywallSource(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<OALocation[] | null | undefined> {
  if (!config.unpaywallEmail || !article.doi) return undefined;
  return await checkUnpaywall(article.doi, config.unpaywallEmail);
}

async function checkCoreSource(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<OALocation[] | null | undefined> {
  if (!config.coreApiKey || !article.doi) return undefined;
  return await checkCore(article.doi, config.coreApiKey);
}

/** Map of source name to its checker function. */
const sourceCheckers: Record<string, SourceChecker> = {
  pmc: checkPmcSource,
  arxiv: checkArxivSource,
  unpaywall: checkUnpaywallSource,
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

/**
 * Discover OA availability for an article across all configured sources.
 * Checks sources in the order specified by config.preferSources, falling back
 * to the default order. Individual source errors are caught and reported
 * without failing the whole discovery.
 */
export async function discoverOA(
  article: DiscoveryArticle,
  config: DiscoveryConfig
): Promise<DiscoveryResult> {
  const locations: OALocation[] = [];
  const errors: Array<{ source: string; error: string }> = [];
  let sourcesChecked = 0;

  const sourceOrder = config.preferSources.length > 0 ? config.preferSources : DEFAULT_SOURCE_ORDER;

  for (const source of sourceOrder) {
    const checker = sourceCheckers[source];
    if (!checker) continue;

    const result = await runSourceChecker(checker, article, config);
    if (result.skipped) continue;

    sourcesChecked++;
    if (result.error) {
      errors.push({ source, error: result.error });
    } else if (result.locations) {
      locations.push(...result.locations);
    }
  }

  const oaStatus = determineOAStatus(locations, errors, sourcesChecked);
  return { oaStatus, locations, errors };
}

interface SourceCheckResult {
  skipped: boolean;
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
    if (result === undefined) return { skipped: true };
    return { skipped: false, locations: result ?? [] };
  } catch (err) {
    return { skipped: false, error: String(err) };
  }
}
