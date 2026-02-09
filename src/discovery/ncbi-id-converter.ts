/**
 * NCBI ID Converter API client.
 * Resolves DOI → PMCID/PMID using the NCBI ID Converter API.
 *
 * API: https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids={doi}&format=json
 */

const IDCONV_BASE_URL = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";

export interface IdConversionResult {
  pmcid?: string;
  pmid?: string;
  doi?: string;
}

export interface IdConverterOptions {
  tool?: string;
  email?: string;
}

interface IdConvRecord {
  pmcid?: string;
  pmid?: string;
  doi?: string;
  errmsg?: string;
}

interface IdConvResponse {
  status: string;
  records?: IdConvRecord[];
}

function buildUrl(ids: string[], options?: IdConverterOptions): string {
  const params = new URLSearchParams({
    ids: ids.join(","),
    format: "json",
  });
  if (options?.tool) params.set("tool", options.tool);
  if (options?.email) params.set("email", options.email);
  return `${IDCONV_BASE_URL}?${params.toString()}`;
}

function parseRecord(record: IdConvRecord): IdConversionResult | null {
  if (record.errmsg) return null;
  const result: IdConversionResult = {};
  if (record.pmcid) result.pmcid = record.pmcid;
  if (record.pmid) result.pmid = record.pmid;
  if (record.doi) result.doi = record.doi;
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resolve a single DOI to PMCID/PMID via the NCBI ID Converter API.
 *
 * @param doi - The article's DOI
 * @param options - Optional tool name and email for API identification
 * @returns Conversion result with pmcid/pmid, or null if not found
 */
export async function resolveDoiToPmcid(
  doi: string,
  options?: IdConverterOptions
): Promise<IdConversionResult | null> {
  if (!doi) return null;

  const url = buildUrl([doi], options);
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`NCBI ID Converter API error: HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as IdConvResponse;

  if (!data.records || data.records.length === 0) return null;

  const record = data.records[0 as number];
  if (!record) return null;

  return parseRecord(record);
}

/**
 * Batch resolve multiple IDs (DOIs, PMIDs, PMCIDs) to their cross-references.
 *
 * @param ids - Array of identifiers to resolve
 * @param options - Optional tool name and email for API identification
 * @returns Map of input ID → conversion result
 */
export async function batchResolveIds(
  ids: string[],
  options?: IdConverterOptions
): Promise<Map<string, IdConversionResult>> {
  const results = new Map<string, IdConversionResult>();
  if (ids.length === 0) return results;

  const url = buildUrl(ids, options);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NCBI ID Converter API error: HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as IdConvResponse;

  if (!data.records) return results;

  for (const record of data.records) {
    const parsed = parseRecord(record);
    if (!parsed) continue;

    // Map back to the input ID: try doi, pmid, pmcid
    const key = record.doi ?? record.pmid ?? record.pmcid;
    if (key) results.set(key, parsed);
  }

  return results;
}
