/**
 * Meta.json management for fulltext article directories.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { FulltextMeta, FileInfo } from './types.js';

export interface CreateMetaOptions {
  citationKey: string;
  uuid: string;
  title: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  authors?: string;
  year?: string;
}

/** Create a new FulltextMeta object. */
export function createMeta(options: CreateMetaOptions): FulltextMeta {
  const uuid8 = options.uuid.slice(0, 8);
  const meta: FulltextMeta = {
    dirName: `${options.citationKey}-${uuid8}`,
    citationKey: options.citationKey,
    uuid: options.uuid,
    title: options.title,
    oaStatus: 'unchecked',
    files: {},
  };

  if (options.doi !== undefined) meta.doi = options.doi;
  if (options.pmid !== undefined) meta.pmid = options.pmid;
  if (options.pmcid !== undefined) meta.pmcid = options.pmcid;
  if (options.arxivId !== undefined) meta.arxivId = options.arxivId;
  if (options.authors !== undefined) meta.authors = options.authors;
  if (options.year !== undefined) meta.year = options.year;

  return meta;
}

/** Load and parse a meta.json file. */
export async function loadMeta(path: string): Promise<FulltextMeta> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as FulltextMeta;
}

/** Save a FulltextMeta to a meta.json file with 2-space indentation. */
export async function saveMeta(path: string, meta: FulltextMeta): Promise<void> {
  const json = JSON.stringify(meta, null, 2);
  await writeFile(path, json + '\n', 'utf-8');
}

/** Update the files section of a FulltextMeta, preserving existing files. */
export function updateMetaFiles(
  meta: FulltextMeta,
  files: { pdf?: FileInfo; xml?: FileInfo; markdown?: FileInfo },
): FulltextMeta {
  return {
    ...meta,
    files: {
      ...meta.files,
      ...Object.fromEntries(
        Object.entries(files).filter(([, v]) => v !== undefined),
      ),
    },
  };
}
