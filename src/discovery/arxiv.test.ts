/**
 * Tests for arXiv OA discovery client.
 */

import { describe, it, expect } from 'vitest';
import { checkArxiv } from './arxiv.js';
import type { OALocation } from '../types.js';

/** Helper to assert non-null and return typed value */
function assertLocations(result: OALocation[] | null): OALocation[] {
  expect(result).not.toBeNull();
  return result as OALocation[];
}

describe('checkArxiv', () => {
  it('returns PDF URL for new-style arXiv ID (2401.12345)', () => {
    const result = checkArxiv('2401.12345');
    const locs = assertLocations(result);
    expect(locs).toHaveLength(1);
    expect(locs).toEqual([
      expect.objectContaining({
        source: 'arxiv',
        url: 'https://arxiv.org/pdf/2401.12345.pdf',
        urlType: 'pdf',
        version: 'submitted',
      }),
    ]);
  });

  it('returns PDF URL for new-style arXiv ID with version (2401.12345v2)', () => {
    const result = checkArxiv('2401.12345v2');
    const locs = assertLocations(result);
    expect(locs).toEqual([
      expect.objectContaining({
        url: 'https://arxiv.org/pdf/2401.12345v2.pdf',
      }),
    ]);
  });

  it('returns PDF URL for old-style arXiv ID (hep-ph/9901234)', () => {
    const result = checkArxiv('hep-ph/9901234');
    const locs = assertLocations(result);
    expect(locs).toEqual([
      expect.objectContaining({
        source: 'arxiv',
        url: 'https://arxiv.org/pdf/hep-ph/9901234.pdf',
        urlType: 'pdf',
        version: 'submitted',
      }),
    ]);
  });

  it('returns PDF URL for old-style arXiv ID with version (hep-ph/9901234v1)', () => {
    const result = checkArxiv('hep-ph/9901234v1');
    const locs = assertLocations(result);
    expect(locs).toEqual([
      expect.objectContaining({
        url: 'https://arxiv.org/pdf/hep-ph/9901234v1.pdf',
      }),
    ]);
  });

  it('strips arXiv: prefix if present', () => {
    const result = checkArxiv('arXiv:2401.12345');
    const locs = assertLocations(result);
    expect(locs).toEqual([
      expect.objectContaining({
        url: 'https://arxiv.org/pdf/2401.12345.pdf',
      }),
    ]);
  });

  it('returns null for empty ID', () => {
    expect(checkArxiv('')).toBeNull();
  });

  it('returns null for undefined ID', () => {
    expect(checkArxiv(undefined as unknown as string)).toBeNull();
  });
});
