/**
 * Citation key generation for fulltext directories.
 */

import anyAscii from 'any-ascii';
import { randomUUID } from 'node:crypto';

/**
 * Generate a collision suffix: a, b, ..., z, aa, ab, ...
 */
function collisionSuffix(index: number): string {
  let result = '';
  let n = index;
  do {
    result = String.fromCodePoint(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/** CJK Unified Ideographs range: U+4E00–U+9FFF */
const CJK_REGEX = /[\u4e00-\u9fff]/;

/**
 * Extract the family name portion from an author string.
 * Handles formats like "Smith, J." → "Smith", "Smith" → "Smith".
 */
function extractFamilyName(author: string): string {
  const commaIndex = author.indexOf(',');
  if (commaIndex >= 0) {
    return author.slice(0, commaIndex).trim();
  }
  return author.trim();
}

/**
 * Generate a citation key from author and year.
 * Format: {family-name-lowercase}{year}
 * With collision handling via letter suffixes (a, b, c, ...).
 */
export function generateCitationKey(
  author: string | undefined,
  year: string | undefined,
  existingKeys?: string[],
): string {
  // Extract and normalize author
  const rawFamily = author?.trim() ? extractFamilyName(author) : 'unknown';

  // CJK characters cannot be accurately transliterated to the correct reading
  // (any-ascii maps them to Chinese pinyin, not Japanese romaji etc.)
  // Fall back to 'unknown' for names containing CJK ideographs.
  const normalizedFamily = CJK_REGEX.test(rawFamily)
    ? 'unknown'
    : anyAscii(rawFamily).toLowerCase().replace(/[^a-z]/g, '') || 'unknown';

  // Normalize year
  const normalizedYear = year?.trim() || '0000';

  const baseKey = `${normalizedFamily}${normalizedYear}`;

  // Handle collisions
  if (!existingKeys || !existingKeys.includes(baseKey)) {
    return baseKey;
  }

  // Find the first available suffix
  for (let i = 0; ; i++) {
    const candidateKey = `${baseKey}${collisionSuffix(i)}`;
    if (!existingKeys.includes(candidateKey)) {
      return candidateKey;
    }
  }
}

/**
 * Generate a directory name from a citation key.
 * Format: {citationKey}-{uuid8}
 */
export function generateDirName(citationKey: string, uuid?: string): string {
  const id = uuid ?? randomUUID();
  const uuid8 = id.slice(0, 8);
  return `${citationKey}-${uuid8}`;
}
