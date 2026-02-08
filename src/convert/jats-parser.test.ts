import { describe, expect, it } from "vitest";
import {
  parseJatsBackMatter,
  parseJatsBody,
  parseJatsMetadata,
  parseJatsReferences,
  parseJatsTable,
} from "./jats-parser.js";

describe("parseJatsMetadata", () => {
  it("extracts title from <article-title>", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Machine Learning in Healthcare</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe("Machine Learning in Healthcare");
  });

  it("extracts authors from <contrib-group>", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <contrib-group>
              <contrib contrib-type="author">
                <name><surname>Smith</surname><given-names>John A.</given-names></name>
              </contrib>
              <contrib contrib-type="author">
                <name><surname>Jones</surname><given-names>Alice</given-names></name>
              </contrib>
            </contrib-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.authors).toEqual([
      { surname: "Smith", givenNames: "John A." },
      { surname: "Jones", givenNames: "Alice" },
    ]);
  });

  it('extracts DOI from <article-id pub-id-type="doi">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="doi">10.1234/example</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.doi).toBe("10.1234/example");
  });

  it('extracts PMCID from <article-id pub-id-type="pmc">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmc">1234567</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.pmcid).toBe("1234567");
  });

  it("extracts abstract from <abstract>", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <abstract><p>This is the abstract text.</p></abstract>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.abstract).toBe("This is the abstract text.");
  });

  it("handles structured abstract with multiple sections", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <abstract>
              <sec>
                <title>Background</title>
                <p>Background text.</p>
              </sec>
              <sec>
                <title>Methods</title>
                <p>Methods text.</p>
              </sec>
            </abstract>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.abstract).toContain("Background");
    expect(metadata.abstract).toContain("Background text.");
    expect(metadata.abstract).toContain("Methods");
    expect(metadata.abstract).toContain("Methods text.");
  });

  it('extracts PMCID from <article-id pub-id-type="pmcid"> stripping PMC prefix', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmcid">PMC11293181</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.pmcid).toBe("11293181");
  });

  it('extracts PMCID from <article-id pub-id-type="pmcid"> without PMC prefix', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmcid">11293181</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.pmcid).toBe("11293181");
  });

  it("extracts journal name from <journal-title-group>", () => {
    const xml = `
      <article>
        <front>
          <journal-meta>
            <journal-title-group>
              <journal-title>BMJ Open</journal-title>
            </journal-title-group>
          </journal-meta>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.journal).toBe("BMJ Open");
  });

  it("extracts journal name from <journal-title> directly under <journal-meta> (fallback)", () => {
    const xml = `
      <article>
        <front>
          <journal-meta>
            <journal-title>Nature Medicine</journal-title>
          </journal-meta>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.journal).toBe("Nature Medicine");
  });

  it('extracts publication date from <pub-date pub-type="epub">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <pub-date pub-type="epub"><year>2024</year><month>03</month><day>15</day></pub-date>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.publicationDate).toBeDefined();
    expect(metadata.publicationDate?.year).toBe("2024");
    expect(metadata.publicationDate?.month).toBeDefined();
    expect(metadata.publicationDate?.day).toBeDefined();
  });

  it("prefers epub over ppub over collection for publication date", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <pub-date pub-type="collection"><year>2023</year></pub-date>
            <pub-date pub-type="ppub"><year>2024</year><month>06</month></pub-date>
            <pub-date pub-type="epub"><year>2024</year><month>03</month><day>15</day></pub-date>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.publicationDate).toBeDefined();
    // epub should be preferred (year 2024, month 3, day 15)
    expect(metadata.publicationDate?.year).toBe("2024");
    expect(metadata.publicationDate?.day).toBeDefined();
  });

  it("supports JATS 1.2+ date-type attribute for publication date", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <pub-date date-type="pub" publication-format="electronic"><year>2024</year><month>05</month></pub-date>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.publicationDate).toBeDefined();
    expect(metadata.publicationDate?.year).toBe("2024");
    expect(metadata.publicationDate?.month).toBeDefined();
    expect(metadata.publicationDate?.day).toBeUndefined();
  });

  it("extracts volume, issue, and pages from article-meta", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <volume>10</volume>
            <issue>2</issue>
            <fpage>100</fpage>
            <lpage>110</lpage>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.volume).toBe("10");
    expect(metadata.issue).toBe("2");
    expect(metadata.pages).toBe("100-110");
  });

  it("extracts elocation-id as pages when no fpage/lpage", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <volume>89</volume>
            <elocation-id>e102945</elocation-id>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.volume).toBe("89");
    expect(metadata.pages).toBe("e102945");
  });

  it("extracts keywords from <kwd-group>", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <kwd-group>
              <kwd>systematic review</kwd>
              <kwd>meta-analysis</kwd>
            </kwd-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.keywords).toEqual(["systematic review", "meta-analysis"]);
  });

  it("merges keywords from multiple <kwd-group> elements", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <kwd-group kwd-group-type="author">
              <kwd>deep learning</kwd>
              <kwd>imaging</kwd>
            </kwd-group>
            <kwd-group kwd-group-type="MeSH">
              <kwd>Alzheimer Disease</kwd>
            </kwd-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.keywords).toEqual(["deep learning", "imaging", "Alzheimer Disease"]);
  });

  it("extracts article-type from root <article> element", () => {
    const xml = `
      <article article-type="research-article">
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.articleType).toBe("research-article");
  });

  it("extracts license from <permissions>/<license> using @xlink:href", () => {
    const xml = `
      <article xmlns:xlink="http://www.w3.org/1999/xlink">
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <permissions>
              <license xlink:href="https://creativecommons.org/licenses/by/4.0/">
                <license-p>This is an open access article distributed under the CC-BY license.</license-p>
              </license>
            </permissions>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.license).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("extracts license text from <license-p> when no @xlink:href", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
            <permissions>
              <license>
                <license-p>This is an open access article.</license-p>
              </license>
            </permissions>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.license).toBe("This is an open access article.");
  });

  it("handles missing optional fields gracefully", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Minimal Article</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe("Minimal Article");
    expect(metadata.authors).toEqual([]);
    expect(metadata.doi).toBeUndefined();
    expect(metadata.pmcid).toBeUndefined();
    expect(metadata.abstract).toBeUndefined();
  });

  it('extracts PMID from <article-id pub-id-type="pmid">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmid">12345678</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.pmid).toBe("12345678");
  });

  it("handles multiple article-id elements", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="doi">10.1234/example</article-id>
            <article-id pub-id-type="pmc">7654321</article-id>
            <article-id pub-id-type="pmid">12345678</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.doi).toBe("10.1234/example");
    expect(metadata.pmcid).toBe("7654321");
    expect(metadata.pmid).toBe("12345678");
  });

  it("skips non-author contributors", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <contrib-group>
              <contrib contrib-type="author">
                <name><surname>Smith</surname><given-names>John</given-names></name>
              </contrib>
              <contrib contrib-type="editor">
                <name><surname>Editor</surname><given-names>Jane</given-names></name>
              </contrib>
            </contrib-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.authors).toHaveLength(1);
    expect(metadata.authors[0]?.surname).toBe("Smith");
  });
});

describe("parseJatsBody", () => {
  it("extracts sections from <body><sec>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>Intro paragraph.</p>
          </sec>
          <sec>
            <title>Methods</title>
            <p>Methods paragraph.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe("Introduction");
    expect(sections[1]?.title).toBe("Methods");
    expect(sections[0]?.level).toBe(2);
  });

  it("handles nested sections (h2, h3, h4)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Methods</title>
            <p>Methods intro.</p>
            <sec>
              <title>Participants</title>
              <p>Participant details.</p>
              <sec>
                <title>Inclusion Criteria</title>
                <p>Criteria text.</p>
              </sec>
            </sec>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("Methods");
    expect(sections[0]?.level).toBe(2);
    expect(sections[0]?.subsections).toHaveLength(1);
    expect(sections[0]?.subsections[0]?.title).toBe("Participants");
    expect(sections[0]?.subsections[0]?.level).toBe(3);
    expect(sections[0]?.subsections[0]?.subsections[0]?.title).toBe("Inclusion Criteria");
    expect(sections[0]?.subsections[0]?.subsections[0]?.level).toBe(4);
  });

  it("extracts paragraphs <p>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections[0]?.content).toHaveLength(2);
    expect(sections[0]?.content[0]?.type).toBe("paragraph");
  });

  it("handles lists <list> as bullet/numbered lists", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Points</title>
            <list list-type="bullet">
              <list-item><p>Item one</p></list-item>
              <list-item><p>Item two</p></list-item>
            </list>
            <list list-type="order">
              <list-item><p>First step</p></list-item>
              <list-item><p>Second step</p></list-item>
            </list>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(2);

    const bulletList = content[0];
    if (!bulletList) throw new Error("expected bulletList");
    expect(bulletList.type).toBe("list");
    if (bulletList.type === "list") {
      expect(bulletList.ordered).toBe(false);
      expect(bulletList.items).toHaveLength(2);
    }

    const orderedList = content[1];
    if (!orderedList) throw new Error("expected orderedList");
    expect(orderedList.type).toBe("list");
    if (orderedList.type === "list") {
      expect(orderedList.ordered).toBe(true);
      expect(orderedList.items).toHaveLength(2);
    }
  });

  it("handles inline elements (bold, italic, superscript)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Formatting</title>
            <p>This has <bold>bold</bold> and <italic>italic</italic> and <sup>2</sup> text.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const types = para.content.map((c) => c.type);
      expect(types).toContain("text");
      expect(types).toContain("bold");
      expect(types).toContain("italic");
      expect(types).toContain("superscript");
    }
  });

  it("handles body with no sections (just paragraphs)", () => {
    const xml = `
      <article>
        <body>
          <p>Just a paragraph without sections.</p>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("");
    expect(sections[0]?.content).toHaveLength(1);
  });
});

describe("parseJatsTable", () => {
  it("converts <table-wrap> to table structure", () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th>Name</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>A</td><td>1</td></tr>
            <tr><td>B</td><td>2</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toEqual(["Name", "Value"]);
    expect(table.rows).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });

  it("handles <thead>, <tbody>, <tr>, <td>, <th>", () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th>Col1</th><th>Col2</th><th>Col3</th></tr>
          </thead>
          <tbody>
            <tr><td>a</td><td>b</td><td>c</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toHaveLength(3);
    expect(table.rows[0]).toHaveLength(3);
  });

  it("extracts table caption", () => {
    const xml = `
      <table-wrap>
        <label>Table 1</label>
        <caption><p>Demographic characteristics</p></caption>
        <table>
          <thead><tr><th>Age</th></tr></thead>
          <tbody><tr><td>25</td></tr></tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.caption).toContain("Table 1");
    expect(table.caption).toContain("Demographic characteristics");
  });

  it("handles table without thead (all rows)", () => {
    const xml = `
      <table-wrap>
        <table>
          <tbody>
            <tr><td>A</td><td>1</td></tr>
            <tr><td>B</td><td>2</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toEqual([]);
    expect(table.rows).toHaveLength(2);
  });

  it("handles tables in body sections", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>See the table below.</p>
            <table-wrap>
              <table>
                <thead><tr><th>Item</th><th>Count</th></tr></thead>
                <tbody><tr><td>X</td><td>10</td></tr></tbody>
              </table>
            </table-wrap>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(2);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("table");
    if (content[1]?.type === "table") {
      expect(content[1].headers).toEqual(["Item", "Count"]);
    }
  });
});

describe("parseJatsTable - multi-paragraph cells", () => {
  it("joins multiple <p> elements in <td> with <br> separator", () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th>Topic</th><th>Instructions</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><p>Introduction</p><p>Explain that this interview has nothing to do with evaluation.</p></td>
              <td><p>Simple cell</p></td>
            </tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.rows[0]?.[0]).toBe(
      "Introduction<br>Explain that this interview has nothing to do with evaluation."
    );
    expect(table.rows[0]?.[1]).toBe("Simple cell");
  });

  it("handles <th> with multiple <p> elements", () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th><p>Header Line 1</p><p>Header Line 2</p></th></tr>
          </thead>
          <tbody>
            <tr><td>data</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers[0]).toBe("Header Line 1<br>Header Line 2");
  });
});

describe("parseJatsBody - figures", () => {
  it("extracts <fig> with caption", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>See Figure 1.</p>
            <fig id="fig1">
              <label>Figure 1</label>
              <caption><p>Distribution of scores</p></caption>
            </fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(2);
    expect(content[1]?.type).toBe("figure");
    if (content[1]?.type === "figure") {
      expect(content[1].label).toBe("Figure 1");
      expect(content[1].caption).toBe("Distribution of scores");
    }
  });

  it("handles figure without caption", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <fig id="fig2">
              <label>Figure 2</label>
            </fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    const fig = content[0];
    if (!fig) throw new Error("expected fig");
    expect(fig.type).toBe("figure");
    if (fig.type === "figure") {
      expect(fig.label).toBe("Figure 2");
      expect(fig.caption).toBeUndefined();
    }
  });
});

describe("parseJatsBody - citations", () => {
  it('converts <xref ref-type="bibr"> to citation markers', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>As shown previously <xref ref-type="bibr" rid="ref1">[1]</xref>, the method works.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const citation = para.content.find((c) => c.type === "citation");
      expect(citation).toBeDefined();
      if (citation?.type === "citation") {
        expect(citation.refId).toBe("ref1");
        expect(citation.text).toBe("[1]");
      }
    }
  });
});

describe("parseJatsBody - preserveOrder inline interleaving", () => {
  it("preserves order of interleaved text and <xref> citations", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>The adage [<xref ref-type="bibr" rid="CR1">1</xref>]. Several studies
[<xref ref-type="bibr" rid="CR2">2</xref>,<xref ref-type="bibr" rid="CR3">3</xref>].</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const types = para.content.map((c) => c.type);
      // Must be interleaved: text, citation, text, citation, text, citation, text
      expect(types).toEqual(["text", "citation", "text", "citation", "text", "citation", "text"]);

      // Verify text positions
      expect(para.content[0]).toEqual({ type: "text", text: "The adage [" });
      expect(para.content[1]).toEqual({ type: "citation", refId: "CR1", text: "1" });
      expect(para.content[2]).toEqual({ type: "text", text: "]. Several studies\n[" });
      expect(para.content[3]).toEqual({ type: "citation", refId: "CR2", text: "2" });
      expect(para.content[4]).toEqual({ type: "text", text: "," });
      expect(para.content[5]).toEqual({ type: "citation", refId: "CR3", text: "3" });
      expect(para.content[6]).toEqual({ type: "text", text: "]." });
    }
  });

  it("preserves order of interleaved text and <italic> formatting", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Test</title>
            <p>this is the <italic>yanegawara</italic> system. Under the <italic>yanegawara</italic> system</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      expect(para.content).toEqual([
        { type: "text", text: "this is the " },
        { type: "italic", children: [{ type: "text", text: "yanegawara" }] },
        { type: "text", text: " system. Under the " },
        { type: "italic", children: [{ type: "text", text: "yanegawara" }] },
        { type: "text", text: " system" },
      ]);
    }
  });

  it("preserves block element ordering (p, list, table-wrap, fig)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>First paragraph.</p>
            <table-wrap>
              <table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
            </table-wrap>
            <p>Second paragraph.</p>
            <list list-type="bullet">
              <list-item><p>Item one</p></list-item>
            </list>
            <fig id="fig1"><label>Figure 1</label></fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content.map((b) => b.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
      "list",
      "figure",
    ]);
  });
});

describe("parseJatsBody - nested block elements in <p>", () => {
  it("extracts <table-wrap> nested inside <p> as separate blocks", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>See Table <xref ref-type="table" rid="Tab1">1</xref>.</p>
            <p><table-wrap id="Tab1">
              <label>Table 1</label>
              <caption><p>Demographics</p></caption>
              <table>
                <thead><tr><th>Age</th><th>Count</th></tr></thead>
                <tbody><tr><td>25</td><td>10</td></tr></tbody>
              </table>
            </table-wrap></p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    // First <p> is a normal paragraph, second <p> contains only table-wrap
    expect(content).toHaveLength(2);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("table");
    if (content[1]?.type === "table") {
      expect(content[1].headers).toEqual(["Age", "Count"]);
    }
  });

  it("extracts <fig> nested inside <p> as separate blocks", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p><fig id="fig1">
              <label>Figure 1</label>
              <caption><p>Score distribution</p></caption>
            </fig></p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("figure");
    if (content[0]?.type === "figure") {
      expect(content[0].label).toBe("Figure 1");
      expect(content[0].caption).toBe("Score distribution");
    }
  });

  it("splits <p> with inline text before and after nested <table-wrap>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>Before table. <table-wrap>
              <table><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
            </table-wrap> After table.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(3);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("table");
    expect(content[2]?.type).toBe("paragraph");
  });
});

describe("parseJatsBody - blockquotes", () => {
  it("parses <disp-quote> as blockquote block", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Interview</title>
            <disp-quote>
              <p>This is a quoted passage.</p>
            </disp-quote>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("blockquote");
    if (content[0]?.type === "blockquote") {
      const text = content[0].content.find((c) => c.type === "text");
      expect(text).toBeDefined();
    }
  });

  it("parses <disp-quote> with multiple <p> children", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Interview</title>
            <disp-quote>
              <p>First quoted paragraph.</p>
              <p>Second quoted paragraph.</p>
            </disp-quote>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("blockquote");
    if (content[0]?.type === "blockquote") {
      // Should contain inline content from both paragraphs
      const texts = content[0].content.filter((c) => c.type === "text");
      expect(texts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles <disp-quote> nested inside <p>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The participant said: <disp-quote><p>I felt relieved.</p></disp-quote></p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    // Should split: paragraph "The participant said: " + blockquote "I felt relieved."
    expect(content.length).toBe(2);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("blockquote");
  });

  it("preserves ordering with <disp-quote> among other blocks", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Discussion</title>
            <p>Introduction text.</p>
            <disp-quote>
              <p>A famous quote.</p>
            </disp-quote>
            <p>Conclusion text.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content.map((b) => b.type)).toEqual(["paragraph", "blockquote", "paragraph"]);
  });
});

describe("parseJatsBody - E2E block element integration", () => {
  it("parses PMC XML with <disp-quote> inside <p>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>Participant 1 stated:
              <disp-quote>
                <p>I think the <italic>intervention</italic> was very helpful.</p>
                <p>It changed my daily routine.</p>
              </disp-quote>
            </p>
            <p>This was consistent with other responses.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    // Should produce: paragraph (text before quote) + blockquote + paragraph (after)
    expect(content.length).toBe(3);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("blockquote");
    expect(content[2]?.type).toBe("paragraph");

    // Blockquote should preserve inline formatting
    if (content[1]?.type === "blockquote") {
      const hasItalic = content[1].content.some((c) => c.type === "italic");
      expect(hasItalic).toBe(true);
    }
  });

  it("parses PMC XML with <table-wrap> inside <p>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The demographics are shown below.
              <table-wrap id="Tab1">
                <label>Table 1</label>
                <caption><p>Participant demographics</p></caption>
                <table>
                  <thead><tr><th>Group</th><th>N</th><th>Mean Age</th></tr></thead>
                  <tbody>
                    <tr><td>Control</td><td>50</td><td>34.2</td></tr>
                    <tr><td>Intervention</td><td>48</td><td>35.1</td></tr>
                  </tbody>
                </table>
              </table-wrap>
            </p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content.length).toBe(2);
    expect(content[0]?.type).toBe("paragraph");
    expect(content[1]?.type).toBe("table");
    if (content[1]?.type === "table") {
      expect(content[1].headers).toEqual(["Group", "N", "Mean Age"]);
      expect(content[1].rows).toHaveLength(2);
      expect(content[1].caption).toContain("Table 1");
    }
  });

  it("handles complex section with mixed block elements", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Discussion</title>
            <p>First paragraph of discussion.</p>
            <disp-quote>
              <p>A relevant quote from the literature.</p>
            </disp-quote>
            <p>Following paragraph with a nested figure:
              <fig id="fig1">
                <label>Figure 1</label>
                <caption><p>Results overview</p></caption>
              </fig>
            </p>
            <p>Final paragraph.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content.map((b) => b.type)).toEqual([
      "paragraph",
      "blockquote",
      "paragraph",
      "figure",
      "paragraph",
    ]);
  });
});

describe("parseJatsReferences", () => {
  it("extracts <ref-list> references", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. Title of paper. Journal. 2024;1:1-10.</mixed-citation>
            </ref>
            <ref id="ref2">
              <mixed-citation>Jones A. Another paper. Nature. 2023;5:20-30.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.id).toBe("ref1");
    expect(refs[0]?.text).toContain("Smith J");
    expect(refs[1]?.id).toBe("ref2");
    expect(refs[1]?.text).toContain("Jones A");
  });

  it("handles empty ref-list", () => {
    const xml = `
      <article>
        <back>
          <ref-list></ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toEqual([]);
  });

  it("handles missing back section", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
          </article-meta>
        </front>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toEqual([]);
  });
});

describe("pmc-articleset wrapper handling", () => {
  it("extracts metadata from efetch-wrapped XML (pmc-articleset)", () => {
    const xml = `
      <pmc-articleset>
        <article>
          <front>
            <article-meta>
              <article-id pub-id-type="pmc">9876543</article-id>
              <article-id pub-id-type="doi">10.1234/test</article-id>
              <title-group>
                <article-title>Wrapped Article</article-title>
              </title-group>
            </article-meta>
          </front>
        </article>
      </pmc-articleset>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe("Wrapped Article");
    expect(metadata.pmcid).toBe("9876543");
    expect(metadata.doi).toBe("10.1234/test");
  });

  it("extracts body sections from efetch-wrapped XML", () => {
    const xml = `
      <pmc-articleset>
        <article>
          <body>
            <sec>
              <title>Introduction</title>
              <p>Some text.</p>
            </sec>
          </body>
        </article>
      </pmc-articleset>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("Introduction");
  });

  it("extracts references from efetch-wrapped XML", () => {
    const xml = `
      <pmc-articleset>
        <article>
          <back>
            <ref-list>
              <ref id="ref1">
                <mixed-citation>Smith J. A study. Nature. 2024.</mixed-citation>
              </ref>
            </ref-list>
          </back>
        </article>
      </pmc-articleset>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe("ref1");
  });

  it("still works with direct article XML (no wrapper)", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmc">1234567</article-id>
            <title-group>
              <article-title>Direct Article</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe("Direct Article");
    expect(metadata.pmcid).toBe("1234567");
  });
});

describe("parseJatsReferences - element-citation formatting", () => {
  it("formats element-citation with structured children and proper spacing", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <label>1</label>
              <element-citation publication-type="journal-article">
                <person-group><name><surname>Bowyer</surname><given-names>ER</given-names></name></person-group>
                <article-title>Informal near-peer teaching</article-title>
                <source>Educ Health</source>
                <year>2021</year>
                <volume>34</volume>
                <fpage>29</fpage>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe("CR1");
    // Should have proper spacing between elements
    expect(refs[0]?.text).toBe("Bowyer ER. Informal near-peer teaching. Educ Health. 2021;34:29.");
  });

  it("formats element-citation with multiple authors", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR2">
              <label>2</label>
              <element-citation publication-type="journal-article">
                <person-group>
                  <name><surname>Smith</surname><given-names>J</given-names></name>
                  <name><surname>Jones</surname><given-names>AB</given-names></name>
                </person-group>
                <article-title>Some title</article-title>
                <source>Nature</source>
                <year>2023</year>
                <volume>10</volume>
                <fpage>100</fpage>
                <lpage>110</lpage>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toBe("Smith J, Jones AB. Some title. Nature. 2023;10:100-110.");
  });

  it("does not duplicate label numbers in reference text", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <label>1</label>
              <element-citation publication-type="journal-article">
                <person-group><name><surname>Test</surname><given-names>A</given-names></name></person-group>
                <article-title>Title</article-title>
                <source>J Test</source>
                <year>2020</year>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    // Label "1" should not appear in the text
    expect(refs[0]?.text).not.toMatch(/^1/);
    expect(refs[0]?.text).toBe("Test A. Title. J Test. 2020.");
  });

  it("falls back to extractAllText when ref has no mixed-citation or element-citation, skipping label", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <label>1.</label>
              <nlm-citation>Smith J. Some paper. Journal. 2024;1:1-10.</nlm-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe("ref1");
    // Label "1." should not appear in the extracted text
    expect(refs[0]?.text).not.toMatch(/^1\./);
    expect(refs[0]?.text).toBe("Smith J. Some paper. Journal. 2024;1:1-10.");
  });

  it("falls back to extractAllText for mixed-citation", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. Title of paper. Journal. 2024;1:1-10.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toBe("Smith J. Title of paper. Journal. 2024;1:1-10.");
  });
});

describe("parseJatsReferences - citation-alternatives support", () => {
  it("traverses <citation-alternatives> to find <mixed-citation>", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <label>1.</label>
              <citation-alternatives>
                <element-citation publication-type="journal">
                  <person-group person-group-type="author">
                    <name><surname>Bowyer</surname><given-names>ER</given-names></name>
                    <name><surname>Shaw</surname><given-names>SC</given-names></name>
                  </person-group>
                  <article-title>Informal near-peer teaching</article-title>
                  <source>Educ Health</source>
                  <year>2021</year><volume>34</volume><fpage>29</fpage>
                </element-citation>
                <mixed-citation publication-type="journal">
                  Bowyer ER, Shaw SC. Informal near-peer teaching. Educ Health. 2021;34:29.
                  <pub-id pub-id-type="doi">10.4103/efh.EfH_20_18</pub-id>
                </mixed-citation>
              </citation-alternatives>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe("CR1");
    // Should use mixed-citation text, not duplicated concatenation
    expect(refs[0]?.text).toContain("Bowyer ER, Shaw SC");
    expect(refs[0]?.text).toContain("Informal near-peer teaching");
    // Should NOT have duplicated text like "BowyerERShawSC"
    expect(refs[0]?.text).not.toMatch(/BowyerER/);
  });

  it("falls back to <element-citation> inside <citation-alternatives> when no mixed-citation", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR2">
              <label>2.</label>
              <citation-alternatives>
                <element-citation publication-type="journal">
                  <person-group person-group-type="author">
                    <name><surname>Smith</surname><given-names>J</given-names></name>
                  </person-group>
                  <article-title>A study</article-title>
                  <source>Nature</source>
                  <year>2023</year>
                </element-citation>
              </citation-alternatives>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.text).toBe("Smith J. A study. Nature. 2023.");
  });
});

describe("parseJatsReferences - mixed-citation inline element spacing", () => {
  it("produces spaced author names from <string-name> elements", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                <string-name><surname>McGuire</surname><given-names>N</given-names></string-name>,
                <string-name><surname>Acai</surname><given-names>A</given-names></string-name>.
                The McMaster tool. Teach Learn Med. 2023;37(1):1-9.
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    // Should have space between surname and given-names
    expect(refs[0]?.text).toContain("McGuire N");
    expect(refs[0]?.text).toContain("Acai A");
    // Should NOT have concatenated names
    expect(refs[0]?.text).not.toContain("McGuireN");
    expect(refs[0]?.text).not.toContain("AcaiA");
  });

  it("produces spaced author names from <name> elements within <mixed-citation>", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>
                <name><surname>Smith</surname><given-names>JA</given-names></name>,
                <name><surname>Doe</surname><given-names>B</given-names></name>.
                A paper. 2024.
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toContain("Smith JA");
    expect(refs[0]?.text).toContain("Doe B");
    expect(refs[0]?.text).not.toContain("SmithJA");
  });
});

describe("parseJatsReferences - pub-id deduplication", () => {
  it("strips DOI from text when extracted structurally (inline text + <pub-id>)", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024. doi: <pub-id pub-id-type="doi">10.1234/test</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    // DOI is extracted as structured field, stripped from text
    expect(refs[0]?.doi).toBe("10.1234/test");
    expect(refs[0]?.text).not.toContain("10.1234/test");
  });

  it("strips DOI from text when <pub-id> is present", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <mixed-citation publication-type="journal">
                Bowyer ER, Shaw SC. Informal near-peer teaching. Educ Health. 2021;34:29.
                <pub-id pub-id-type="doi">10.4103/efh.EfH_20_18</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.doi).toBe("10.4103/efh.EfH_20_18");
    expect(refs[0]?.text).not.toContain("10.4103/efh.EfH_20_18");
  });

  it("strips duplicate DOI text when it appears both as text node and inside <pub-id>", () => {
    // Some publishers put the DOI as both inline text and inside pub-id
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024. 10.1234/test <pub-id pub-id-type="doi">10.1234/test</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    // DOI extracted structurally and stripped from text
    expect(refs[0]?.doi).toBe("10.1234/test");
    expect(refs[0]?.text).not.toContain("10.1234/test");
  });

  it("extracts <pub-id> content as structured doi field", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="doi">10.1234/unique</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.1234/unique");
  });
});

describe("parseJatsReferences - structured pub-id extraction", () => {
  it('extracts DOI from <pub-id pub-id-type="doi"> in mixed-citation', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="doi">10.1234/test</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.doi).toBe("10.1234/test");
  });

  it('extracts PMID from <pub-id pub-id-type="pmid"> in mixed-citation', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="pmid">12345678</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.pmid).toBe("12345678");
  });

  it('extracts PMCID from <pub-id pub-id-type="pmc"> in mixed-citation', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="pmc">PMC9876543</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.pmcid).toBe("9876543");
  });

  it("extracts multiple pub-ids from a single reference", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="doi">10.1038/nature12345</pub-id>
                <pub-id pub-id-type="pmid">99887766</pub-id>
                <pub-id pub-id-type="pmc">PMC1234567</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.1038/nature12345");
    expect(refs[0]?.pmid).toBe("99887766");
    expect(refs[0]?.pmcid).toBe("1234567");
  });

  it("returns undefined for missing pub-id types", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBeUndefined();
    expect(refs[0]?.pmid).toBeUndefined();
    expect(refs[0]?.pmcid).toBeUndefined();
  });

  it("extracts pub-ids from mixed-citation inside citation-alternatives", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <citation-alternatives>
                <element-citation publication-type="journal">
                  <person-group><name><surname>Bowyer</surname><given-names>ER</given-names></name></person-group>
                  <article-title>Teaching</article-title>
                  <source>Educ Health</source>
                  <year>2021</year>
                </element-citation>
                <mixed-citation publication-type="journal">
                  Bowyer ER. Teaching. Educ Health. 2021.
                  <pub-id pub-id-type="doi">10.4103/efh.EfH_20_18</pub-id>
                </mixed-citation>
              </citation-alternatives>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.4103/efh.EfH_20_18");
  });

  it("extracts pub-ids from <element-citation>", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <element-citation publication-type="journal">
                <person-group person-group-type="author">
                  <name><surname>Smith</surname><given-names>J</given-names></name>
                </person-group>
                <article-title>A study</article-title>
                <source>Nature</source>
                <year>2024</year>
                <pub-id pub-id-type="doi">10.1038/s41586-024-0001</pub-id>
                <pub-id pub-id-type="pmid">38000001</pub-id>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.doi).toBe("10.1038/s41586-024-0001");
    expect(refs[0]?.pmid).toBe("38000001");
  });

  it("extracts pub-ids from <element-citation> inside <citation-alternatives>", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <citation-alternatives>
                <element-citation publication-type="journal">
                  <person-group person-group-type="author">
                    <name><surname>Doe</surname><given-names>A</given-names></name>
                  </person-group>
                  <article-title>Research</article-title>
                  <source>Science</source>
                  <year>2023</year>
                  <pub-id pub-id-type="doi">10.1126/science.abc1234</pub-id>
                  <pub-id pub-id-type="pmc">PMC7654321</pub-id>
                </element-citation>
              </citation-alternatives>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.1126/science.abc1234");
    expect(refs[0]?.pmcid).toBe("7654321");
  });
});

describe("parseJatsReferences - pub-id text stripping", () => {
  it("strips DOI value from text when extracted structurally from mixed-citation", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024.
                <pub-id pub-id-type="doi">10.1234/test</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.1234/test");
    // DOI value should not appear in text since it's extracted as structured field
    expect(refs[0]?.text).not.toContain("10.1234/test");
    expect(refs[0]?.text).toContain("Smith J. A study. Nature. 2024.");
  });

  it('strips "doi:" prefix along with the DOI value', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024. doi: <pub-id pub-id-type="doi">10.1234/test</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.doi).toBe("10.1234/test");
    expect(refs[0]?.text).not.toContain("10.1234/test");
    expect(refs[0]?.text).not.toContain("doi:");
  });

  it("strips PMID value from text when extracted structurally", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A study. Nature. 2024. PMID: <pub-id pub-id-type="pmid">12345678</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.pmid).toBe("12345678");
    expect(refs[0]?.text).not.toContain("12345678");
  });

  it("preserves text content that is not a pub-id", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation publication-type="journal">
                Smith J. A great study on ML. Nature. 2024;1:100-110.
                <pub-id pub-id-type="doi">10.1038/nature12345</pub-id>
                <pub-id pub-id-type="pmid">99887766</pub-id>
              </mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toContain("Smith J. A great study on ML. Nature. 2024;1:100-110.");
    expect(refs[0]?.text).not.toContain("10.1038/nature12345");
    expect(refs[0]?.text).not.toContain("99887766");
  });
});

describe("parseJatsBody - underline and sc", () => {
  it("parses <underline> as plain text (no content loss)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The <underline>key finding</underline> was significant.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const texts = para.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text : ""));
      const combined = texts.join("");
      expect(combined).toContain("key finding");
      expect(combined).toContain("The ");
      expect(combined).toContain(" was significant.");
    }
  });

  it("parses <sc> (small caps) as plain text (no content loss)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>As described by <sc>Smith</sc> and colleagues.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const texts = para.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text : ""));
      const combined = texts.join("");
      expect(combined).toContain("Smith");
      expect(combined).toContain("As described by ");
    }
  });
});

describe("parseJatsBody - inline-formula", () => {
  it("parses <inline-formula> with <tex-math> child", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Methods</title>
            <p>where <inline-formula><tex-math>p &lt; 0.05</tex-math></inline-formula> was significant</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const formula = para.content.find((c) => c.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.tex).toBe("p < 0.05");
        expect(formula.text).toBe("p < 0.05");
      }
    }
  });

  it("parses <inline-formula> with <alternatives> containing <tex-math>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The value <inline-formula><alternatives><tex-math>\\alpha = 0.01</tex-math><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mi>alpha</mml:mi></mml:math></alternatives></inline-formula> was used.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const formula = para.content.find((c) => c.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.tex).toBe("\\alpha = 0.01");
      }
    }
  });

  it("parses <inline-formula> without <tex-math> using text fallback", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The ratio <inline-formula>r = 2.5</inline-formula> was observed.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const formula = para.content.find((c) => c.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.tex).toBeUndefined();
        expect(formula.text).toBe("r = 2.5");
      }
    }
  });
});

describe("parseJatsBody - monospace", () => {
  it("parses <monospace> as code inline element", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Methods</title>
            <p>Run the <monospace>install.sh</monospace> script.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const code = para.content.find((c) => c.type === "code");
      expect(code).toBeDefined();
      if (code?.type === "code") {
        expect(code.text).toBe("install.sh");
      }
    }
  });

  it("parses <monospace> for gene name", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The <monospace>BRCA1</monospace> gene was overexpressed.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const code = para.content.find((c) => c.type === "code");
      expect(code).toBeDefined();
      if (code?.type === "code") {
        expect(code.text).toBe("BRCA1");
      }
    }
  });
});

describe("parseJatsBody - ext-link and uri", () => {
  it("parses <ext-link> with xlink:href as link", () => {
    const xml = `
      <article xmlns:xlink="http://www.w3.org/1999/xlink">
        <body>
          <sec>
            <title>Methods</title>
            <p>Software available at <ext-link ext-link-type="uri"
              xlink:href="https://www.r-project.org/">https://www.r-project.org/</ext-link>.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const link = para.content.find((c) => c.type === "link");
      expect(link).toBeDefined();
      if (link?.type === "link") {
        expect(link.url).toBe("https://www.r-project.org/");
        expect(link.children).toEqual([{ type: "text", text: "https://www.r-project.org/" }]);
      }
    }
  });

  it("parses <ext-link> with different display text and URL", () => {
    const xml = `
      <article xmlns:xlink="http://www.w3.org/1999/xlink">
        <body>
          <sec>
            <title>Methods</title>
            <p>Visit <ext-link ext-link-type="uri"
              xlink:href="https://example.com/tool">our analysis tool</ext-link> for details.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const link = para.content.find((c) => c.type === "link");
      expect(link).toBeDefined();
      if (link?.type === "link") {
        expect(link.url).toBe("https://example.com/tool");
        expect(link.children).toEqual([{ type: "text", text: "our analysis tool" }]);
      }
    }
  });

  it("parses <uri> element as link", () => {
    const xml = `
      <article xmlns:xlink="http://www.w3.org/1999/xlink">
        <body>
          <sec>
            <title>Methods</title>
            <p>Available at <uri xlink:href="https://example.com/data">https://example.com/data</uri>.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const link = para.content.find((c) => c.type === "link");
      expect(link).toBeDefined();
      if (link?.type === "link") {
        expect(link.url).toBe("https://example.com/data");
      }
    }
  });

  it("parses <uri> without xlink:href using text content as URL", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Methods</title>
            <p>See <uri>https://example.com/resource</uri>.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    if (para.type === "paragraph") {
      const link = para.content.find((c) => c.type === "link");
      expect(link).toBeDefined();
      if (link?.type === "link") {
        expect(link.url).toBe("https://example.com/resource");
      }
    }
  });
});

describe("HTML numeric character reference decoding", () => {
  it("decodes numeric entities in title text", () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>The &#8216;smart&#8217; approach &#8211; a new &#8212; method</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe("The \u2018smart\u2019 approach \u2013 a new \u2014 method");
  });

  it("decodes numeric entities in body text", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>The patient&#8217;s condition improved &#8212; significantly.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const text = para.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      expect(text).toContain("\u2019");
      expect(text).toContain("\u2014");
      expect(text).not.toContain("&#8217;");
      expect(text).not.toContain("&#8212;");
    }
  });

  it("decodes numeric entities in reference text", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. The patient&#8217;s guide. 2024.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toContain("\u2019");
    expect(refs[0]?.text).not.toContain("&#8217;");
  });

  it("decodes hex entities &#xHHHH; in body text", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>The value is &#x0003c;10 and &#x0003e;5.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]?.content[0];
    if (!para) throw new Error("expected para");
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const text = para.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      expect(text).toContain("<10");
      expect(text).toContain(">5");
      expect(text).not.toContain("&#x0003c;");
      expect(text).not.toContain("&#x0003e;");
    }
  });

  it("decodes hex entities in reference text", () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. The &#x0003c;em&#x0003e;study&#x0003c;/em&#x0003e;. 2024.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]?.text).toContain("<em>");
    expect(refs[0]?.text).not.toContain("&#x0003c;");
  });
});

describe("parseJatsBody - boxed-text", () => {
  it("parses <boxed-text> with <title> and <p> children", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <boxed-text>
              <title>Key Points</title>
              <p>Point 1: Important finding.</p>
              <p>Point 2: Another finding.</p>
            </boxed-text>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("boxed-text");
    if (content[0]?.type === "boxed-text") {
      expect(content[0]?.title).toBe("Key Points");
      expect(content[0]?.content).toHaveLength(2);
      expect(content[0]?.content[0]?.type).toBe("paragraph");
      expect(content[0]?.content[1]?.type).toBe("paragraph");
    }
  });

  it("parses <boxed-text> without title", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <boxed-text>
              <p>Some boxed content.</p>
            </boxed-text>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("boxed-text");
    if (content[0]?.type === "boxed-text") {
      expect(content[0]?.title).toBeUndefined();
      expect(content[0]?.content).toHaveLength(1);
    }
  });
});

describe("parseJatsBody - def-list", () => {
  it("parses <def-list> with <def-item> containing <term> and <def> pairs", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Glossary</title>
            <def-list>
              <title>Abbreviations</title>
              <def-item>
                <term>RCT</term>
                <def><p>Randomized controlled trial</p></def>
              </def-item>
              <def-item>
                <term>CI</term>
                <def><p>Confidence interval</p></def>
              </def-item>
            </def-list>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("def-list");
    if (content[0]?.type === "def-list") {
      expect(content[0]?.title).toBe("Abbreviations");
      expect(content[0]?.items).toHaveLength(2);
      expect(content[0]?.items[0]).toEqual({
        term: "RCT",
        definition: "Randomized controlled trial",
      });
      expect(content[0]?.items[1]).toEqual({ term: "CI", definition: "Confidence interval" });
    }
  });

  it("parses <def-list> without title", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Terms</title>
            <def-list>
              <def-item>
                <term>API</term>
                <def><p>Application Programming Interface</p></def>
              </def-item>
            </def-list>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("def-list");
    if (content[0]?.type === "def-list") {
      expect(content[0]?.title).toBeUndefined();
      expect(content[0]?.items).toHaveLength(1);
    }
  });
});

describe("parseJatsBody - disp-formula", () => {
  it("parses <disp-formula> with <alternatives> containing <tex-math>", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Equations</title>
            <disp-formula id="eq1">
              <label>(1)</label>
              <alternatives>
                <tex-math>E = mc^2</tex-math>
                <mml:math><mml:mi>E</mml:mi></mml:math>
              </alternatives>
            </disp-formula>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("formula");
    if (content[0]?.type === "formula") {
      expect(content[0]?.id).toBe("eq1");
      expect(content[0]?.label).toBe("(1)");
      expect(content[0]?.tex).toBe("E = mc^2");
    }
  });

  it("parses <disp-formula> with direct <tex-math> (no alternatives)", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Equations</title>
            <disp-formula>
              <tex-math>a^2 + b^2 = c^2</tex-math>
            </disp-formula>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("formula");
    if (content[0]?.type === "formula") {
      expect(content[0]?.tex).toBe("a^2 + b^2 = c^2");
    }
  });

  it("parses <disp-formula> without tex-math, extracts text", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Equations</title>
            <disp-formula id="eq2">
              <label>(2)</label>
              x = y + z
            </disp-formula>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("formula");
    if (content[0]?.type === "formula") {
      expect(content[0]?.text).toContain("x = y + z");
    }
  });
});

describe("parseJatsBody - preformat", () => {
  it("parses <preformat> element preserving whitespace", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Code</title>
            <preformat>function hello() {
  return "world";
}</preformat>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("preformat");
    if (content[0]?.type === "preformat") {
      expect(content[0]?.text).toContain("function hello()");
      expect(content[0]?.text).toContain('return "world"');
    }
  });
});

describe("parseJatsBody - supplementary-material", () => {
  it("parses <supplementary-material> with label and caption as paragraph", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Data</title>
            <supplementary-material id="sup1">
              <label>Supplementary File 1</label>
              <caption><p>Raw data from the experiment</p></caption>
            </supplementary-material>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("paragraph");
    if (content[0]?.type === "paragraph") {
      const text = content[0]?.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      expect(text).toContain("Supplementary File 1");
      expect(text).toContain("Raw data from the experiment");
    }
  });

  it("handles <supplementary-material> without caption", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Data</title>
            <supplementary-material id="sup2">
              <label>Table S1</label>
            </supplementary-material>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]?.content;
    if (!content) throw new Error("expected content");
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("paragraph");
    if (content[0]?.type === "paragraph") {
      const text = content[0]?.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      expect(text).toContain("Table S1");
    }
  });
});

describe("E2E: multi-paragraph table cells in body", () => {
  it("parses XML with multi-paragraph table cells correctly", () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Interview Guide</title>
            <table-wrap id="Tab1">
              <label>Table 1</label>
              <caption><p>Interview topic guide</p></caption>
              <table>
                <thead>
                  <tr><th>Topic</th><th>Prompts</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><p>Introduction</p><p>Explain that this interview has nothing to do with evaluation.</p></td>
                    <td><p>Welcome the participant.</p></td>
                  </tr>
                  <tr>
                    <td><p>Experience</p><p>Ask about their daily routine.</p><p>Follow up on specifics.</p></td>
                    <td><p>Use open-ended questions.</p></td>
                  </tr>
                </tbody>
              </table>
            </table-wrap>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const table = sections[0]?.content[0];
    if (!table) throw new Error("expected table");
    expect(table.type).toBe("table");
    if (table.type === "table") {
      expect(table.rows[0]?.[0]).toBe(
        "Introduction<br>Explain that this interview has nothing to do with evaluation."
      );
      expect(table.rows[0]?.[1]).toBe("Welcome the participant.");
      expect(table.rows[1]?.[0]).toBe(
        "Experience<br>Ask about their daily routine.<br>Follow up on specifics."
      );
    }
  });
});

describe("parseJatsBackMatter - acknowledgments", () => {
  it("extracts acknowledgment text from <ack>", () => {
    const xml = `
      <article>
        <back>
          <ack><title>Acknowledgments</title><p>We thank Dr. Smith for assistance.</p></ack>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.acknowledgments).toBe("We thank Dr. Smith for assistance.");
  });

  it("extracts acknowledgment with multiple paragraphs", () => {
    const xml = `
      <article>
        <back>
          <ack>
            <title>Acknowledgements</title>
            <p>We thank Dr. Smith for assistance.</p>
            <p>Funding was provided by NIH grant R01.</p>
          </ack>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.acknowledgments).toContain("We thank Dr. Smith");
    expect(backMatter.acknowledgments).toContain("Funding was provided");
  });

  it("returns undefined acknowledgments when <ack> is absent", () => {
    const xml = `
      <article>
        <back>
          <ref-list><ref id="r1"><mixed-citation>Test</mixed-citation></ref></ref-list>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.acknowledgments).toBeUndefined();
  });
});

describe("parseJatsBackMatter - appendices", () => {
  it("extracts appendices from <app-group>/<app>", () => {
    const xml = `
      <article>
        <back>
          <app-group>
            <app id="app1">
              <title>Appendix A: Search Strategy</title>
              <sec>
                <title>PubMed Search</title>
                <p>((systematic review) AND ...)</p>
              </sec>
            </app>
          </app-group>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.appendices).toHaveLength(1);
    expect(backMatter.appendices?.[0]?.title).toBe("Appendix A: Search Strategy");
    expect(backMatter.appendices?.[0]?.subsections).toHaveLength(1);
    expect(backMatter.appendices?.[0]?.subsections[0]?.title).toBe("PubMed Search");
  });

  it("extracts multiple appendices", () => {
    const xml = `
      <article>
        <back>
          <app-group>
            <app id="app1">
              <title>Appendix A</title>
              <p>Content A</p>
            </app>
            <app id="app2">
              <title>Appendix B</title>
              <p>Content B</p>
            </app>
          </app-group>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.appendices).toHaveLength(2);
    expect(backMatter.appendices?.[0]?.title).toBe("Appendix A");
    expect(backMatter.appendices?.[1]?.title).toBe("Appendix B");
  });

  it("returns undefined appendices when <app-group> is absent", () => {
    const xml = `
      <article>
        <back>
          <ref-list><ref id="r1"><mixed-citation>Test</mixed-citation></ref></ref-list>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.appendices).toBeUndefined();
  });
});

describe("parseJatsBackMatter - footnotes", () => {
  it("extracts footnotes from <fn-group>", () => {
    const xml = `
      <article>
        <back>
          <fn-group>
            <fn id="fn1"><p>Footnote one text.</p></fn>
            <fn id="fn2"><p>Footnote two text.</p></fn>
          </fn-group>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.footnotes).toHaveLength(2);
    expect(backMatter.footnotes?.[0]).toEqual({ id: "fn1", text: "Footnote one text." });
    expect(backMatter.footnotes?.[1]).toEqual({ id: "fn2", text: "Footnote two text." });
  });

  it("separates title and body text in footnotes with space", () => {
    const xml = `
      <article>
        <back>
          <fn-group>
            <fn id="fn1">
              <p><bold>Publisher's Note</bold></p>
              <p>Springer Nature remains neutral with regard to jurisdictional claims.</p>
            </fn>
          </fn-group>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.footnotes).toHaveLength(1);
    expect(backMatter.footnotes?.[0]?.text).toBe(
      "Publisher's Note Springer Nature remains neutral with regard to jurisdictional claims."
    );
  });

  it("handles footnote with <title> and <p> children", () => {
    const xml = `
      <article>
        <back>
          <fn-group>
            <fn id="fn1">
              <title>Publisher's Note</title>
              <p>Springer Nature remains neutral with regard to jurisdictional claims.</p>
            </fn>
          </fn-group>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.footnotes).toHaveLength(1);
    expect(backMatter.footnotes?.[0]?.text).toBe(
      "Publisher's Note Springer Nature remains neutral with regard to jurisdictional claims."
    );
  });

  it("returns undefined footnotes when <fn-group> is absent", () => {
    const xml = `
      <article>
        <back>
          <ref-list><ref id="r1"><mixed-citation>Test</mixed-citation></ref></ref-list>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.footnotes).toBeUndefined();
  });
});

describe("parseJatsBackMatter - floats-group", () => {
  it("extracts figures and tables from <floats-group>", () => {
    const xml = `
      <article>
        <body>
          <sec><p>See <xref ref-type="fig" rid="fig1">Figure 1</xref>.</p></sec>
        </body>
        <floats-group>
          <fig id="fig1">
            <label>Figure 1</label>
            <caption><title>Study flow diagram</title></caption>
            <graphic xlink:href="fig1.jpg"/>
          </fig>
          <table-wrap id="tbl1">
            <label>Table 1</label>
            <caption><title>Baseline characteristics</title></caption>
            <table>
              <thead><tr><th>Age</th><th>Count</th></tr></thead>
              <tbody><tr><td>30</td><td>50</td></tr></tbody>
            </table>
          </table-wrap>
        </floats-group>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.floats).toHaveLength(2);
    expect(backMatter.floats?.[0]?.type).toBe("figure");
    if (backMatter.floats?.[0]?.type === "figure") {
      expect(backMatter.floats?.[0]?.label).toBe("Figure 1");
      expect(backMatter.floats?.[0]?.caption).toBe("Study flow diagram");
    }
    expect(backMatter.floats?.[1]?.type).toBe("table");
    if (backMatter.floats?.[1]?.type === "table") {
      expect(backMatter.floats?.[1]?.headers).toEqual(["Age", "Count"]);
    }
  });

  it("returns undefined floats when <floats-group> is absent", () => {
    const xml = `
      <article>
        <body><sec><p>No floats here.</p></sec></body>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.floats).toBeUndefined();
  });
});

describe("parseJatsBackMatter - notes", () => {
  it('extracts author contributions from <notes notes-type="author-contribution">', () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study. AB collected data.</p>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(1);
    expect(backMatter.notes?.[0]?.title).toBe("Author contributions");
    expect(backMatter.notes?.[0]?.text).toBe("TK designed the study. AB collected data.");
  });

  it('extracts data availability from <notes notes-type="data-availability">', () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="data-availability">
            <title>Data availability</title>
            <p>Available on request.</p>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(1);
    expect(backMatter.notes?.[0]?.title).toBe("Data availability");
    expect(backMatter.notes?.[0]?.text).toBe("Available on request.");
  });

  it("extracts multiple notes sections", () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study.</p>
          </notes>
          <notes notes-type="data-availability">
            <title>Data availability</title>
            <p>Data available at DOI.</p>
          </notes>
          <notes notes-type="supported-by">
            <title>Funding</title>
            <p>NIH grant R01.</p>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(3);
    expect(backMatter.notes?.[0]?.title).toBe("Author contributions");
    expect(backMatter.notes?.[1]?.title).toBe("Data availability");
    expect(backMatter.notes?.[2]?.title).toBe("Funding");
  });

  it("extracts notes with multiple paragraphs", () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study.</p>
            <p>AB collected data and performed analysis.</p>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(1);
    expect(backMatter.notes?.[0]?.text).toBe(
      "TK designed the study.\n\nAB collected data and performed analysis."
    );
  });

  it("returns undefined notes when no <notes> elements exist", () => {
    const xml = `
      <article>
        <back>
          <ref-list><ref id="r1"><mixed-citation>Test</mixed-citation></ref></ref-list>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toBeUndefined();
  });

  it("extracts nested <sec> elements within a <notes> wrapper (Declarations)", () => {
    const xml = `
      <article>
        <back>
          <notes>
            <title>Declarations</title>
            <sec>
              <title>Ethics approval and consent to participate</title>
              <p>The study was approved by the IRB.</p>
            </sec>
            <sec>
              <title>Competing interests</title>
              <p>The authors declare no competing interests.</p>
            </sec>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(2);
    expect(backMatter.notes?.[0]?.title).toBe("Ethics approval and consent to participate");
    expect(backMatter.notes?.[0]?.text).toBe("The study was approved by the IRB.");
    expect(backMatter.notes?.[1]?.title).toBe("Competing interests");
    expect(backMatter.notes?.[1]?.text).toBe("The authors declare no competing interests.");
  });

  it("extracts nested <notes> elements within a <notes> wrapper (Declarations)", () => {
    const xml = `
      <article>
        <back>
          <notes>
            <title>Declarations</title>
            <notes id="FPar1">
              <title>Ethics approval and consent to participate</title>
              <p>This study was conducted in accordance with the guidelines.</p>
            </notes>
            <notes id="FPar2">
              <title>Consent for publication</title>
              <p>All participants agreed to publication.</p>
            </notes>
            <notes id="FPar3" notes-type="COI-statement">
              <title>Competing interests</title>
              <p>The authors declare no competing interests.</p>
            </notes>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(3);
    expect(backMatter.notes?.[0]?.title).toBe("Ethics approval and consent to participate");
    expect(backMatter.notes?.[0]?.text).toBe(
      "This study was conducted in accordance with the guidelines."
    );
    expect(backMatter.notes?.[1]?.title).toBe("Consent for publication");
    expect(backMatter.notes?.[1]?.text).toBe("All participants agreed to publication.");
    expect(backMatter.notes?.[2]?.title).toBe("Competing interests");
    expect(backMatter.notes?.[2]?.text).toBe("The authors declare no competing interests.");
  });

  it("handles mixed direct <notes> and wrapper <notes> with nested <notes>", () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study.</p>
          </notes>
          <notes>
            <title>Declarations</title>
            <notes>
              <title>Competing interests</title>
              <p>None declared.</p>
            </notes>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(2);
    expect(backMatter.notes?.[0]?.title).toBe("Author contributions");
    expect(backMatter.notes?.[1]?.title).toBe("Competing interests");
  });

  it("handles mixed direct <notes> and wrapper <notes> with <sec>", () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study.</p>
          </notes>
          <notes>
            <title>Declarations</title>
            <sec>
              <title>Competing interests</title>
              <p>None declared.</p>
            </sec>
          </notes>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(2);
    expect(backMatter.notes?.[0]?.title).toBe("Author contributions");
    expect(backMatter.notes?.[1]?.title).toBe("Competing interests");
  });
});

describe("parseJatsBackMatter - glossary", () => {
  it("extracts glossary with def-list as a note", () => {
    const xml = `
      <article>
        <back>
          <glossary>
            <title>Abbreviations</title>
            <def-list>
              <def-item>
                <term>PGY1</term>
                <def><p>a post-graduate year 1 resident</p></def>
              </def-item>
              <def-item>
                <term>PGY2</term>
                <def><p>a post-graduate year 2 resident</p></def>
              </def-item>
            </def-list>
          </glossary>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(1);
    expect(backMatter.notes?.[0]?.title).toBe("Abbreviations");
    expect(backMatter.notes?.[0]?.text).toContain("PGY1");
    expect(backMatter.notes?.[0]?.text).toContain("a post-graduate year 1 resident");
    expect(backMatter.notes?.[0]?.text).toContain("PGY2");
    expect(backMatter.notes?.[0]?.text).toContain("a post-graduate year 2 resident");
  });

  it("extracts glossary without title", () => {
    const xml = `
      <article>
        <back>
          <glossary>
            <def-list>
              <def-item>
                <term>API</term>
                <def><p>Application Programming Interface</p></def>
              </def-item>
            </def-list>
          </glossary>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(1);
    expect(backMatter.notes?.[0]?.title).toBe("Glossary");
    expect(backMatter.notes?.[0]?.text).toContain("API");
    expect(backMatter.notes?.[0]?.text).toContain("Application Programming Interface");
  });

  it("combines glossary with existing notes", () => {
    const xml = `
      <article>
        <back>
          <notes notes-type="author-contribution">
            <title>Author contributions</title>
            <p>TK designed the study.</p>
          </notes>
          <glossary>
            <title>Abbreviations</title>
            <def-list>
              <def-item>
                <term>PGY1</term>
                <def><p>a post-graduate year 1 resident</p></def>
              </def-item>
            </def-list>
          </glossary>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes).toHaveLength(2);
    expect(backMatter.notes?.[0]?.title).toBe("Author contributions");
    expect(backMatter.notes?.[1]?.title).toBe("Abbreviations");
    expect(backMatter.notes?.[1]?.text).toContain("PGY1");
  });

  it("formats def-list items as term-definition pairs", () => {
    const xml = `
      <article>
        <back>
          <glossary>
            <title>Abbreviations</title>
            <def-list>
              <def-item>
                <term>PGY1</term>
                <def><p>a post-graduate year 1 resident</p></def>
              </def-item>
              <def-item>
                <term>PGY2</term>
                <def><p>a post-graduate year 2 resident</p></def>
              </def-item>
            </def-list>
          </glossary>
        </back>
      </article>
    `;
    const backMatter = parseJatsBackMatter(xml);
    expect(backMatter.notes?.[0]?.text).toBe(
      "PGY1: a post-graduate year 1 resident\nPGY2: a post-graduate year 2 resident"
    );
  });
});
