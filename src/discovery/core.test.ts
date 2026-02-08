/**
 * Tests for CORE API OA discovery client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCore } from './core.js';
import type { OALocation } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Helper to assert non-null and return typed value */
function assertLocations(result: OALocation[] | null): OALocation[] {
  expect(result).not.toBeNull();
  return result as OALocation[];
}

describe('checkCore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns OALocation for article found in CORE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalHits: 1,
          results: [
            {
              downloadUrl: 'https://core.ac.uk/download/pdf/12345.pdf',
              sourceFulltextUrls: ['https://repository.example.com/paper.pdf'],
            },
          ],
        }),
    });

    const result = await checkCore('10.1234/example', 'test-api-key');

    const locs = assertLocations(result);
    expect(locs).toHaveLength(1);
    expect(locs).toEqual([
      expect.objectContaining({
        source: 'core',
        url: 'https://core.ac.uk/download/pdf/12345.pdf',
        urlType: 'pdf',
        version: 'accepted',
      }),
    ]);

    // Verify API call
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.core.ac.uk'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      })
    );
  });

  it('returns null when no API key provided (skips gracefully)', async () => {
    const result = await checkCore('10.1234/example', '');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when no API key provided (undefined)', async () => {
    const result = await checkCore('10.1234/example', undefined);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on 404 (not found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalHits: 0,
          results: [],
        }),
    });

    const result = await checkCore('10.9999/nonexistent', 'test-api-key');
    expect(result).toBeNull();
  });

  it('throws on rate limit (429)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(checkCore('10.1234/example', 'test-api-key')).rejects.toThrow(
      /rate limit/i
    );
  });

  it('returns null when DOI is empty', async () => {
    const result = await checkCore('', 'test-api-key');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to sourceFulltextUrls when downloadUrl is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalHits: 1,
          results: [
            {
              downloadUrl: null,
              sourceFulltextUrls: ['https://repository.example.com/paper.pdf'],
            },
          ],
        }),
    });

    const result = await checkCore('10.1234/example', 'test-api-key');
    const locs = assertLocations(result);
    expect(locs).toHaveLength(1);
    expect(locs).toEqual([
      expect.objectContaining({
        url: 'https://repository.example.com/paper.pdf',
        urlType: 'repository',
      }),
    ]);
  });

  it('returns null when no URLs available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalHits: 1,
          results: [
            {
              downloadUrl: null,
              sourceFulltextUrls: [],
            },
          ],
        }),
    });

    const result = await checkCore('10.1234/example', 'test-api-key');
    expect(result).toBeNull();
  });
});
