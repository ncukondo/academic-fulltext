/**
 * Tests for Unpaywall OA discovery client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OALocation } from "../types.js";
import { checkUnpaywall, checkUnpaywallDetailed, extractPmcidFromUrl } from "./unpaywall.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Helper to assert non-null and return typed value */
function assertLocations(result: OALocation[] | null): OALocation[] {
  expect(result).not.toBeNull();
  return result as OALocation[];
}

describe("checkUnpaywall", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns OALocations for an OA article", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          doi: "10.1234/example",
          is_oa: true,
          best_oa_location: {
            url_for_pdf: "https://example.com/paper.pdf",
            url_for_landing_page: "https://example.com/paper",
            license: "cc-by",
            version: "publishedVersion",
          },
          oa_locations: [
            {
              url_for_pdf: "https://example.com/paper.pdf",
              url_for_landing_page: "https://example.com/paper",
              license: "cc-by",
              version: "publishedVersion",
              host_type: "publisher",
            },
            {
              url_for_pdf: "https://repository.example.com/paper.pdf",
              url_for_landing_page: "https://repository.example.com/paper",
              license: "cc-by-nc",
              version: "acceptedVersion",
              host_type: "repository",
            },
          ],
        }),
    });

    const result = await checkUnpaywall("10.1234/example", "test@example.com");

    const locs = assertLocations(result);
    expect(locs).toHaveLength(2);
    expect(locs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "unpaywall",
          url: "https://example.com/paper.pdf",
          urlType: "pdf",
          version: "published",
          license: "cc-by",
        }),
      ])
    );

    // Verify URL construction (email is URL-encoded)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.unpaywall.org/v2/10.1234/example?email=test%40example.com"
    );
  });

  it("returns null for closed access article", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          doi: "10.1234/closed",
          is_oa: false,
          best_oa_location: null,
          oa_locations: [],
        }),
    });

    const result = await checkUnpaywall("10.1234/closed", "test@example.com");
    expect(result).toBeNull();
  });

  it("returns null on 404 (DOI not found)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await checkUnpaywall("10.9999/nonexistent", "test@example.com");
    expect(result).toBeNull();
  });

  it("throws on rate limit (429)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    await expect(checkUnpaywall("10.1234/example", "test@example.com")).rejects.toThrow(
      /rate limit/i
    );
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(checkUnpaywall("10.1234/example", "test@example.com")).rejects.toThrow(
      "Network error"
    );
  });

  it("returns null when DOI is not provided", async () => {
    const result = await checkUnpaywall("", "test@example.com");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when email is not provided", async () => {
    await expect(checkUnpaywall("10.1234/example", "")).rejects.toThrow(/email.*required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("filters locations without PDF URLs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          doi: "10.1234/html-only",
          is_oa: true,
          best_oa_location: {
            url_for_pdf: null,
            url_for_landing_page: "https://example.com/paper",
            license: "cc-by",
            version: "publishedVersion",
          },
          oa_locations: [
            {
              url_for_pdf: null,
              url_for_landing_page: "https://example.com/paper",
              license: "cc-by",
              version: "publishedVersion",
              host_type: "publisher",
            },
          ],
        }),
    });

    const result = await checkUnpaywall("10.1234/html-only", "test@example.com");

    // Should still return locations for landing pages as html type
    const locs = assertLocations(result);
    expect(locs).toHaveLength(1);
    expect(locs).toEqual([
      expect.objectContaining({
        urlType: "html",
        url: "https://example.com/paper",
      }),
    ]);
  });

  it("maps Unpaywall version strings to our version format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          doi: "10.1234/versions",
          is_oa: true,
          best_oa_location: {
            url_for_pdf: "https://example.com/a.pdf",
            version: "publishedVersion",
          },
          oa_locations: [
            {
              url_for_pdf: "https://example.com/a.pdf",
              version: "publishedVersion",
              host_type: "publisher",
            },
            {
              url_for_pdf: "https://example.com/b.pdf",
              version: "acceptedVersion",
              host_type: "repository",
            },
            {
              url_for_pdf: "https://example.com/c.pdf",
              version: "submittedVersion",
              host_type: "repository",
            },
          ],
        }),
    });

    const result = await checkUnpaywall("10.1234/versions", "test@example.com");
    const locs = assertLocations(result);
    expect(locs).toHaveLength(3);
    const versions = locs.map((l) => l.version);
    expect(versions).toEqual(["published", "accepted", "submitted"]);
  });
});

describe("extractPmcidFromUrl", () => {
  it("extracts PMCID from PMC PDF URL", () => {
    expect(extractPmcidFromUrl("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/")).toBe(
      "PMC1234567"
    );
  });

  it("extracts PMCID from PMC landing page URL", () => {
    expect(extractPmcidFromUrl("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9876543/")).toBe(
      "PMC9876543"
    );
  });

  it("extracts PMCID from europepmc URL", () => {
    expect(extractPmcidFromUrl("https://europepmc.org/articles/pmc/articles/PMC5555555")).toBe(
      "PMC5555555"
    );
  });

  it("returns null for non-PMC URL", () => {
    expect(extractPmcidFromUrl("https://example.com/paper.pdf")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractPmcidFromUrl("")).toBeNull();
  });
});

describe("checkUnpaywallDetailed", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns locations and extracted PMCID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          is_oa: true,
          oa_locations: [
            {
              url_for_pdf: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/",
              url_for_landing_page: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/",
              license: "cc-by",
              version: "publishedVersion",
              host_type: "repository",
            },
            {
              url_for_pdf: "https://example.com/paper.pdf",
              version: "publishedVersion",
              host_type: "publisher",
            },
          ],
        }),
    });

    const result = await checkUnpaywallDetailed("10.1234/example", "test@example.com");

    expect(result).not.toBeNull();
    expect(result?.locations).toHaveLength(2);
    expect(result?.pmcid).toBe("PMC1234567");
  });

  it("returns locations without PMCID when no PMC URL present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          is_oa: true,
          oa_locations: [
            {
              url_for_pdf: "https://example.com/paper.pdf",
              version: "publishedVersion",
              host_type: "publisher",
            },
          ],
        }),
    });

    const result = await checkUnpaywallDetailed("10.1234/no-pmc", "test@example.com");

    expect(result).not.toBeNull();
    expect(result?.locations).toHaveLength(1);
    expect(result?.pmcid).toBeUndefined();
  });

  it("returns null for closed access article", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          is_oa: false,
          oa_locations: [],
        }),
    });

    const result = await checkUnpaywallDetailed("10.1234/closed", "test@example.com");
    expect(result).toBeNull();
  });

  it("returns null when DOI is empty", async () => {
    const result = await checkUnpaywallDetailed("", "test@example.com");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
