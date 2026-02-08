/**
 * Conversion orchestrator for PMC XML to Markdown.
 *
 * Ties together the JATS parser and Markdown writer with file I/O.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import type { FulltextMeta } from "../types.js";
import {
  parseJatsBackMatter,
  parseJatsBody,
  parseJatsMetadata,
  parseJatsReferences,
} from "./jats-parser.js";
import { writeMarkdown } from "./markdown-writer.js";
import type { JatsDocument } from "./types.js";

export interface ConvertResult {
  success: boolean;
  error?: string;
  title?: string;
  sections?: number;
  references?: number;
}

/**
 * Convert a PMC JATS XML file to Markdown.
 *
 * Reads the XML, parses it into a JatsDocument, writes Markdown,
 * and optionally updates meta.json.
 */
export async function convertPmcXmlToMarkdown(
  xmlPath: string,
  mdPath: string,
  metaPath?: string
): Promise<ConvertResult> {
  try {
    const xml = await readFile(xmlPath, "utf-8");

    // Parse
    const metadata = parseJatsMetadata(xml);
    const sections = parseJatsBody(xml);
    const references = parseJatsReferences(xml);
    const backMatter = parseJatsBackMatter(xml);

    const doc: JatsDocument = { metadata, sections, references };
    if (backMatter.acknowledgments) doc.acknowledgments = backMatter.acknowledgments;
    if (backMatter.appendices) doc.appendices = backMatter.appendices;
    if (backMatter.footnotes) doc.footnotes = backMatter.footnotes;
    if (backMatter.floats) doc.floats = backMatter.floats;
    if (backMatter.notes) doc.notes = backMatter.notes;

    // Write Markdown
    const md = writeMarkdown(doc);
    await writeFile(mdPath, md, "utf-8");

    // Update meta.json if path provided and file exists
    if (metaPath) {
      try {
        await stat(metaPath);
        const metaRaw = await readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaRaw) as FulltextMeta;
        const mdStat = await stat(mdPath);

        meta.files.markdown = {
          filename: "fulltext.md",
          source: "conversion",
          retrievedAt: new Date().toISOString(),
          size: mdStat.size,
          convertedFrom: "fulltext.xml",
        };

        await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
      } catch {
        // meta.json doesn't exist or can't be read, skip update
      }
    }

    const result: ConvertResult = { success: true };
    result.title = metadata.title;
    result.sections = sections.length;
    result.references = references.length;
    return result;
  } catch (err) {
    const result: ConvertResult = { success: false };
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}
