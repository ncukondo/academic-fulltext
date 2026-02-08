/**
 * OA Discovery Aggregator.
 * Combines results from multiple OA discovery sources.
 */

import type { OALocation, OAStatus } from '../types.js';
import { checkUnpaywall } from './unpaywall.js';
import { checkPmc } from './pmc.js';
import { checkArxiv } from './arxiv.js';
import { checkCore } from './core.js';

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
const DEFAULT_SOURCE_ORDER = ['pmc', 'arxiv', 'unpaywall', 'core'];

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

  const sourceOrder =
    config.preferSources.length > 0 ? config.preferSources : DEFAULT_SOURCE_ORDER;

  for (const source of sourceOrder) {
    switch (source) {
      case 'pmc':
        if (article.pmid || article.pmcid) {
          sourcesChecked++;
          try {
            const ids: { pmid?: string; pmcid?: string } = {};
            if (article.pmid) ids.pmid = article.pmid;
            if (article.pmcid) ids.pmcid = article.pmcid;
            const pmcResult = await checkPmc(ids);
            if (pmcResult) locations.push(...pmcResult);
          } catch (err) {
            errors.push({ source: 'pmc', error: String(err) });
          }
        }
        break;

      case 'arxiv':
        if (article.arxivId) {
          sourcesChecked++;
          try {
            const arxivResult = checkArxiv(article.arxivId);
            if (arxivResult) locations.push(...arxivResult);
          } catch (err) {
            errors.push({ source: 'arxiv', error: String(err) });
          }
        }
        break;

      case 'unpaywall':
        if (config.unpaywallEmail && article.doi) {
          sourcesChecked++;
          try {
            const unpaywallResult = await checkUnpaywall(article.doi, config.unpaywallEmail);
            if (unpaywallResult) locations.push(...unpaywallResult);
          } catch (err) {
            errors.push({ source: 'unpaywall', error: String(err) });
          }
        }
        break;

      case 'core':
        if (config.coreApiKey && article.doi) {
          sourcesChecked++;
          try {
            const coreResult = await checkCore(article.doi, config.coreApiKey);
            if (coreResult) locations.push(...coreResult);
          } catch (err) {
            errors.push({ source: 'core', error: String(err) });
          }
        }
        break;
    }
  }

  // Determine OA status
  let oaStatus: OAStatus;
  if (locations.length > 0) {
    oaStatus = 'open';
  } else if (errors.length > 0 && errors.length >= sourcesChecked) {
    // All checked sources errored — we can't determine status
    oaStatus = 'unknown';
  } else {
    oaStatus = 'closed';
  }

  return { oaStatus, locations, errors };
}
