/**
 * Tests for OA Discovery Aggregator.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OALocation } from "../types.js";
import * as arxivModule from "./arxiv.js";
import * as coreModule from "./core.js";
import { type DiscoveryArticle, discoverOA } from "./index.js";
import * as ncbiModule from "./ncbi-id-converter.js";
import * as pmcModule from "./pmc.js";
import * as unpaywallModule from "./unpaywall.js";

// Mock the individual discovery modules
vi.mock("./unpaywall.js");
vi.mock("./pmc.js");
vi.mock("./arxiv.js");
vi.mock("./core.js");
vi.mock("./ncbi-id-converter.js");

const mockCheckUnpaywallDetailed = vi.mocked(unpaywallModule.checkUnpaywallDetailed);
const mockCheckPmc = vi.mocked(pmcModule.checkPmc);
const mockCheckArxiv = vi.mocked(arxivModule.checkArxiv);
const mockCheckCore = vi.mocked(coreModule.checkCore);
const mockResolveDoiToPmcid = vi.mocked(ncbiModule.resolveDoiToPmcid);

describe("discoverOA", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: NCBI ID Converter returns null (no enrichment)
    mockResolveDoiToPmcid.mockResolvedValue(null);
  });

  const baseArticle: DiscoveryArticle = {
    doi: "10.1234/example",
    pmid: "12345678",
  };

  const baseConfig = {
    unpaywallEmail: "test@example.com",
    coreApiKey: "",
    preferSources: ["pmc", "arxiv", "unpaywall", "core"] as string[],
  };

  it("checks all configured sources and aggregates results", async () => {
    const pmcLocations: OALocation[] = [
      { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
    ];
    const unpaywallLocations: OALocation[] = [
      {
        source: "unpaywall",
        url: "https://unpaywall.example.com/pdf",
        urlType: "pdf",
        version: "published",
      },
    ];

    mockCheckPmc.mockResolvedValue({ locations: pmcLocations });
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue({ locations: unpaywallLocations });
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    expect(result.oaStatus).toBe("open");
    expect(result.locations).toHaveLength(2);
    expect(result.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "pmc" }),
        expect.objectContaining({ source: "unpaywall" }),
      ])
    );
  });

  it("determines oaStatus as open when locations found", async () => {
    mockCheckPmc.mockResolvedValue({
      locations: [
        { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
      ],
    });
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);
    expect(result.oaStatus).toBe("open");
  });

  it("determines oaStatus as closed when no locations found", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);
    expect(result.oaStatus).toBe("closed");
    expect(result.locations).toHaveLength(0);
  });

  it("skips unconfigured sources (no Unpaywall email)", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, {
      ...baseConfig,
      unpaywallEmail: "",
    });

    expect(mockCheckUnpaywallDetailed).not.toHaveBeenCalled();
    expect(result.oaStatus).toBe("closed");
  });

  it("skips CORE when no API key", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    await discoverOA(baseArticle, baseConfig);

    expect(mockCheckCore).not.toHaveBeenCalled();
  });

  it("checks CORE when API key is provided", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    await discoverOA(baseArticle, {
      ...baseConfig,
      coreApiKey: "test-key",
    });

    expect(mockCheckCore).toHaveBeenCalledWith("10.1234/example", "test-key");
  });

  it("checks arXiv when arxivId is present", async () => {
    const arxivLocations: OALocation[] = [
      {
        source: "arxiv",
        url: "https://arxiv.org/pdf/2401.12345.pdf",
        urlType: "pdf",
        version: "submitted",
      },
    ];
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(arxivLocations);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA({ ...baseArticle, arxivId: "2401.12345" }, baseConfig);

    expect(mockCheckArxiv).toHaveBeenCalledWith("2401.12345");
    expect(result.oaStatus).toBe("open");
  });

  it("skips arXiv when no arxivId", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    await discoverOA(baseArticle, baseConfig);

    expect(mockCheckArxiv).not.toHaveBeenCalled();
  });

  it("handles errors in individual sources gracefully", async () => {
    mockCheckPmc.mockRejectedValue(new Error("PMC error"));
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue({
      locations: [
        {
          source: "unpaywall",
          url: "https://example.com/pdf",
          urlType: "pdf",
          version: "published",
        },
      ],
    });
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    // Should still return unpaywall results despite PMC error
    expect(result.oaStatus).toBe("open");
    expect(result.locations).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0 as number]).toEqual(expect.objectContaining({ source: "pmc" }));
  });

  it("checks sources in preferSources order", async () => {
    const callOrder: string[] = [];
    mockCheckPmc.mockImplementation(async () => {
      callOrder.push("pmc");
      return null;
    });
    mockCheckArxiv.mockImplementation(() => {
      callOrder.push("arxiv");
      return null;
    });
    mockCheckUnpaywallDetailed.mockImplementation(async () => {
      callOrder.push("unpaywall");
      return null;
    });
    mockCheckCore.mockImplementation(async () => {
      callOrder.push("core");
      return null;
    });

    // Reverse order: core, unpaywall, arxiv, pmc
    await discoverOA(
      { ...baseArticle, arxivId: "2401.12345" },
      {
        ...baseConfig,
        coreApiKey: "test-key",
        preferSources: ["core", "unpaywall", "arxiv", "pmc"],
      }
    );

    expect(callOrder).toEqual(["core", "unpaywall", "arxiv", "pmc"]);
  });

  it("uses default order when preferSources is empty", async () => {
    const callOrder: string[] = [];
    mockCheckPmc.mockImplementation(async () => {
      callOrder.push("pmc");
      return null;
    });
    mockCheckArxiv.mockImplementation(() => {
      callOrder.push("arxiv");
      return null;
    });
    mockCheckUnpaywallDetailed.mockImplementation(async () => {
      callOrder.push("unpaywall");
      return null;
    });
    mockCheckCore.mockImplementation(async () => {
      callOrder.push("core");
      return null;
    });

    await discoverOA(
      { ...baseArticle, arxivId: "2401.12345" },
      { ...baseConfig, coreApiKey: "test-key", preferSources: [] }
    );

    // Default order: pmc, arxiv, unpaywall, core
    expect(callOrder).toEqual(["pmc", "arxiv", "unpaywall", "core"]);
  });

  it("returns unknown status when all sources error", async () => {
    mockCheckPmc.mockRejectedValue(new Error("PMC error"));
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockRejectedValue(new Error("Unpaywall error"));
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    expect(result.oaStatus).toBe("unknown");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns discoveredIds in the result", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);
    expect(result.discoveredIds).toBeDefined();
  });

  it("records discovered PMCID in discoveredIds when PMC lookup via PMID succeeds", async () => {
    mockCheckPmc.mockResolvedValue({
      locations: [
        { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
      ],
      discoveredPmcid: "PMC8888888",
    });
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(
      { doi: "10.1234/example", pmid: "12345678" },
      baseConfig
    );

    expect(result.oaStatus).toBe("open");
    expect(result.discoveredIds.pmcid).toBe("PMC8888888");
  });
});

describe("discoverOA - NCBI enrichment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const doiOnlyArticle: DiscoveryArticle = {
    doi: "10.1234/example",
  };

  const baseConfig = {
    unpaywallEmail: "test@example.com",
    coreApiKey: "",
    preferSources: ["pmc", "arxiv", "unpaywall", "core"] as string[],
  };

  it("enriches DOI-only article with PMCID from NCBI ID Converter", async () => {
    mockResolveDoiToPmcid.mockResolvedValue({
      pmcid: "PMC9999999",
      pmid: "99999999",
      doi: "10.1234/example",
    });
    const pmcLocations: OALocation[] = [
      { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
    ];
    mockCheckPmc.mockResolvedValue({ locations: pmcLocations });
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    const result = await discoverOA(doiOnlyArticle, baseConfig);

    expect(result.oaStatus).toBe("open");
    expect(result.discoveredIds.pmcid).toBe("PMC9999999");
    expect(result.discoveredIds.pmid).toBe("99999999");
    // PMC should have been checked with the enriched PMCID
    expect(mockCheckPmc).toHaveBeenCalledWith(expect.objectContaining({ pmcid: "PMC9999999" }));
  });

  it("skips enrichment when article already has pmid", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    await discoverOA({ doi: "10.1234/example", pmid: "12345678" }, baseConfig);

    expect(mockResolveDoiToPmcid).not.toHaveBeenCalled();
  });

  it("skips enrichment when article already has pmcid", async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    await discoverOA({ doi: "10.1234/example", pmcid: "PMC1234567" }, baseConfig);

    expect(mockResolveDoiToPmcid).not.toHaveBeenCalled();
  });

  it("continues gracefully when NCBI ID Converter fails", async () => {
    mockResolveDoiToPmcid.mockRejectedValue(new Error("API error"));
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue({
      locations: [
        {
          source: "unpaywall",
          url: "https://example.com/pdf",
          urlType: "pdf",
          version: "published",
        },
      ],
    });

    const result = await discoverOA(doiOnlyArticle, baseConfig);

    expect(result.oaStatus).toBe("open");
    expect(result.locations).toHaveLength(1);
  });

  it("uses unpaywallEmail as fallback when ncbiEmail not set", async () => {
    mockResolveDoiToPmcid.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    await discoverOA(doiOnlyArticle, baseConfig);

    expect(mockResolveDoiToPmcid).toHaveBeenCalledWith("10.1234/example", {
      tool: undefined,
      email: "test@example.com",
    });
  });

  it("uses ncbiEmail when provided", async () => {
    mockResolveDoiToPmcid.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue(null);

    await discoverOA(doiOnlyArticle, {
      ...baseConfig,
      ncbiEmail: "ncbi@example.com",
      ncbiTool: "my-tool",
    });

    expect(mockResolveDoiToPmcid).toHaveBeenCalledWith("10.1234/example", {
      tool: "my-tool",
      email: "ncbi@example.com",
    });
  });
});

describe("discoverOA - lazy PMC check from Unpaywall", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveDoiToPmcid.mockResolvedValue(null);
  });

  const doiOnlyArticle: DiscoveryArticle = {
    doi: "10.1234/example",
  };

  const baseConfig = {
    unpaywallEmail: "test@example.com",
    coreApiKey: "",
    preferSources: ["pmc", "arxiv", "unpaywall", "core"] as string[],
  };

  it("performs lazy PMC check when Unpaywall reveals PMCID", async () => {
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue({
      locations: [
        {
          source: "unpaywall",
          url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7777777/pdf/",
          urlType: "pdf",
          version: "published",
        },
      ],
      pmcid: "PMC7777777",
    });
    const pmcLocations: OALocation[] = [
      { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
    ];
    mockCheckPmc.mockResolvedValue({ locations: pmcLocations });

    const result = await discoverOA(doiOnlyArticle, baseConfig);

    // PMC should be called once for lazy check (first call is skipped because no pmid/pmcid)
    expect(mockCheckPmc).toHaveBeenCalledWith({ pmcid: "PMC7777777" });
    expect(result.discoveredIds.pmcid).toBe("PMC7777777");
    expect(result.locations.length).toBeGreaterThanOrEqual(2);
  });

  it("does not perform lazy PMC check when enriched article already has pmcid", async () => {
    mockResolveDoiToPmcid.mockResolvedValue({
      pmcid: "PMC7777777",
      doi: "10.1234/example",
    });
    const pmcLocations: OALocation[] = [
      { source: "pmc", url: "https://pmc.example.com/pdf", urlType: "pdf", version: "published" },
    ];
    mockCheckPmc.mockResolvedValue({ locations: pmcLocations });
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywallDetailed.mockResolvedValue({
      locations: [
        {
          source: "unpaywall",
          url: "https://example.com/pdf",
          urlType: "pdf",
          version: "published",
        },
      ],
      pmcid: "PMC7777777",
    });

    await discoverOA(doiOnlyArticle, baseConfig);

    // checkPmc should only be called once (regular check), not for lazy check
    expect(mockCheckPmc).toHaveBeenCalledTimes(1);
  });
});
