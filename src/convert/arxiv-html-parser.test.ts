/**
 * Tests for arXiv HTML to JatsDocument parser.
 */

import { describe, expect, it } from "vitest";
import {
  parseArxivHtml,
  parseArxivHtmlBody,
  parseArxivHtmlMetadata,
  parseArxivHtmlReferences,
} from "./arxiv-html-parser.js";

/** Minimal arXiv LaTeXML HTML for testing */
const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Test Paper</title></head>
<body>
<article class="ltx_document" id="S0">
  <h1 class="ltx_title ltx_title_document">A Study of Deep Learning</h1>
  <div class="ltx_authors">
    <span class="ltx_personname">John Smith</span>
    <span class="ltx_personname">Alice Jones</span>
  </div>
  <div class="ltx_abstract">
    <h6 class="ltx_title ltx_title_abstract">Abstract</h6>
    <p>This paper studies deep learning techniques.</p>
  </div>
  <section class="ltx_section" id="S1">
    <h2 class="ltx_title ltx_title_section">
      <span class="ltx_tag ltx_tag_section">1 </span>Introduction</h2>
    <div class="ltx_para" id="S1.p1">
      <p>Deep learning has made remarkable progress.</p>
    </div>
    <section class="ltx_subsection" id="S1.SS1">
      <h3 class="ltx_title ltx_title_subsection">
        <span class="ltx_tag ltx_tag_subsection">1.1 </span>Background</h3>
      <div class="ltx_para" id="S1.SS1.p1">
        <p>Neural networks date back to the 1950s.</p>
      </div>
    </section>
  </section>
  <section class="ltx_section" id="S2">
    <h2 class="ltx_title ltx_title_section">
      <span class="ltx_tag ltx_tag_section">2 </span>Methods</h2>
    <div class="ltx_para" id="S2.p1">
      <p>We used a <b>transformer</b> architecture with <i>attention</i> mechanisms.</p>
    </div>
  </section>
  <section class="ltx_acknowledgement" id="S3">
    <h2 class="ltx_title ltx_title_acknowledgement">Acknowledgements</h2>
    <div class="ltx_para" id="S3.p1">
      <p>We thank the reviewers.</p>
    </div>
  </section>
  <section class="ltx_bibliography" id="bib">
    <h2 class="ltx_title ltx_title_bibliography">References</h2>
    <ul class="ltx_biblist">
      <li class="ltx_bibitem" id="bib.bib1">
        <span class="ltx_tag ltx_tag_bibitem">[1]</span>
        <span class="ltx_bibblock">Smith J. Previous work on neural networks. Journal of AI. 2023.</span>
      </li>
      <li class="ltx_bibitem" id="bib.bib2">
        <span class="ltx_tag ltx_tag_bibitem">[2]</span>
        <span class="ltx_bibblock">Jones A. Attention is all you need. <a href="https://doi.org/10.1234/test">doi</a></span>
      </li>
    </ul>
  </section>
</article>
</body>
</html>`;

describe("parseArxivHtml", () => {
  it("parses a complete document", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);

    expect(doc.metadata.title).toBe("A Study of Deep Learning");
    expect(doc.metadata.authors).toHaveLength(2);
    expect(doc.sections).toHaveLength(2);
    expect(doc.references).toHaveLength(2);
    expect(doc.acknowledgments).toBe("We thank the reviewers.");
  });

  it("extracts title without author info", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    expect(doc.metadata.title).not.toContain("John Smith");
  });

  it("parses authors correctly", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    const [first, second] = doc.metadata.authors;
    expect(first?.surname).toBe("Smith");
    expect(first?.givenNames).toBe("John");
    expect(second?.surname).toBe("Jones");
    expect(second?.givenNames).toBe("Alice");
  });

  it("extracts abstract without heading", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    expect(doc.metadata.abstract).toBe("This paper studies deep learning techniques.");
  });

  it("parses body sections with correct levels", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    const intro = doc.sections[0];
    expect(intro?.level).toBe(2);
    expect(intro?.title).toContain("Introduction");
    expect(intro?.subsections).toHaveLength(1);
    expect(intro?.subsections[0]?.level).toBe(3);
    expect(intro?.subsections[0]?.title).toContain("Background");
  });

  it("excludes bibliography and acknowledgment from body sections", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    const titles = doc.sections.map((s) => s.title);
    expect(titles).not.toContain(expect.stringContaining("References"));
    expect(titles).not.toContain(expect.stringContaining("Acknowledgements"));
  });
});

describe("parseArxivHtmlMetadata", () => {
  it("returns metadata only", () => {
    const meta = parseArxivHtmlMetadata(SAMPLE_HTML);
    expect(meta.title).toBe("A Study of Deep Learning");
    expect(meta.authors).toHaveLength(2);
    expect(meta.abstract).toBeDefined();
  });
});

describe("parseArxivHtmlBody", () => {
  it("returns body sections only", () => {
    const sections = parseArxivHtmlBody(SAMPLE_HTML);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toContain("Introduction");
  });
});

describe("parseArxivHtmlReferences", () => {
  it("parses references with DOI links", () => {
    const refs = parseArxivHtmlReferences(SAMPLE_HTML);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.text).toContain("Previous work");
    expect(refs[1]?.doi).toBe("10.1234/test");
  });

  it("uses bibitem id as reference id", () => {
    const refs = parseArxivHtmlReferences(SAMPLE_HTML);
    expect(refs[0]?.id).toBe("bib.bib1");
    expect(refs[1]?.id).toBe("bib.bib2");
  });
});

describe("inline content parsing", () => {
  it("parses bold and italic", () => {
    const doc = parseArxivHtml(SAMPLE_HTML);
    const methods = doc.sections[1];
    const para = methods?.content[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      const boldNode = para.content.find((n) => n.type === "bold");
      expect(boldNode).toBeDefined();
      if (boldNode?.type === "bold") {
        expect(boldNode.children[0]).toEqual({ type: "text", text: "transformer" });
      }
      const italicNode = para.content.find((n) => n.type === "italic");
      expect(italicNode).toBeDefined();
      if (italicNode?.type === "italic") {
        expect(italicNode.children[0]).toEqual({ type: "text", text: "attention" });
      }
    }
  });

  it("parses math with alttext", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>The formula <math alttext="E=mc^2">E=mc²</math> is famous.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const formula = para.content.find((n) => n.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.tex).toBe("E=mc^2");
        expect(formula.text).toBe("E=mc²");
      }
    }
  });

  it("parses display formula with alttext", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_equation" id="eq1">
          <math alttext="\\sum_{i=1}^{n} x_i">Σxᵢ</math>
          <span class="ltx_tag_equation">(1)</span>
        </div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const formula = doc.sections[0]?.content[0];
    expect(formula?.type).toBe("formula");
    if (formula?.type === "formula") {
      expect(formula.tex).toBe("\\sum_{i=1}^{n} x_i");
      expect(formula.label).toBe("(1)");
    }
  });

  it("parses citation links", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>As shown by <a href="#bib.bib1">[1]</a>.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const cit = para.content.find((n) => n.type === "citation");
      expect(cit).toBeDefined();
      if (cit?.type === "citation") {
        expect(cit.refId).toBe("bib.bib1");
        expect(cit.text).toBe("[1]");
      }
    }
  });

  it("parses external links", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>See <a href="https://example.com">our page</a>.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const link = para.content.find((n) => n.type === "link");
      expect(link).toBeDefined();
      if (link?.type === "link") {
        expect(link.url).toBe("https://example.com");
      }
    }
  });

  it("parses code spans", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>Use <code>print()</code> function.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const codeNode = para.content.find((n) => n.type === "code");
      expect(codeNode).toBeDefined();
      if (codeNode?.type === "code") {
        expect(codeNode.text).toBe("print()");
      }
    }
  });

  it("parses ltx_font_bold class as bold", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p><span class="ltx_font_bold">important</span> text.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const bold = para.content.find((n) => n.type === "bold");
      expect(bold).toBeDefined();
    }
  });

  it("parses ltx_font_typewriter class as code", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p><span class="ltx_font_typewriter">monospace</span> text.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const code = para.content.find((n) => n.type === "code");
      expect(code).toBeDefined();
      if (code?.type === "code") {
        expect(code.text).toBe("monospace");
      }
    }
  });
});

describe("block content parsing", () => {
  it("parses ordered lists", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <ol class="ltx_enumerate">
          <li>First item</li>
          <li>Second item</li>
        </ol>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const list = doc.sections[0]?.content[0];
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.ordered).toBe(true);
      expect(list.items).toHaveLength(2);
    }
  });

  it("parses unordered lists", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <ul class="ltx_itemize">
          <li>Item A</li>
          <li>Item B</li>
        </ul>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const list = doc.sections[0]?.content[0];
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.ordered).toBe(false);
      expect(list.items).toHaveLength(2);
    }
  });

  it("parses table with headers", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <figure class="ltx_table">
          <table>
            <thead><tr><th>Name</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>A</td><td>1</td></tr>
              <tr><td>B</td><td>2</td></tr>
            </tbody>
          </table>
        </figure>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const table = doc.sections[0]?.content[0];
    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.headers).toEqual(["Name", "Value"]);
      expect(table.rows).toHaveLength(2);
    }
  });

  it("parses figures", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <figure class="ltx_figure" id="fig1">
          <img src="x.png" />
          <figcaption class="ltx_caption">
            <span class="ltx_tag_figure">Figure 1:</span> A nice figure
          </figcaption>
        </figure>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const fig = doc.sections[0]?.content[0];
    expect(fig?.type).toBe("figure");
    if (fig?.type === "figure") {
      expect(fig.label).toBe("Figure 1");
      expect(fig.caption).toBe("A nice figure");
    }
  });
});

describe("quality fixes", () => {
  it("parses multiple authors from single ltx_personname with affiliation numbers", () => {
    const html = `<article class="ltx_document">
      <h1 class="ltx_title ltx_title_document">Test</h1>
      <div class="ltx_authors">
        <span class="ltx_personname">Alice Smith<sup class="ltx_sup">1</sup>, Bob Jones<sup class="ltx_sup">2</sup>, Charlie Brown<sup class="ltx_sup">1</sup>
          <sup class="ltx_sup">1</sup>IBM Research
          <sup class="ltx_sup">2</sup>MIT</span>
      </div>
    </article>`;
    const doc = parseArxivHtml(html);
    expect(doc.metadata.authors).toHaveLength(3);
    expect(doc.metadata.authors[0]?.surname).toBe("Smith");
    expect(doc.metadata.authors[0]?.givenNames).toBe("Alice");
    expect(doc.metadata.authors[1]?.surname).toBe("Jones");
    expect(doc.metadata.authors[1]?.givenNames).toBe("Bob");
    expect(doc.metadata.authors[2]?.surname).toBe("Brown");
    expect(doc.metadata.authors[2]?.givenNames).toBe("Charlie");
  });

  it("parses authors split across lines with br elements", () => {
    const html = `<article class="ltx_document">
      <h1 class="ltx_title ltx_title_document">Test</h1>
      <div class="ltx_authors">
        <span class="ltx_personname">Alice Smith<sup class="ltx_sup">1</sup>, Bob Jones<sup class="ltx_sup">2</sup>,
<br class="ltx_break"/>Charlie Brown<sup class="ltx_sup">1</sup>, Dave Wilson<sup class="ltx_sup">2</sup>
<br class="ltx_break"/><sup class="ltx_sup">1</sup>IBM Research, <sup class="ltx_sup">2</sup> NASA GSFC</span>
      </div>
    </article>`;
    const doc = parseArxivHtml(html);
    expect(doc.metadata.authors).toHaveLength(4);
    expect(doc.metadata.authors[0]?.surname).toBe("Smith");
    expect(doc.metadata.authors[1]?.surname).toBe("Jones");
    expect(doc.metadata.authors[2]?.surname).toBe("Brown");
    expect(doc.metadata.authors[3]?.surname).toBe("Wilson");
  });

  it("handles table class ltx_equation as formula, not table", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <table class="ltx_equation" id="eq1">
          <tr>
            <td class="ltx_eqn_cell"><math alttext="E=mc^2">E=mc²</math></td>
            <td class="ltx_eqn_cell ltx_align_right"><span class="ltx_tag_equation">(1)</span></td>
          </tr>
        </table>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const block = doc.sections[0]?.content[0];
    expect(block?.type).toBe("formula");
    if (block?.type === "formula") {
      expect(block.tex).toBe("E=mc^2");
      expect(block.label).toBe("(1)");
    }
  });

  it("strips annotation elements from inline math textContent", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>The value <math alttext="x_1">x<annotation encoding="application/x-llamapun">start_FLOATSUBSCRIPT 1 end_FLOATSUBSCRIPT</annotation></math> here.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const formula = para.content.find((n) => n.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.text).toBe("x");
        expect(formula.text).not.toContain("FLOATSUBSCRIPT");
      }
    }
  });

  it("strips annotation elements from display formula math", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_equation" id="eq1">
          <math alttext="\\sum x_i">Σxᵢ<annotation encoding="application/x-llamapun">sum x start sub i end sub</annotation></math>
        </div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const block = doc.sections[0]?.content[0];
    expect(block?.type).toBe("formula");
    if (block?.type === "formula") {
      expect(block.tex).toBe("\\sum x_i");
      // text should not be set since tex is present, but if it were it shouldn't contain annotation
    }
  });

  it("removes footnote notes from abstract", () => {
    const html = `<article class="ltx_document">
      <h1 class="ltx_title ltx_title_document">Test</h1>
      <div class="ltx_abstract">
        <h6 class="ltx_title ltx_title_abstract">Abstract</h6>
        <span class="ltx_note ltx_role_footnote">This is a footnote that should be removed.</span>
        <p>This is the actual abstract content.</p>
      </div>
    </article>`;
    const doc = parseArxivHtml(html);
    expect(doc.metadata.abstract).toBe("This is the actual abstract content.");
    expect(doc.metadata.abstract).not.toContain("footnote");
  });

  it("parses span-based ltx_tabular tables", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <span class="ltx_tabular">
          <span class="ltx_thead">
            <span class="ltx_tr">
              <span class="ltx_td">Name</span>
              <span class="ltx_td">Value</span>
            </span>
          </span>
          <span class="ltx_tbody">
            <span class="ltx_tr">
              <span class="ltx_td">A</span>
              <span class="ltx_td">1</span>
            </span>
            <span class="ltx_tr">
              <span class="ltx_td">B</span>
              <span class="ltx_td">2</span>
            </span>
          </span>
        </span>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const table = doc.sections[0]?.content[0];
    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.headers).toEqual(["Name", "Value"]);
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0]).toEqual(["A", "1"]);
      expect(table.rows[1]).toEqual(["B", "2"]);
    }
  });
});

describe("edge cases", () => {
  it("handles empty HTML gracefully", () => {
    const doc = parseArxivHtml("");
    expect(doc.metadata.title).toBe("");
    expect(doc.sections).toHaveLength(0);
    expect(doc.references).toHaveLength(0);
  });

  it("handles HTML without article element", () => {
    const html = "<html><body><p>Just text</p></body></html>";
    const doc = parseArxivHtml(html);
    expect(doc.metadata.title).toBe("");
  });

  it("handles math without alttext", () => {
    const html = `<article class="ltx_document">
      <section class="ltx_section">
        <h2>Test</h2>
        <div class="ltx_para"><p>Value <math>x+y</math> here.</p></div>
      </section>
    </article>`;
    const doc = parseArxivHtml(html);
    const para = doc.sections[0]?.content[0];
    if (para?.type === "paragraph") {
      const formula = para.content.find((n) => n.type === "inline-formula");
      expect(formula).toBeDefined();
      if (formula?.type === "inline-formula") {
        expect(formula.tex).toBeUndefined();
        expect(formula.text).toBe("x+y");
      }
    }
  });
});
