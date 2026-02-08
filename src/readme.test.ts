import { describe, it, expect } from 'vitest';
import { generateReadme } from './readme.js';
import type { FulltextMeta } from './types.js';

describe('README Template Generation', () => {
  const baseMeta: FulltextMeta = {
    dirName: 'smith2024-a1b2c3d4',
    citationKey: 'smith2024',
    uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    title: 'Machine Learning in Healthcare: A Systematic Review',
    doi: '10.1234/example',
    pmid: '12345678',
    pmcid: 'PMC1234567',
    authors: 'Smith, J.; Jones, A.',
    year: '2024',
    oaStatus: 'unchecked',
    files: {},
  };

  it('should generate proper Markdown with citation key as heading', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('# smith2024');
  });

  it('should include title', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('**Title**: Machine Learning in Healthcare: A Systematic Review');
  });

  it('should include identifiers section', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('## Identifiers');
    expect(readme).toContain('- DOI: 10.1234/example');
    expect(readme).toContain('- PMID: 12345678');
    expect(readme).toContain('- PMC: PMC1234567');
  });

  it('should include download URLs for PMC', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('## Download URLs');
    expect(readme).toContain('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/pdf/');
  });

  it('should include instructions for manual download', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('## Instructions');
    expect(readme).toContain('fulltext.pdf');
    expect(readme).toContain('fulltext sync');
  });

  it('should omit missing identifiers', () => {
    const { pmid: _pmid, pmcid: _pmcid, ...rest } = baseMeta;
    const meta: FulltextMeta = rest;
    const readme = generateReadme(meta);
    expect(readme).not.toContain('PMID');
    expect(readme).not.toContain('PMC');
  });

  it('should include arXiv URL when arxivId is present', () => {
    const { pmcid: _pmcid, ...rest } = baseMeta;
    const meta: FulltextMeta = { ...rest, arxivId: '2401.12345' };
    const readme = generateReadme(meta);
    expect(readme).toContain('https://arxiv.org/pdf/2401.12345.pdf');
  });

  it('should include DOI URL when doi is present', () => {
    const readme = generateReadme(baseMeta);
    expect(readme).toContain('https://doi.org/10.1234/example');
  });
});
