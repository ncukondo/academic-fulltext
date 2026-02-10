# @ncukondo/academic-fulltext

Open Access discovery, fulltext download, and Markdown conversion for academic articles.

## Install

```bash
npm install @ncukondo/academic-fulltext
```

Requires Node.js >= 22.

## Quick Start

```typescript
import {
  discoverOA,
  fetchFulltext,
  convertPmcXmlToMarkdown,
} from "@ncukondo/academic-fulltext";

// 1. Discover OA sources
const discovery = await discoverOA(
  { doi: "10.1038/s41586-020-2649-2" },
  {
    unpaywallEmail: "you@example.com",
    coreApiKey: "your-core-api-key",
    preferSources: ["pmc", "arxiv", "unpaywall", "core"],
  },
);
// discovery.oaStatus → "open" | "closed" | "unknown"
// discovery.locations → OALocation[]

// 2. Download fulltext files
const result = await fetchFulltext(
  {
    dirName: "smith2024-a1b2c3d4",
    oaLocations: discovery.locations,
    pmcid: discovery.discoveredIds.pmcid,
  },
  "/path/to/session",
);
// result.status → "downloaded" | "failed" | "skipped"
// result.filesDownloaded → ["fulltext.pdf", "fulltext.xml", ...]

// 3. Convert to Markdown
await convertPmcXmlToMarkdown(
  "/path/to/session/fulltext/smith2024-a1b2c3d4/fulltext.xml",
  "/path/to/session/fulltext/smith2024-a1b2c3d4/fulltext.md",
  "/path/to/session/fulltext/smith2024-a1b2c3d4/meta.json",
);
```

## Workflow

The package provides a three-step pipeline:

### Step 1: Discover OA Sources

`discoverOA()` checks multiple sources in priority order and aggregates results:

| Source | Requires | Identifier |
|--------|----------|------------|
| **PMC** | PMID or PMCID | `pmid` / `pmcid` |
| **arXiv** | arXiv ID | `arxivId` |
| **Unpaywall** | DOI + email | `doi` |
| **CORE** | DOI + API key | `doi` |

When only a DOI is provided, the NCBI ID Converter is used to resolve PMCID/PMID automatically.

```typescript
const discovery = await discoverOA(
  { doi: "10.1234/example", pmid: "12345678" },
  {
    unpaywallEmail: "you@example.com",
    coreApiKey: "your-core-api-key",
    preferSources: ["pmc", "arxiv", "unpaywall", "core"],
  },
);
// discovery.oaStatus: "open" | "closed" | "unknown"
// discovery.locations: OALocation[] — sorted by source priority
// discovery.errors: Array<{ source, error }> — per-source errors (non-fatal)
// discovery.discoveredIds: { pmcid?, pmid? } — IDs resolved from DOI
```

You can also call individual sources directly:

```typescript
import {
  checkUnpaywall,
  checkPmc,
  checkArxiv,
  checkCore,
  resolveDoiToPmcid,
} from "@ncukondo/academic-fulltext";

const locations = await checkPmc({ pmcid: "PMC7116560" });
const arxivLocations = checkArxiv("2301.13867");
const idResult = await resolveDoiToPmcid("10.1234/example");
```

### Step 2: Download Fulltexts

`fetchFulltext()` downloads files from discovered OA locations. It tries PDF sources in priority order, and also fetches PMC XML and arXiv HTML when identifiers are available.

```typescript
import { fetchFulltext, fetchAllFulltexts } from "@ncukondo/academic-fulltext";

// Single article
const result = await fetchFulltext(
  {
    dirName: "smith2024-a1b2c3d4",
    oaLocations: discovery.locations,
    pmcid: "PMC7116560",
    arxivId: "2301.13867",
  },
  "/path/to/session",
  { retries: 3, retryDelay: 1000 },
);

// Batch with concurrency control
const results = await fetchAllFulltexts(articles, "/path/to/session", {
  concurrency: 3,
  onProgress: ({ completed, total, dirName }) => {
    console.log(`${completed}/${total}: ${dirName}`);
  },
});
```

Downloaded files are saved to `{sessionDir}/fulltext/{dirName}/`:

| File | Source | Description |
|------|--------|-------------|
| `fulltext.pdf` | PDF locations | Primary fulltext |
| `fulltext.xml` | PMC E-utilities | JATS XML (when PMCID available) |
| `fulltext.html` | arXiv | LaTeXML HTML (when arXiv ID available) |
| `meta.json` | Generated | Article metadata and file tracking |

Low-level download functions are also available:

```typescript
import {
  downloadPdf,
  downloadPmcXml,
  downloadArxivHtml,
} from "@ncukondo/academic-fulltext";

await downloadPdf("https://example.com/paper.pdf", "/dest/fulltext.pdf");
await downloadPmcXml("PMC7116560", "/dest/fulltext.xml");
await downloadArxivHtml("2301.13867", "/dest/fulltext.html");
```

### Step 3: Convert to Markdown

Convert PMC JATS XML or arXiv HTML into Markdown. Optionally updates `meta.json` with the converted file info.

```typescript
import {
  convertPmcXmlToMarkdown,
  convertArxivHtmlToMarkdown,
} from "@ncukondo/academic-fulltext";

const result = await convertPmcXmlToMarkdown(
  "/path/to/fulltext.xml",
  "/path/to/fulltext.md",
  "/path/to/meta.json", // optional: updates meta with markdown file info
);
// result.success, result.title, result.sections, result.references

const result2 = await convertArxivHtmlToMarkdown(
  "/path/to/fulltext.html",
  "/path/to/fulltext.md",
);
```

## Metadata & Utilities

### Citation Keys and Directory Names

```typescript
import { generateCitationKey, generateDirName } from "@ncukondo/academic-fulltext";

const key = generateCitationKey("Smith", "2024");           // "smith2024"
const key2 = generateCitationKey("Smith", "2024", [key]);   // "smith2024a"
const dirName = generateDirName(key);                        // "smith2024-a1b2c3d4"
```

### Metadata Management

Each article directory contains a `meta.json` file tracking identifiers, OA status, and downloaded files.

```typescript
import { createMeta, loadMeta, saveMeta, updateMetaFiles } from "@ncukondo/academic-fulltext";

const meta = createMeta({
  citationKey: "smith2024",
  uuid: crypto.randomUUID(),
  title: "Example Article",
  doi: "10.1234/example",
  authors: "Smith, J.",
  year: "2024",
});

await saveMeta("/path/to/meta.json", meta);
const loaded = await loadMeta("/path/to/meta.json");
```

### Path Helpers

```typescript
import {
  getFulltextDir,
  getArticleDir,
  getMetaPath,
  getReadmePath,
} from "@ncukondo/academic-fulltext";

getFulltextDir("/session");                    // "/session/fulltext"
getArticleDir("/session", "smith2024-a1b2c3d4"); // "/session/fulltext/smith2024-a1b2c3d4"
getMetaPath("/session", "smith2024-a1b2c3d4");   // "/session/fulltext/smith2024-a1b2c3d4/meta.json"
```

## Configuration

| Parameter | Required By | Description |
|-----------|------------|-------------|
| `unpaywallEmail` | `discoverOA`, Unpaywall | Your email for the Unpaywall API |
| `coreApiKey` | `discoverOA`, CORE | API key from [CORE](https://core.ac.uk/) |
| `preferSources` | `discoverOA` | Source priority order (default: `["pmc", "arxiv", "unpaywall", "core"]`) |
| `ncbiEmail` | Optional | Email for NCBI E-utilities (falls back to `unpaywallEmail`) |
| `ncbiTool` | Optional | Tool name for NCBI E-utilities |

## Key Types

```typescript
interface OALocation {
  source: "unpaywall" | "pmc" | "arxiv" | "core" | "publisher";
  url: string;
  urlType: "pdf" | "xml" | "html" | "repository";
  version: "published" | "accepted" | "submitted";
  license?: string;
}

type OAStatus = "open" | "closed" | "unknown" | "unchecked";

interface FetchResult {
  dirName: string;
  status: "downloaded" | "failed" | "skipped";
  filesDownloaded?: string[];
  error?: string;
  failureType?: "publisher_block" | "no_sources" | "network_error";
  suggestedUrls?: string[];  // URLs for manual download when automated fails
}

interface FulltextMeta {
  dirName: string;
  citationKey: string;
  uuid: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  title: string;
  authors?: string;
  year?: string;
  oaStatus: OAStatus;
  oaLocations?: OALocation[];
  files: {
    pdf?: FileInfo;
    xml?: FileInfo;
    html?: FileInfo;
    markdown?: FileInfo;
  };
}
```

## License

MIT
