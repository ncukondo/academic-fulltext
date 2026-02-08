/**
 * Tests for fulltext fetch orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchFulltext,
  fetchAllFulltexts,
  type FetchArticle,
} from './orchestrator.js';
import type { FulltextMeta } from '../types.js';

// Mock downloader and pmc-xml
vi.mock('./downloader.js', () => ({
  downloadPdf: vi.fn(),
}));

vi.mock('./pmc-xml.js', () => ({
  downloadPmcXml: vi.fn(),
}));

// Mock meta and paths
vi.mock('../meta.js', () => ({
  loadMeta: vi.fn(),
  saveMeta: vi.fn(),
}));

vi.mock('../paths.js', () => ({
  getArticleDir: vi.fn((_sessionDir: string, dirName: string) => `/sessions/test/fulltext/${dirName}`),
  getFulltextDir: vi.fn(() => '/sessions/test/fulltext'),
}));

// Mock fs
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

import { downloadPdf } from './downloader.js';
import { downloadPmcXml } from './pmc-xml.js';
import { loadMeta, saveMeta } from '../meta.js';

const mockDownloadPdf = vi.mocked(downloadPdf);
const mockDownloadPmcXml = vi.mocked(downloadPmcXml);
const mockLoadMeta = vi.mocked(loadMeta);
const mockSaveMeta = vi.mocked(saveMeta);

function createTestMeta(overrides: Partial<FulltextMeta> = {}): FulltextMeta {
  return {
    dirName: 'smith2024-a1b2c3d4',
    citationKey: 'smith2024',
    uuid: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
    title: 'Test Article',
    oaStatus: 'open',
    files: {},
    oaLocations: [
      {
        source: 'pmc',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/',
        urlType: 'pdf',
        version: 'published',
      },
    ],
    pmcid: 'PMC1234567',
    ...overrides,
  };
}

function createTestArticle(overrides: Partial<FetchArticle> & { noPmcid?: boolean } = {}): FetchArticle {
  const { noPmcid, ...rest } = overrides;
  const base: FetchArticle = {
    dirName: 'smith2024-a1b2c3d4',
    oaLocations: [
      {
        source: 'pmc',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/',
        urlType: 'pdf',
        version: 'published',
      },
    ],
    ...(!noPmcid ? { pmcid: 'PMC1234567' } : {}),
    ...rest,
  };
  return base;
}

describe('fetchFulltext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMeta.mockResolvedValue(createTestMeta());
    mockSaveMeta.mockResolvedValue(undefined);
    mockDownloadPdf.mockResolvedValue({ success: true, size: 1024 });
    mockDownloadPmcXml.mockResolvedValue({ success: true, size: 512 });
  });

  it('fetches from best available source (by priority)', async () => {
    const article = createTestArticle({
      oaLocations: [
        { source: 'unpaywall', url: 'https://oa.example.com/paper.pdf', urlType: 'pdf', version: 'accepted' },
        { source: 'pmc', url: 'https://pmc.example.com/pdf/', urlType: 'pdf', version: 'published' },
      ],
    });

    const result = await fetchFulltext(article, '/sessions/test');

    expect(result.status).toBe('downloaded');
    // PMC should be preferred over unpaywall
    expect(mockDownloadPdf).toHaveBeenCalledWith(
      'https://pmc.example.com/pdf/',
      expect.stringContaining('fulltext.pdf'),
      expect.anything(),
    );
  });

  it('creates directory if not exists', async () => {
    const { mkdir } = await import('node:fs/promises');
    const mockMkdir = vi.mocked(mkdir);
    const article = createTestArticle();

    await fetchFulltext(article, '/sessions/test');

    expect(mockMkdir).toHaveBeenCalledWith(
      '/sessions/test/fulltext/smith2024-a1b2c3d4',
      { recursive: true },
    );
  });

  it('updates meta.json after download', async () => {
    const article = createTestArticle();

    await fetchFulltext(article, '/sessions/test');

    expect(mockSaveMeta).toHaveBeenCalled();
    const savedMeta = mockSaveMeta.mock.calls[0]![1] as FulltextMeta;
    expect(savedMeta.files.pdf).toBeDefined();
    expect(savedMeta.files.pdf?.source).toBe('pmc');
  });

  it('downloads PMC XML when pmcid is available', async () => {
    const article = createTestArticle({
      pmcid: 'PMC1234567',
    });

    await fetchFulltext(article, '/sessions/test');

    expect(mockDownloadPmcXml).toHaveBeenCalledWith(
      'PMC1234567',
      expect.stringContaining('fulltext.xml'),
    );
  });

  it('handles download failure gracefully', async () => {
    mockDownloadPdf.mockResolvedValue({ success: false, error: 'HTTP 403 Forbidden' });
    mockDownloadPmcXml.mockResolvedValue({ success: false, error: 'HTTP 404 Not Found' });

    const article = createTestArticle();

    const result = await fetchFulltext(article, '/sessions/test');

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });

  it('skips if already has PDF file', async () => {
    mockLoadMeta.mockResolvedValue(createTestMeta({
      files: {
        pdf: {
          filename: 'fulltext.pdf',
          source: 'pmc',
          retrievedAt: '2024-01-01T00:00:00Z',
          size: 1024,
        },
      },
    }));

    const article = createTestArticle();

    const result = await fetchFulltext(article, '/sessions/test');

    expect(result.status).toBe('skipped');
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it('falls back to next source on failure', async () => {
    mockDownloadPdf
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockResolvedValueOnce({ success: true, size: 2048 });

    const article = createTestArticle({
      oaLocations: [
        { source: 'pmc', url: 'https://pmc.example.com/pdf/', urlType: 'pdf', version: 'published' },
        { source: 'unpaywall', url: 'https://oa.example.com/paper.pdf', urlType: 'pdf', version: 'accepted' },
      ],
    });

    const result = await fetchFulltext(article, '/sessions/test');

    expect(result.status).toBe('downloaded');
    expect(mockDownloadPdf).toHaveBeenCalledTimes(2);
  });
});

describe('fetchAllFulltexts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMeta.mockResolvedValue(createTestMeta());
    mockSaveMeta.mockResolvedValue(undefined);
    mockDownloadPdf.mockResolvedValue({ success: true, size: 1024 });
    mockDownloadPmcXml.mockResolvedValue({ success: true, size: 512 });
  });

  it('processes multiple articles with concurrency limit', async () => {
    const articles = [
      createTestArticle({ dirName: 'art1-aaaa' }),
      createTestArticle({ dirName: 'art2-bbbb' }),
      createTestArticle({ dirName: 'art3-cccc' }),
    ];

    const results = await fetchAllFulltexts(articles, '/sessions/test', {
      concurrency: 2,
      retryDelay: 10,
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'downloaded')).toBe(true);
  });

  it('calls progress callback', async () => {
    const articles = [
      createTestArticle({ dirName: 'art1-aaaa' }),
      createTestArticle({ dirName: 'art2-bbbb' }),
    ];

    const progress = vi.fn();

    await fetchAllFulltexts(articles, '/sessions/test', {
      concurrency: 1,
      retryDelay: 10,
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      completed: expect.any(Number),
      total: 2,
    }));
  });

  it('returns summary with downloaded, failed, skipped counts', async () => {
    mockLoadMeta
      .mockResolvedValueOnce(createTestMeta())
      .mockResolvedValueOnce(createTestMeta({
        files: { pdf: { filename: 'fulltext.pdf', source: 'pmc', retrievedAt: '2024-01-01', size: 1024 } },
      }))
      .mockResolvedValueOnce(createTestMeta());
    mockDownloadPdf
      .mockResolvedValueOnce({ success: true, size: 1024 })
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' });
    mockDownloadPmcXml
      .mockResolvedValueOnce({ success: true, size: 512 })
      .mockResolvedValue({ success: false, error: 'HTTP 404' });

    const articles = [
      createTestArticle({ dirName: 'art1-aaaa' }),
      createTestArticle({ dirName: 'art2-bbbb' }),
      createTestArticle({ dirName: 'art3-cccc', noPmcid: true, oaLocations: [
        { source: 'unpaywall', url: 'https://fail.com/x.pdf', urlType: 'pdf', version: 'published' },
      ] }),
    ];

    const results = await fetchAllFulltexts(articles, '/sessions/test', {
      concurrency: 1,
      retryDelay: 10,
    });

    const downloaded = results.filter((r) => r.status === 'downloaded');
    const skipped = results.filter((r) => r.status === 'skipped');
    const failed = results.filter((r) => r.status === 'failed');

    expect(downloaded).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });
});
