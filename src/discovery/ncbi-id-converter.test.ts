/**
 * Tests for NCBI ID Converter API client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { batchResolveIds, resolveDoiToPmcid } from "./ncbi-id-converter.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("resolveDoiToPmcid", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("resolves a DOI to PMCID and PMID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [
            {
              pmcid: "PMC1234567",
              pmid: "12345678",
              doi: "10.1234/example",
            },
          ],
        }),
    });

    const result = await resolveDoiToPmcid("10.1234/example");

    expect(result).toEqual({
      pmcid: "PMC1234567",
      pmid: "12345678",
      doi: "10.1234/example",
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("ids=10.1234%2Fexample"));
  });

  it("returns null when DOI has no PMC record", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [{ errmsg: "not found" }],
        }),
    });

    const result = await resolveDoiToPmcid("10.1234/not-in-pmc");
    expect(result).toBeNull();
  });

  it("returns null when empty DOI is provided", async () => {
    const result = await resolveDoiToPmcid("");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await resolveDoiToPmcid("10.1234/nonexistent");
    expect(result).toBeNull();
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(resolveDoiToPmcid("10.1234/example")).rejects.toThrow(
      /NCBI ID Converter API error/
    );
  });

  it("returns null when response has no records", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [],
        }),
    });

    const result = await resolveDoiToPmcid("10.1234/empty");
    expect(result).toBeNull();
  });

  it("passes tool and email options to the API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [{ pmcid: "PMC1234567", doi: "10.1234/example" }],
        }),
    });

    await resolveDoiToPmcid("10.1234/example", {
      tool: "my-tool",
      email: "test@example.com",
    });

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("tool=my-tool");
    expect(calledUrl).toContain("email=test%40example.com");
  });
});

describe("batchResolveIds", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("resolves multiple DOIs in a single request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [
            { pmcid: "PMC1111111", pmid: "11111111", doi: "10.1234/a" },
            { pmcid: "PMC2222222", pmid: "22222222", doi: "10.1234/b" },
          ],
        }),
    });

    const result = await batchResolveIds(["10.1234/a", "10.1234/b"]);

    expect(result.size).toBe(2);
    expect(result.get("10.1234/a")).toEqual({
      pmcid: "PMC1111111",
      pmid: "11111111",
      doi: "10.1234/a",
    });
    expect(result.get("10.1234/b")).toEqual({
      pmcid: "PMC2222222",
      pmid: "22222222",
      doi: "10.1234/b",
    });
  });

  it("returns empty map for empty input", async () => {
    const result = await batchResolveIds([]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips records with errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          records: [
            { pmcid: "PMC1111111", doi: "10.1234/a" },
            { errmsg: "not found", doi: "10.1234/b" },
          ],
        }),
    });

    const result = await batchResolveIds(["10.1234/a", "10.1234/b"]);

    expect(result.size).toBe(1);
    expect(result.has("10.1234/a")).toBe(true);
    expect(result.has("10.1234/b")).toBe(false);
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    await expect(batchResolveIds(["10.1234/a"])).rejects.toThrow(/NCBI ID Converter API error/);
  });
});
