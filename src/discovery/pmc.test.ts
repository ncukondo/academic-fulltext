/**
 * Tests for PMC OA discovery client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OALocation } from "../types.js";
import { checkPmc, getPmcUrls } from "./pmc.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Helper to assert non-null and return typed value */
function assertLocations(result: OALocation[] | null): OALocation[] {
  expect(result).not.toBeNull();
  return result as OALocation[];
}

describe("getPmcUrls", () => {
  it("generates correct PDF and XML URLs from PMCID", () => {
    const urls = getPmcUrls("PMC1234567");
    expect(urls).toEqual([
      {
        source: "pmc",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/",
        urlType: "pdf",
        version: "published",
      },
      {
        source: "pmc",
        url: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=1234567&rettype=xml",
        urlType: "xml",
        version: "published",
      },
    ]);
  });

  it("handles PMCID without PMC prefix", () => {
    const urls = getPmcUrls("1234567");
    expect(urls).toHaveLength(2);
    expect(urls[0 as number]).toEqual(
      expect.objectContaining({
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/",
      })
    );
  });
});

describe("checkPmc", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns OALocations (PDF + XML) for a PMC article via PMCID", async () => {
    const result = await checkPmc({ pmcid: "PMC1234567" });

    const locs = assertLocations(result);
    expect(locs).toHaveLength(2);
    const types = locs.map((l) => l.urlType);
    expect(types).toContain("pdf");
    expect(types).toContain("xml");
    // No fetch needed — PMCID is already known
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("looks up PMCID from PMID via E-utilities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          linksets: [
            {
              linksetdbs: [
                {
                  dbto: "pmc",
                  links: ["7654321"],
                },
              ],
            },
          ],
        }),
    });

    const result = await checkPmc({ pmid: "12345678" });

    const locs = assertLocations(result);
    expect(locs).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("elink.fcgi"));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("id=12345678"));
  });

  it("returns null if PMID is not in PMC", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          linksets: [
            {
              // No linksetdbs means no PMC match
            },
          ],
        }),
    });

    const result = await checkPmc({ pmid: "99999999" });
    expect(result).toBeNull();
  });

  it("returns null when no identifiers provided", async () => {
    const result = await checkPmc({});
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws on network error during PMID lookup", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(checkPmc({ pmid: "12345678" })).rejects.toThrow("Network error");
  });

  it("returns null on empty linksets response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          linksets: [],
        }),
    });

    const result = await checkPmc({ pmid: "12345678" });
    expect(result).toBeNull();
  });

  it("passes apiKey when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          linksets: [
            {
              linksetdbs: [{ dbto: "pmc", links: ["7654321"] }],
            },
          ],
        }),
    });

    await checkPmc({ pmid: "12345678" }, { apiKey: "test-key" });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("api_key=test-key"));
  });
});
