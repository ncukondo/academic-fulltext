/**
 * Tests for arXiv OA discovery client.
 */

import { describe, expect, it } from "vitest";
import type { OALocation } from "../types.js";
import { checkArxiv } from "./arxiv.js";

/** Helper to assert non-null and return typed value */
function assertLocations(result: OALocation[] | null): OALocation[] {
  expect(result).not.toBeNull();
  return result as OALocation[];
}

describe("checkArxiv", () => {
  it("returns PDF and HTML URLs for new-style arXiv ID (2401.12345)", () => {
    const result = checkArxiv("2401.12345");
    const locs = assertLocations(result);
    expect(locs).toHaveLength(2);
    expect(locs).toEqual([
      expect.objectContaining({
        source: "arxiv",
        url: "https://arxiv.org/pdf/2401.12345.pdf",
        urlType: "pdf",
        version: "submitted",
      }),
      expect.objectContaining({
        source: "arxiv",
        url: "https://arxiv.org/html/2401.12345",
        urlType: "html",
        version: "submitted",
      }),
    ]);
  });

  it("returns PDF and HTML URLs for new-style arXiv ID with version (2401.12345v2)", () => {
    const result = checkArxiv("2401.12345v2");
    const locs = assertLocations(result);
    expect(locs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://arxiv.org/pdf/2401.12345v2.pdf",
        }),
        expect.objectContaining({
          url: "https://arxiv.org/html/2401.12345v2",
        }),
      ])
    );
  });

  it("returns PDF and HTML URLs for old-style arXiv ID (hep-ph/9901234)", () => {
    const result = checkArxiv("hep-ph/9901234");
    const locs = assertLocations(result);
    expect(locs).toEqual([
      expect.objectContaining({
        source: "arxiv",
        url: "https://arxiv.org/pdf/hep-ph/9901234.pdf",
        urlType: "pdf",
        version: "submitted",
      }),
      expect.objectContaining({
        source: "arxiv",
        url: "https://arxiv.org/html/hep-ph/9901234",
        urlType: "html",
        version: "submitted",
      }),
    ]);
  });

  it("returns PDF and HTML URLs for old-style arXiv ID with version (hep-ph/9901234v1)", () => {
    const result = checkArxiv("hep-ph/9901234v1");
    const locs = assertLocations(result);
    expect(locs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://arxiv.org/pdf/hep-ph/9901234v1.pdf",
        }),
        expect.objectContaining({
          url: "https://arxiv.org/html/hep-ph/9901234v1",
        }),
      ])
    );
  });

  it("strips arXiv: prefix if present", () => {
    const result = checkArxiv("arXiv:2401.12345");
    const locs = assertLocations(result);
    expect(locs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://arxiv.org/pdf/2401.12345.pdf",
        }),
        expect.objectContaining({
          url: "https://arxiv.org/html/2401.12345",
        }),
      ])
    );
  });

  it("returns null for empty ID", () => {
    expect(checkArxiv("")).toBeNull();
  });

  it("returns null for undefined ID", () => {
    expect(checkArxiv(undefined as unknown as string)).toBeNull();
  });
});
