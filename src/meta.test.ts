import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMeta, loadMeta, saveMeta, updateMetaFiles } from './meta.js';
import type { FulltextMeta, FileInfo } from './types.js';

describe('Meta.json Management', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-meta-test-${Date.now()}-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createMeta', () => {
    it('should create valid FulltextMeta with required fields', () => {
      const meta = createMeta({
        citationKey: 'smith2024',
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Machine Learning in Healthcare',
        doi: '10.1234/example',
      });

      expect(meta.dirName).toBe('smith2024-a1b2c3d4');
      expect(meta.citationKey).toBe('smith2024');
      expect(meta.uuid).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(meta.title).toBe('Machine Learning in Healthcare');
      expect(meta.doi).toBe('10.1234/example');
      expect(meta.oaStatus).toBe('unchecked');
      expect(meta.files).toEqual({});
    });

    it('should include optional fields when provided', () => {
      const meta = createMeta({
        citationKey: 'smith2024',
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Test',
        pmid: '12345678',
        pmcid: 'PMC1234567',
        arxivId: '2401.12345',
        authors: 'Smith, J.; Jones, A.',
        year: '2024',
      });

      expect(meta.pmid).toBe('12345678');
      expect(meta.pmcid).toBe('PMC1234567');
      expect(meta.arxivId).toBe('2401.12345');
      expect(meta.authors).toBe('Smith, J.; Jones, A.');
      expect(meta.year).toBe('2024');
    });
  });

  describe('saveMeta and loadMeta', () => {
    it('should save meta.json with proper formatting', async () => {
      const meta = createMeta({
        citationKey: 'smith2024',
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Test Article',
        doi: '10.1234/example',
      });

      const metaPath = join(testDir, 'meta.json');
      await saveMeta(metaPath, meta);

      const raw = await readFile(metaPath, 'utf-8');
      // Verify 2-space indentation
      expect(raw).toContain('  "dirName"');
      // Verify it's valid JSON
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['dirName']).toBe('smith2024-a1b2c3d4');
    });

    it('should load meta.json and parse correctly', async () => {
      const meta = createMeta({
        citationKey: 'jones2023',
        uuid: 'e5f6g7h8-1234-5678-abcd-ef1234567890',
        title: 'Another Article',
        pmid: '87654321',
      });

      const metaPath = join(testDir, 'meta.json');
      await saveMeta(metaPath, meta);
      const loaded = await loadMeta(metaPath);

      expect(loaded.citationKey).toBe('jones2023');
      expect(loaded.title).toBe('Another Article');
      expect(loaded.pmid).toBe('87654321');
      expect(loaded.oaStatus).toBe('unchecked');
    });

    it('should throw on non-existent file', async () => {
      const metaPath = join(testDir, 'nonexistent', 'meta.json');
      await expect(loadMeta(metaPath)).rejects.toThrow();
    });
  });

  describe('updateMetaFiles', () => {
    it('should update files section of meta', () => {
      const meta = createMeta({
        citationKey: 'smith2024',
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Test',
      });

      const pdfInfo: FileInfo = {
        filename: 'fulltext.pdf',
        source: 'manual',
        retrievedAt: '2024-01-15T10:00:00Z',
        size: 2400000,
      };

      const updated = updateMetaFiles(meta, { pdf: pdfInfo });

      expect(updated.files.pdf).toEqual(pdfInfo);
      expect(updated.files.xml).toBeUndefined();
      expect(updated.files.markdown).toBeUndefined();
    });

    it('should preserve existing files when adding new ones', () => {
      const meta: FulltextMeta = {
        ...createMeta({
          citationKey: 'smith2024',
          uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Test',
        }),
        files: {
          pdf: {
            filename: 'fulltext.pdf',
            source: 'pmc',
            retrievedAt: '2024-01-15T10:00:00Z',
          },
        },
      };

      const mdInfo: FileInfo = {
        filename: 'fulltext.md',
        source: 'pmc',
        retrievedAt: '2024-01-15T11:00:00Z',
        convertedFrom: 'fulltext.xml',
      };

      const updated = updateMetaFiles(meta, { markdown: mdInfo });

      expect(updated.files.pdf).toBeDefined();
      expect(updated.files.markdown).toEqual(mdInfo);
    });
  });
});
