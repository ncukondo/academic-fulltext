/**
 * Tests for PMC XML downloader.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadPmcXml } from './pmc-xml.js';
import { writeFile, mkdir } from 'node:fs/promises';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

function createMockResponse(overrides: Partial<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  headers: Map<string, string>;
}> = {}) {
  const headers = new Map(overrides.headers ?? [['content-type', 'text/xml']]);
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    statusText: overrides.statusText ?? 'OK',
    text: overrides.text ?? (() => Promise.resolve('<article><front></front><body></body></article>')),
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  };
}

describe('downloadPmcXml', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined as never);
  });

  it('downloads XML from PMC E-utilities', async () => {
    const xmlContent = '<article><front><article-meta><title-group><article-title>Test</article-title></title-group></article-meta></front><body><p>Content</p></body></article>';
    mockFetch.mockResolvedValueOnce(createMockResponse({
      text: () => Promise.resolve(xmlContent),
    }));

    const result = await downloadPmcXml('PMC1234567', '/tmp/test/fulltext.xml');

    expect(result.success).toBe(true);
    expect(result.size).toBe(Buffer.byteLength(xmlContent));
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/test/fulltext.xml',
      xmlContent,
      'utf-8',
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('eutils.ncbi.nlm.nih.gov'),
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.any(String) }) }),
    );
  });

  it('validates response is XML', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({
      headers: new Map([['content-type', 'text/html']]),
      text: () => Promise.resolve('<html><body>Not XML</body></html>'),
    }));

    const result = await downloadPmcXml('PMC1234567', '/tmp/test/fulltext.xml');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/content.type|xml/i);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles PMCID with and without prefix', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse());

    await downloadPmcXml('PMC1234567', '/tmp/test/fulltext.xml');
    const url1 = mockFetch.mock.calls[0]![0] as string;

    mockFetch.mockResolvedValueOnce(createMockResponse());

    await downloadPmcXml('1234567', '/tmp/test/fulltext.xml');
    const url2 = mockFetch.mock.calls[1]![0] as string;

    // Both should resolve to the same PMC ID in the URL
    expect(url1).toContain('1234567');
    expect(url2).toContain('1234567');
  });

  it('handles errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    const result = await downloadPmcXml('PMC9999999', '/tmp/test/fulltext.xml');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/404/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await downloadPmcXml('PMC1234567', '/tmp/test/fulltext.xml');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('creates parent directory', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse());

    await downloadPmcXml('PMC1234567', '/tmp/test/nested/fulltext.xml');

    expect(mockMkdir).toHaveBeenCalledWith(
      '/tmp/test/nested',
      { recursive: true },
    );
  });

  it('accepts application/xml content type', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({
      headers: new Map([['content-type', 'application/xml; charset=utf-8']]),
    }));

    const result = await downloadPmcXml('PMC1234567', '/tmp/test/fulltext.xml');

    expect(result.success).toBe(true);
  });
});
