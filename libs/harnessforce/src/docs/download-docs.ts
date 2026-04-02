/**
 * Download key Salesforce PDF documentation and convert to plain text.
 *
 * This script is run by `harnessforce init` to cache documentation locally.
 * PDFs are downloaded to ~/.harnessforce/cache/docs/ and extracted to .txt files.
 *
 * Usage:
 *   npx tsx libs/harnessforce/src/docs/download-docs.ts
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DOCS_DIR = join(homedir(), ".harnessforce", "cache", "docs");

interface DocSource {
  /** Short slug used to reference this guide (e.g. "apex", "metadata"). */
  slug: string;
  /** Human-readable name. */
  name: string;
  /** Download URL for the PDF. */
  url: string;
}

const DOC_SOURCES: DocSource[] = [
  {
    slug: "api_meta",
    name: "Metadata API Developer Guide",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/api_meta.pdf",
  },
  {
    slug: "apexcode",
    name: "Apex Developer Guide",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/apexcode.pdf",
  },
  {
    slug: "lightning",
    name: "Lightning Web Components Developer Guide",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/lightning.pdf",
  },
  {
    slug: "api_rest",
    name: "REST API Developer Guide",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/api_rest.pdf",
  },
  {
    slug: "sfdx_cli_reference",
    name: "Salesforce CLI Reference",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/sfdx_cli_reference.pdf",
  },
  {
    slug: "api_tooling",
    name: "Tooling API Developer Guide",
    url: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/api_tooling.pdf",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a file from a URL and return its contents as a Buffer.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extract text from a PDF buffer.
 *
 * Uses pdf-parse if available, otherwise falls back to a basic regex-based
 * extraction from the raw PDF stream (which captures most readable text).
 */
async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  // Try pdf-parse first (best quality)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = (await import(/* webpackIgnore: true */ "pdf-parse" as string)) as
      | { default: (buf: Buffer) => Promise<{ text: string }> }
      | ((buf: Buffer) => Promise<{ text: string }>);
    const parseFn =
      typeof pdfParse === "function" ? pdfParse : pdfParse.default;
    const data = await parseFn(pdfBuffer);
    return data.text;
  } catch {
    // pdf-parse not installed — fall back to basic extraction
  }

  // Fallback: regex-based text extraction from PDF streams.
  // This is rough but captures most textual content from uncompressed streams.
  const raw = pdfBuffer.toString("latin1");
  const textChunks: string[] = [];

  // Extract text between BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract parenthesized strings (Tj / TJ operators)
    const tjRegex = /\(([^)]*)\)/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = tjMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\([()])/g, "$1");
      if (decoded.trim()) {
        textChunks.push(decoded);
      }
    }
  }

  if (textChunks.length > 0) {
    return textChunks.join("\n");
  }

  return "[Could not extract text from PDF. Install pdf-parse for better results: npm install pdf-parse]";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function downloadDocs(options?: {
  force?: boolean;
  docsDir?: string;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const docsDir = options?.docsDir ?? DOCS_DIR;
  const force = options?.force ?? false;
  const log = options?.onProgress ?? console.log;

  await mkdir(docsDir, { recursive: true });

  log(`Downloading Salesforce documentation to ${docsDir}...`);

  for (const doc of DOC_SOURCES) {
    const txtPath = join(docsDir, `${doc.slug}.txt`);

    if (!force && (await fileExists(txtPath))) {
      log(`  [skip] ${doc.name} — already cached`);
      continue;
    }

    log(`  [download] ${doc.name}...`);

    try {
      const pdfBuffer = await downloadFile(doc.url);
      log(`  [extract] Extracting text from ${doc.slug}.pdf...`);
      const text = await extractTextFromPdf(pdfBuffer);
      await writeFile(txtPath, text, "utf-8");
      log(`  [done] ${doc.name} — ${text.length} characters`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  [error] ${doc.name}: ${message}`);
    }
  }

  log("Documentation download complete.");
}

/** Export the doc sources list for other modules. */
export { DOC_SOURCES, DOCS_DIR };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("download-docs.ts") ||
    process.argv[1].endsWith("download-docs.js"));

if (isDirectRun) {
  const force = process.argv.includes("--force");
  downloadDocs({ force }).catch((err) => {
    console.error("Failed to download docs:", err);
    process.exit(1);
  });
}
