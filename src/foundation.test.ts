import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateCitationKey, generateDirName } from "./citation-key.js";
import { createMeta, loadMeta, saveMeta, updateMetaFiles } from "./meta.js";
import { getArticleDir, getFulltextDir, getMetaPath, getReadmePath } from "./paths.js";
import { generateReadme } from "./readme.js";

describe("Fulltext Foundation Integration", () => {
  let sessionDir: string;

  beforeEach(async () => {
    sessionDir = join(tmpdir(), `search-hub-integration-${Date.now()}-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(sessionDir, { recursive: true, force: true });
  });

  it("should create article directory with meta.json and README.md", async () => {
    // 1. Generate citation key and directory name
    const citationKey = generateCitationKey("Smith, J.", "2024");
    expect(citationKey).toBe("smith2024");

    const uuid = randomUUID();
    const dirName = generateDirName(citationKey, uuid);
    expect(dirName).toMatch(/^smith2024-[a-f0-9]{8}$/);

    // 2. Resolve paths
    const articleDir = getArticleDir(sessionDir, dirName);
    const metaPath = getMetaPath(sessionDir, dirName);
    const readmePath = getReadmePath(sessionDir, dirName);

    // 3. Create directory structure
    await mkdir(articleDir, { recursive: true });

    // 4. Create and save meta.json
    const meta = createMeta({
      citationKey,
      uuid,
      title: "A Systematic Review of Machine Learning",
      doi: "10.1234/test.2024",
      pmid: "12345678",
      authors: "Smith, J.; Jones, A.",
      year: "2024",
    });
    expect(meta.dirName).toBe(dirName);
    expect(meta.oaStatus).toBe("unchecked");
    expect(meta.files).toEqual({});

    await saveMeta(metaPath, meta);

    // 5. Generate and save README
    const readmeContent = generateReadme(meta);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(readmePath, readmeContent, "utf-8");

    // 6. Verify files exist and are valid
    const loadedMeta = await loadMeta(metaPath);
    expect(loadedMeta.citationKey).toBe("smith2024");
    expect(loadedMeta.doi).toBe("10.1234/test.2024");

    const readmeOnDisk = await readFile(readmePath, "utf-8");
    expect(readmeOnDisk).toContain("# smith2024");
    expect(readmeOnDisk).toContain("10.1234/test.2024");
  });

  it("should update meta with file info", async () => {
    // 1. Set up article directory
    const uuid = "cccccccc-9999-aaaa-bbbb-cccccccccccc";
    const citationKey = generateCitationKey("Jones, A.", "2023");
    const dirName = generateDirName(citationKey, uuid);
    const articleDir = getArticleDir(sessionDir, dirName);
    const metaPath = getMetaPath(sessionDir, dirName);

    await mkdir(articleDir, { recursive: true });

    // 2. Create initial meta (no files)
    const meta = createMeta({
      citationKey,
      uuid,
      title: "Deep Learning for NLP",
      doi: "10.9876/nlp.2023",
      authors: "Jones, A.",
      year: "2023",
    });
    await saveMeta(metaPath, meta);

    // 3. Simulate adding a PDF file — update meta
    const updatedMeta = updateMetaFiles(meta, {
      pdf: {
        filename: "fulltext.pdf",
        source: "pmc",
        retrievedAt: new Date().toISOString(),
        size: 1024000,
      },
    });
    expect(updatedMeta.files.pdf).toBeDefined();
    expect(updatedMeta.files.pdf?.filename).toBe("fulltext.pdf");
    expect(updatedMeta.files.pdf?.size).toBe(1024000);

    // Save updated meta
    await saveMeta(metaPath, updatedMeta);

    // 4. Verify updates persisted
    const loadedMeta = await loadMeta(metaPath);
    expect(loadedMeta.files.pdf?.source).toBe("pmc");
  });

  it("should handle full workflow from key generation to file persistence", async () => {
    // End-to-end: simulate creating an article directory for a real use case
    const fulltextDir = getFulltextDir(sessionDir);
    await mkdir(fulltextDir, { recursive: true });

    // Add multiple articles
    const articles = [
      { author: "Müller, K.", year: "2024", doi: "10.1000/a", title: "German Study" },
      { author: "田中", year: "2023", doi: "10.2000/b", title: "Japanese Study" },
      { author: undefined, year: undefined, doi: "10.3000/c", title: "Unknown Article" },
    ];

    const existingKeys: string[] = [];
    const createdDirNames: string[] = [];

    for (const article of articles) {
      const citationKey = generateCitationKey(article.author, article.year, existingKeys);
      existingKeys.push(citationKey);

      const uuid = randomUUID();
      const dirName = generateDirName(citationKey, uuid);
      createdDirNames.push(dirName);
      const articleDir = getArticleDir(sessionDir, dirName);

      // Create directory and files
      await mkdir(articleDir, { recursive: true });

      const meta = createMeta({
        citationKey,
        uuid,
        title: article.title,
        doi: article.doi,
      });
      await saveMeta(getMetaPath(sessionDir, dirName), meta);

      const readme = generateReadme(meta);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(getReadmePath(sessionDir, dirName), readme, "utf-8");
    }

    // Verify citation keys include transliterated names
    expect(existingKeys).toContain("muller2024");
    expect(existingKeys).toContain("unknown2023");
    expect(existingKeys).toContain("unknown0000");

    // Verify files on disk
    for (const dirName of createdDirNames) {
      const metaPath = getMetaPath(sessionDir, dirName);
      const metaStat = await stat(metaPath);
      expect(metaStat.isFile()).toBe(true);

      const readmePath = getReadmePath(sessionDir, dirName);
      const readmeStat = await stat(readmePath);
      expect(readmeStat.isFile()).toBe(true);
    }
  });
});
