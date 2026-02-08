import { describe, it, expect } from 'vitest';
import { writeMarkdown } from './markdown-writer.js';
import type { JatsDocument } from './types.js';

function makeDoc(overrides: Partial<JatsDocument> = {}): JatsDocument {
  return {
    metadata: {
      title: 'Test Article',
      authors: [],
      ...overrides.metadata,
    },
    sections: overrides.sections ?? [],
    references: overrides.references ?? [],
    ...(overrides.acknowledgments != null ? { acknowledgments: overrides.acknowledgments } : {}),
    ...(overrides.appendices != null ? { appendices: overrides.appendices } : {}),
    ...(overrides.footnotes != null ? { footnotes: overrides.footnotes } : {}),
    ...(overrides.floats != null ? { floats: overrides.floats } : {}),
    ...(overrides.notes != null ? { notes: overrides.notes } : {}),
  };
}

describe('writeMarkdown', () => {
  it('generates Markdown header with metadata', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Machine Learning in Healthcare',
        authors: [
          { surname: 'Smith', givenNames: 'John' },
          { surname: 'Jones', givenNames: 'Alice' },
        ],
        doi: '10.1234/example',
        pmcid: '1234567',
        pmid: '38654321',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('# Machine Learning in Healthcare');
    expect(md).toContain('**Authors**: Smith J, Jones A');
    expect(md).toContain('**DOI**: 10.1234/example');
    expect(md).toContain('**PMC**: PMC1234567');
    expect(md).toContain('**PMID**: 38654321');
  });

  it('renders publication date with zero-padded month and day', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        publicationDate: { year: '2024', month: '3', day: '5' },
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Published**: 2024-03-05');
  });

  it('renders publication date with year-month only', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        publicationDate: { year: '2024', month: '11' },
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Published**: 2024-11');
  });

  it('renders citation with volume, issue, and pages', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        volume: '10',
        issue: '2',
        pages: '100-110',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Citation**: Vol. 10(2), pp. 100-110');
  });

  it('renders citation with volume and elocation-id only', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        volume: '89',
        pages: 'e102945',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Citation**: Vol. 89, pp. e102945');
  });

  it('renders keywords list', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        keywords: ['systematic review', 'meta-analysis', 'deep learning'],
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Keywords**: systematic review, meta-analysis, deep learning');
  });

  it('converts sections to ## headings', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Introduction',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Intro text.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Introduction');
    expect(md).toContain('Intro text.');
  });

  it('converts nested sections to ### headings', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [],
          subsections: [
            {
              title: 'Participants',
              level: 3,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Details.' }] },
              ],
              subsections: [],
            },
          ],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Methods');
    expect(md).toContain('### Participants');
    expect(md).toContain('Details.');
  });

  it('converts paragraphs with proper spacing', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('First paragraph.\n\nSecond paragraph.');
  });

  it('converts tables to Markdown tables', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Data',
          level: 2,
          content: [
            {
              type: 'table',
              caption: 'Table 1. Results',
              headers: ['Name', 'Value'],
              rows: [
                ['A', '1'],
                ['B', '2'],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('*Table 1. Results*');
    expect(md).toContain('| Name | Value |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| A | 1 |');
    expect(md).toContain('| B | 2 |');
  });

  it('renders headerless table with empty header row and separator', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Data',
          level: 2,
          content: [
            {
              type: 'table',
              headers: [],
              rows: [
                ['A', '1'],
                ['B', '2'],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    // Should have empty header row, separator, and data rows
    expect(md).toContain('|  |  |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| A | 1 |');
    expect(md).toContain('| B | 2 |');
  });

  it('renders headerless table with caption', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Data',
          level: 2,
          content: [
            {
              type: 'table',
              caption: 'Table 1. No headers',
              headers: [],
              rows: [
                ['X', 'Y', 'Z'],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('*Table 1. No headers*');
    expect(md).toContain('|  |  |  |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('| X | Y | Z |');
  });

  it('converts blockquotes to > prefixed lines', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Interview',
          level: 2,
          content: [
            {
              type: 'blockquote',
              content: [{ type: 'text', text: 'This is a quoted passage.' }],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> This is a quoted passage.');
  });

  it('converts multi-paragraph blockquotes with > prefix on each paragraph', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Interview',
          level: 2,
          content: [
            {
              type: 'blockquote',
              content: [
                { type: 'text', text: 'First paragraph.' },
                { type: 'text', text: '\n\n' },
                { type: 'text', text: 'Second paragraph.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> First paragraph.');
    expect(md).toContain('> Second paragraph.');
  });

  it('converts figures with caption in alt text position', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'figure', label: 'Figure 1', caption: 'Score distribution' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('![Figure 1. Score distribution]()');
  });

  it('converts figures without caption using label only', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'figure', label: 'Figure 2' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('![Figure 2]()');
  });

  it('converts lists (ordered and unordered)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Steps',
          level: 2,
          content: [
            {
              type: 'list',
              ordered: false,
              items: [
                [{ type: 'text', text: 'Item one' }],
                [{ type: 'text', text: 'Item two' }],
              ],
            },
            {
              type: 'list',
              ordered: true,
              items: [
                [{ type: 'text', text: 'First step' }],
                [{ type: 'text', text: 'Second step' }],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('- Item one');
    expect(md).toContain('- Item two');
    expect(md).toContain('1. First step');
    expect(md).toContain('2. Second step');
  });

  it('preserves inline formatting (bold, italic)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Text',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Normal ' },
                { type: 'bold', children: [{ type: 'text', text: 'bold' }] },
                { type: 'text', text: ' and ' },
                { type: 'italic', children: [{ type: 'text', text: 'italic' }] },
                { type: 'text', text: ' and ' },
                { type: 'superscript', text: '2' },
                { type: 'text', text: ' end.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Normal **bold** and *italic* and ^2^ end.');
  });

  it('renders inline-formula with TeX as $...$', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'where ' },
                { type: 'inline-formula', tex: 'p < 0.05', text: 'p < 0.05' },
                { type: 'text', text: ' was significant' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('where $p < 0.05$ was significant');
  });

  it('renders inline-formula without TeX as plain text', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'ratio ' },
                { type: 'inline-formula', text: 'r = 2.5' },
                { type: 'text', text: ' observed' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('ratio r = 2.5 observed');
  });

  it('renders code as backtick-quoted text', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Run the ' },
                { type: 'code', text: 'install.sh' },
                { type: 'text', text: ' script.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Run the `install.sh` script.');
  });

  it('renders link as Markdown link [text](url)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Visit ' },
                { type: 'link', url: 'https://example.com/tool', children: [{ type: 'text', text: 'our tool' }] },
                { type: 'text', text: ' for details.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Visit [our tool](https://example.com/tool) for details.');
  });

  it('renders link as bare URL when display text equals URL', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Available at ' },
                { type: 'link', url: 'https://www.r-project.org/', children: [{ type: 'text', text: 'https://www.r-project.org/' }] },
                { type: 'text', text: '.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Available at https://www.r-project.org/.');
  });

  it('generates references section', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.' },
        { id: 'ref2', text: 'Jones A. Another. Nature. 2023.' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## References');
    expect(md).toContain('1. Smith J. Title. Journal. 2024.');
    expect(md).toContain('2. Jones A. Another. Nature. 2023.');
  });

  it('renders reference DOI as clickable link', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.', doi: '10.1234/test' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('[doi:10.1234/test](https://doi.org/10.1234/test)');
  });

  it('renders reference PMID as clickable link', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.', pmid: '12345678' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('[pmid:12345678](https://pubmed.ncbi.nlm.nih.gov/12345678/)');
  });

  it('renders reference PMCID as clickable link', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.', pmcid: '9876543' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('[pmcid:PMC9876543](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9876543/)');
  });

  it('renders multiple pub-ids on the same reference', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.', doi: '10.1234/test', pmid: '12345', pmcid: '9876543' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('[doi:10.1234/test](https://doi.org/10.1234/test)');
    expect(md).toContain('[pmid:12345](https://pubmed.ncbi.nlm.nih.gov/12345/)');
    expect(md).toContain('[pmcid:PMC9876543](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9876543/)');
  });

  it('does not render pub-id links when none are present', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('1. Smith J. Title. Journal. 2024.');
    expect(md).not.toContain('[doi:');
    expect(md).not.toContain('[pmid:');
    expect(md).not.toContain('[pmcid:');
  });

  it('includes abstract from metadata', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        abstract: 'This is the abstract.',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Abstract');
    expect(md).toContain('This is the abstract.');
  });

  it('handles empty document gracefully', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).toContain('# Test Article');
    expect(typeof md).toBe('string');
  });

  it('renders blockquote among paragraphs and tables', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Discussion',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Opening statement.' }] },
            {
              type: 'blockquote',
              content: [
                { type: 'text', text: 'A notable ' },
                { type: 'italic', children: [{ type: 'text', text: 'finding' }] },
                { type: 'text', text: ' from the study.' },
              ],
            },
            {
              type: 'table',
              headers: ['Metric', 'Value'],
              rows: [['Accuracy', '95%']],
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'Closing statement.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Opening statement.');
    expect(md).toContain('> A notable *finding* from the study.');
    expect(md).toContain('| Metric | Value |');
    expect(md).toContain('Closing statement.');
  });

  it('skips heading line when section title is empty', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Content without heading.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Content without heading.');
    expect(md).not.toMatch(/^## $/m);
    expect(md).not.toContain('## \n');
  });

  it('skips heading line when section title is whitespace-only', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '   ',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Content here.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Content here.');
    expect(md).not.toMatch(/^##\s+$/m);
  });

  it('renders section with empty title but with subsections', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '',
          level: 2,
          content: [],
          subsections: [
            {
              title: 'Named Subsection',
              level: 3,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Sub content.' }] },
              ],
              subsections: [],
            },
          ],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('### Named Subsection');
    expect(md).toContain('Sub content.');
    expect(md).not.toMatch(/^## $/m);
  });

  it('renders boxed-text as blockquote with bold title', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            {
              type: 'boxed-text',
              title: 'Key Points',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Point 1: Important finding.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Point 2: Another finding.' }] },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> **Key Points**');
    expect(md).toContain('> Point 1: Important finding.');
    expect(md).toContain('> Point 2: Another finding.');
  });

  it('renders def-list as definition-style list', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Glossary',
          level: 2,
          content: [
            {
              type: 'def-list',
              title: 'Abbreviations',
              items: [
                { term: 'RCT', definition: 'Randomized controlled trial' },
                { term: 'CI', definition: 'Confidence interval' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**Abbreviations**');
    expect(md).toContain('**RCT**: Randomized controlled trial');
    expect(md).toContain('**CI**: Confidence interval');
  });

  it('renders def-list without title', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Terms',
          level: 2,
          content: [
            {
              type: 'def-list',
              items: [
                { term: 'API', definition: 'Application Programming Interface' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('**API**: Application Programming Interface');
    expect(md).not.toMatch(/^\*\*[A-Z].*\*\*\n\n\*\*/m); // No title line
  });

  it('renders formula with TeX as LaTeX block', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Equations',
          level: 2,
          content: [
            { type: 'formula', id: 'eq1', label: '(1)', tex: 'E = mc^2' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('$$E = mc^2$$');
    expect(md).toContain('(1)');
  });

  it('renders formula with text fallback', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Equations',
          level: 2,
          content: [
            { type: 'formula', label: '(2)', text: 'x = y + z' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('x = y + z');
    expect(md).toContain('(2)');
  });

  it('renders preformat as fenced code block', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Code',
          level: 2,
          content: [
            { type: 'preformat', text: 'function hello() {\n  return "world";\n}' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('```\nfunction hello() {\n  return "world";\n}\n```');
  });

  it('renders boxed-text without title', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            {
              type: 'boxed-text',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Some boxed content.' }] },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> Some boxed content.');
    expect(md).not.toContain('> **');
  });

  it('E2E: renders document with table, figure, and empty section correctly', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'See table and figure below.' }] },
            {
              type: 'table',
              caption: 'Table 1. Interview guide',
              headers: ['Topic', 'Prompts'],
              rows: [
                ['Introduction<br>Explain purpose.', 'Welcome participant.'],
              ],
            },
            { type: 'figure', label: 'Fig. 1', caption: 'Score distribution across groups' },
          ],
          subsections: [],
        },
        {
          title: '',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Supplementary material.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    // Table renders correctly with <br> in cells
    expect(md).toContain('| Introduction<br>Explain purpose. | Welcome participant. |');
    // Figure caption is in alt text position
    expect(md).toContain('![Fig. 1. Score distribution across groups]()');
    // Empty section title is skipped
    expect(md).not.toMatch(/^## $/m);
    expect(md).toContain('Supplementary material.');
  });
});

describe('writeMarkdown - acknowledgments', () => {
  it('renders acknowledgments section before References', () => {
    const doc = makeDoc({
      acknowledgments: 'We thank Dr. Smith for assistance.',
      references: [{ id: 'ref1', text: 'Smith J. Title. 2024.' }],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Acknowledgments');
    expect(md).toContain('We thank Dr. Smith for assistance.');
    const ackPos = md.indexOf('## Acknowledgments');
    const refPos = md.indexOf('## References');
    expect(ackPos).toBeLessThan(refPos);
  });

  it('does not render acknowledgments section when absent', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).not.toContain('## Acknowledgments');
  });
});

describe('writeMarkdown - appendices', () => {
  it('renders appendices after References', () => {
    const doc = makeDoc({
      references: [{ id: 'ref1', text: 'Smith J. Title. 2024.' }],
      appendices: [
        {
          title: 'Appendix A: Search Strategy',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Search details here.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Appendix A: Search Strategy');
    expect(md).toContain('Search details here.');
    const refPos = md.indexOf('## References');
    const appPos = md.indexOf('## Appendix A');
    expect(appPos).toBeGreaterThan(refPos);
  });

  it('does not render appendices section when absent', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).not.toContain('Appendix');
  });
});

describe('writeMarkdown - footnotes', () => {
  it('renders footnotes as numbered list at end of document', () => {
    const doc = makeDoc({
      footnotes: [
        { id: 'fn1', text: 'First footnote.' },
        { id: 'fn2', text: 'Second footnote.' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Footnotes');
    expect(md).toContain('1. First footnote.');
    expect(md).toContain('2. Second footnote.');
  });

  it('does not render footnotes section when absent', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).not.toContain('## Footnotes');
  });
});

describe('writeMarkdown - floats', () => {
  it('renders floats as Figures and Tables section', () => {
    const doc = makeDoc({
      floats: [
        { type: 'figure', id: 'fig1', label: 'Figure 1', caption: 'Study flow' },
        { type: 'table', caption: 'Table 1. Demographics', headers: ['Age', 'N'], rows: [['30', '50']] },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Figures and Tables');
    expect(md).toContain('![Figure 1. Study flow]()');
    expect(md).toContain('| Age | N |');
  });

  it('does not render floats section when absent', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).not.toContain('## Figures and Tables');
  });
});

describe('writeMarkdown - notes', () => {
  it('renders notes sections between Acknowledgments and References', () => {
    const doc = makeDoc({
      acknowledgments: 'We thank Dr. Smith.',
      references: [{ id: 'ref1', text: 'Smith J. Title. 2024.' }],
      notes: [
        { title: 'Author contributions', text: 'TK designed the study.' },
        { title: 'Funding', text: 'NIH grant R01.' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Author contributions');
    expect(md).toContain('TK designed the study.');
    expect(md).toContain('## Funding');
    expect(md).toContain('NIH grant R01.');
    // Position: after Acknowledgments, before References
    const ackPos = md.indexOf('## Acknowledgments');
    const notesPos = md.indexOf('## Author contributions');
    const refPos = md.indexOf('## References');
    expect(notesPos).toBeGreaterThan(ackPos);
    expect(notesPos).toBeLessThan(refPos);
  });

  it('renders notes before References when no Acknowledgments', () => {
    const doc = makeDoc({
      references: [{ id: 'ref1', text: 'Smith J. Title. 2024.' }],
      notes: [{ title: 'Data availability', text: 'Available on request.' }],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Data availability');
    const notesPos = md.indexOf('## Data availability');
    const refPos = md.indexOf('## References');
    expect(notesPos).toBeLessThan(refPos);
  });

  it('does not render notes section when absent', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).not.toContain('## Author contributions');
    expect(md).not.toContain('## Funding');
  });
});

describe('writeMarkdown - glossary (as notes)', () => {
  it('renders glossary abbreviations section with term-definition pairs', () => {
    const doc = makeDoc({
      notes: [
        {
          title: 'Abbreviations',
          text: 'PGY1: a post-graduate year 1 resident\nPGY2: a post-graduate year 2 resident',
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Abbreviations');
    expect(md).toContain('PGY1: a post-graduate year 1 resident');
    expect(md).toContain('PGY2: a post-graduate year 2 resident');
  });

  it('renders glossary after other notes', () => {
    const doc = makeDoc({
      notes: [
        { title: 'Author contributions', text: 'TK designed the study.' },
        {
          title: 'Abbreviations',
          text: 'PGY1: a post-graduate year 1 resident',
        },
      ],
    });
    const md = writeMarkdown(doc);
    const contribPos = md.indexOf('## Author contributions');
    const abbrPos = md.indexOf('## Abbreviations');
    expect(contribPos).toBeLessThan(abbrPos);
  });
});
