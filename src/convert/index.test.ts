import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertPmcXmlToMarkdown } from './index.js';

/** efetch-wrapped XML with entities and element-citation */
const EFETCH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<pmc-articleset>
  <article>
    <front>
      <article-meta>
        <article-id pub-id-type="doi">10.5678/efetch-test</article-id>
        <article-id pub-id-type="pmc">9876543</article-id>
        <title-group>
          <article-title>The patient&#8217;s &#8216;smart&#8217; approach &#8212; revisited</article-title>
        </title-group>
        <contrib-group>
          <contrib contrib-type="author">
            <name><surname>O&#8217;Brien</surname><given-names>Jane</given-names></name>
          </contrib>
        </contrib-group>
        <abstract><p>This study&#8217;s findings &#8211; significant.</p></abstract>
      </article-meta>
    </front>
    <body>
      <sec>
        <title>Introduction</title>
        <p>The patient&#8217;s recovery was &#8212; remarkable.</p>
      </sec>
    </body>
    <back>
      <ref-list>
        <ref id="CR1">
          <label>1</label>
          <element-citation publication-type="journal-article">
            <person-group>
              <name><surname>Smith</surname><given-names>J</given-names></name>
              <name><surname>Jones</surname><given-names>AB</given-names></name>
            </person-group>
            <article-title>Near-peer teaching</article-title>
            <source>Educ Health</source>
            <year>2021</year>
            <volume>34</volume>
            <fpage>29</fpage>
            <lpage>35</lpage>
          </element-citation>
        </ref>
      </ref-list>
    </back>
  </article>
</pmc-articleset>`;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <article-id pub-id-type="doi">10.1234/example</article-id>
      <article-id pub-id-type="pmc">1234567</article-id>
      <title-group>
        <article-title>Machine Learning in Healthcare</article-title>
      </title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Smith</surname><given-names>John</given-names></name>
        </contrib>
        <contrib contrib-type="author">
          <name><surname>Jones</surname><given-names>Alice</given-names></name>
        </contrib>
      </contrib-group>
      <abstract><p>This study examines ML applications.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>Machine learning has been widely adopted.</p>
    </sec>
    <sec>
      <title>Methods</title>
      <p>We conducted a systematic review.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1">
        <mixed-citation>Smith J. Previous work. Journal. 2023.</mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>`;

describe('convertPmcXmlToMarkdown', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'convert-test-'));
    await mkdir(join(tmpDir, 'article'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('converts XML file to Markdown end-to-end', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    const md = await readFile(mdPath, 'utf-8');
    expect(md).toContain('# Machine Learning in Healthcare');
    expect(md).toContain('**Authors**: Smith J, Jones A');
    expect(md).toContain('**DOI**: 10.1234/example');
    expect(md).toContain('## Introduction');
    expect(md).toContain('## Methods');
    expect(md).toContain('## References');
  });

  it('handles malformed XML gracefully', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, '<article><invalid><broken', 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('updates meta.json with conversion info', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    const metaPath = join(tmpDir, 'article', 'meta.json');

    // Create a minimal meta.json
    const meta = {
      dirName: 'smith2024-a1b2c3d4',
      citationKey: 'smith2024',
      uuid: 'a1b2c3d4-test',
      title: 'Test',
      oaStatus: 'unchecked',
      files: {
        xml: {
          filename: 'fulltext.xml',
          source: 'pmc',
          retrievedAt: '2024-01-01T00:00:00.000Z',
        },
      },
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath, metaPath);

    expect(result.success).toBe(true);

    const updatedMeta = JSON.parse(await readFile(metaPath, 'utf-8'));
    expect(updatedMeta.files.markdown).toBeDefined();
    expect(updatedMeta.files.markdown.filename).toBe('fulltext.md');
    expect(updatedMeta.files.markdown.source).toBe('conversion');
    expect(updatedMeta.files.markdown.convertedFrom).toBe('fulltext.xml');
  });

  it('returns metadata about the converted document', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.title).toBe('Machine Learning in Healthcare');
      expect(result.sections).toBe(2);
      expect(result.references).toBe(1);
    }
  });

  it('E2E: headerless table produces valid Markdown with empty header row', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <title-group><article-title>Test</article-title></title-group>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Results</title>
      <table-wrap>
        <label>Table 1</label>
        <caption><p>Summary data</p></caption>
        <table>
          <tbody>
            <tr><td>Item A</td><td>10</td><td>Yes</td></tr>
            <tr><td>Item B</td><td>20</td><td>No</td></tr>
          </tbody>
        </table>
      </table-wrap>
    </sec>
  </body>
</article>`;
    await writeFile(xmlPath, xml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);

    const md = await readFile(mdPath, 'utf-8');
    // Verify valid Markdown table with empty header row and separator
    expect(md).toContain('|  |  |  |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('| Item A | 10 | Yes |');
    expect(md).toContain('| Item B | 20 | No |');
    expect(md).toContain('*Table 1. Summary data*');
  });

  it('E2E: handles efetch XML with entities, element-citation, and pmc-articleset wrapper', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, EFETCH_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sections).toBe(1);
      expect(result.references).toBe(1);
    }

    const md = await readFile(mdPath, 'utf-8');

    // Verify pmc-articleset wrapper handled: metadata extracted
    expect(md).toContain('**PMC**: PMC9876543');
    expect(md).toContain('**DOI**: 10.5678/efetch-test');

    // Verify HTML entities decoded (no raw &#NNNN; sequences)
    expect(md).not.toMatch(/&#\d+;/);
    expect(md).toContain('\u2019'); // right single quote (from &#8217;)
    expect(md).toContain('\u2014'); // em dash (from &#8212;)

    // Verify title has decoded entities
    expect(md).toContain('# The patient\u2019s \u2018smart\u2019 approach \u2014 revisited');

    // Verify body text has decoded entities
    expect(md).toContain('The patient\u2019s recovery was \u2014 remarkable.');

    // Verify element-citation formatted with proper spacing
    expect(md).toContain('Smith J, Jones AB. Near-peer teaching. Educ Health. 2021;34:29-35.');

    // Verify label number not duplicated in reference
    expect(md).not.toMatch(/^\d+\.\s+1\b/m);
  });
});
