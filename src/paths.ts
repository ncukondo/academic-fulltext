/**
 * Path resolution utilities for fulltext directories.
 */

import { join } from 'node:path';

/** Get the fulltext root directory for a session. */
export function getFulltextDir(sessionDir: string): string {
  return join(sessionDir, 'fulltext');
}

/** Get an article's fulltext directory. */
export function getArticleDir(sessionDir: string, dirName: string): string {
  return join(sessionDir, 'fulltext', dirName);
}

/** Get the meta.json path for an article. */
export function getMetaPath(sessionDir: string, dirName: string): string {
  return join(sessionDir, 'fulltext', dirName, 'meta.json');
}

/** Get the README.md path for an article. */
export function getReadmePath(sessionDir: string, dirName: string): string {
  return join(sessionDir, 'fulltext', dirName, 'README.md');
}
