/**
 * Salesforce documentation tools — 2 LangChain StructuredTools.
 *
 * Tools for searching and reading cached Salesforce PDF guides:
 *   sf_docs_search, sf_docs_read
 *
 * PDFs are stored as plain text in ~/.vibeforce/cache/docs/ after download.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default directory for cached doc text files. */
const DEFAULT_DOCS_DIR = join(homedir(), ".vibeforce", "cache", "docs");

/** Known guide slugs and their file mappings. */
const GUIDE_MAP: Record<string, string> = {
  apex: "apexcode.txt",
  apexcode: "apexcode.txt",
  metadata: "api_meta.txt",
  api_meta: "api_meta.txt",
  rest: "api_rest.txt",
  api_rest: "api_rest.txt",
  lwc: "lightning.txt",
  lightning: "lightning.txt",
  sfdx: "sfdx_cli_reference.txt",
  sfdx_cli_reference: "sfdx_cli_reference.txt",
  cli: "sfdx_cli_reference.txt",
  tooling: "api_tooling.txt",
  api_tooling: "api_tooling.txt",
};

/**
 * Reads the text content of a cached guide file.
 * Returns null if the file doesn't exist.
 */
async function readGuideText(
  guide: string,
  docsDir: string = DEFAULT_DOCS_DIR,
): Promise<string | null> {
  const filename = GUIDE_MAP[guide.toLowerCase()] ?? `${guide}.txt`;
  const filepath = join(docsDir, filename);
  try {
    return await readFile(filepath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Lists all available guide text files in the docs cache directory.
 */
async function listAvailableGuides(
  docsDir: string = DEFAULT_DOCS_DIR,
): Promise<string[]> {
  try {
    const files = await readdir(docsDir);
    return files.filter((f) => f.endsWith(".txt"));
  } catch {
    return [];
  }
}

/**
 * Extracts matching sections from text content using simple substring search.
 * Returns snippets with surrounding context lines.
 */
function searchText(
  text: string,
  query: string,
  contextLines: number = 5,
  maxResults: number = 10,
): string[] {
  const lines = text.split("\n");
  const queryLower = query.toLowerCase();
  const results: string[] = [];
  let i = 0;

  while (i < lines.length && results.length < maxResults) {
    if (lines[i].toLowerCase().includes(queryLower)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      const snippet = lines.slice(start, end).join("\n");
      results.push(`[Line ${i + 1}]\n${snippet}`);
      // Skip past this match's context to avoid overlapping snippets
      i = end;
    } else {
      i++;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 1. sf_docs_search
// ---------------------------------------------------------------------------

export class SfDocsSearchTool extends StructuredTool {
  name = "sf_docs_search";
  description =
    "Search cached Salesforce PDF guides for information. Returns matching sections with context. " +
    'Available guides: apex, metadata, rest, lwc, sfdx/cli, tooling. If no guide specified, searches all.';
  schema = z.object({
    query: z.string().describe("Search query (substring match)"),
    guide: z
      .string()
      .optional()
      .describe(
        'Guide to search in (e.g. "apex", "metadata", "rest", "lwc", "sfdx", "tooling"). Omit to search all.',
      ),
  });

  private docsDir: string;

  constructor(docsDir?: string) {
    super();
    this.docsDir = docsDir ?? DEFAULT_DOCS_DIR;
  }

  async _call({
    query,
    guide,
  }: z.infer<typeof this.schema>): Promise<string> {
    // If a specific guide is requested, search only that guide
    if (guide) {
      const text = await readGuideText(guide, this.docsDir);
      if (!text) {
        const available = await listAvailableGuides(this.docsDir);
        return JSON.stringify({
          error: `Guide "${guide}" not found in cache.`,
          availableGuides: available,
          hint: "Run 'vibeforce init' to download Salesforce documentation.",
        });
      }

      const matches = searchText(text, query);
      if (matches.length === 0) {
        return JSON.stringify({
          guide,
          query,
          matches: 0,
          message: `No matches found for "${query}" in ${guide} guide.`,
        });
      }

      return JSON.stringify({
        guide,
        query,
        matches: matches.length,
        sections: matches,
      });
    }

    // Search all available guides
    const guides = await listAvailableGuides(this.docsDir);
    if (guides.length === 0) {
      return JSON.stringify({
        error: "No documentation cached.",
        hint: "Run 'vibeforce init' to download Salesforce documentation.",
      });
    }

    const allResults: Array<{ guide: string; matches: string[] }> = [];

    for (const file of guides) {
      const text = await readFile(join(this.docsDir, file), "utf-8").catch(
        () => null,
      );
      if (!text) continue;

      const matches = searchText(text, query, 5, 5); // fewer per guide when searching all
      if (matches.length > 0) {
        allResults.push({
          guide: file.replace(".txt", ""),
          matches,
        });
      }
    }

    if (allResults.length === 0) {
      return JSON.stringify({
        query,
        matches: 0,
        message: `No matches found for "${query}" across ${guides.length} guides.`,
      });
    }

    return JSON.stringify({
      query,
      totalGuides: allResults.length,
      results: allResults,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. sf_docs_read
// ---------------------------------------------------------------------------

export class SfDocsReadTool extends StructuredTool {
  name = "sf_docs_read";
  description =
    "Read a specific section or page range of a cached Salesforce guide. " +
    "Use after sf_docs_search to read more context around a match.";
  schema = z.object({
    guide: z
      .string()
      .describe(
        'Guide to read (e.g. "apex", "metadata", "rest", "lwc", "sfdx", "tooling")',
      ),
    section: z
      .string()
      .optional()
      .describe(
        "Section heading to search for and read (e.g. 'DML Statements', 'SOQL Queries')",
      ),
    page: z
      .number()
      .optional()
      .describe(
        "Approximate page number to read (each 'page' is ~80 lines of text). 1-indexed.",
      ),
  });

  private docsDir: string;

  constructor(docsDir?: string) {
    super();
    this.docsDir = docsDir ?? DEFAULT_DOCS_DIR;
  }

  async _call({
    guide,
    section,
    page,
  }: z.infer<typeof this.schema>): Promise<string> {
    const text = await readGuideText(guide, this.docsDir);
    if (!text) {
      const available = await listAvailableGuides(this.docsDir);
      return JSON.stringify({
        error: `Guide "${guide}" not found in cache.`,
        availableGuides: available,
        hint: "Run 'vibeforce init' to download Salesforce documentation.",
      });
    }

    const lines = text.split("\n");
    const LINES_PER_PAGE = 80;

    // If a section heading is specified, find it and return surrounding content
    if (section) {
      const sectionLower = section.toLowerCase();
      let bestLineIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(sectionLower)) {
          bestLineIdx = i;
          break;
        }
      }

      if (bestLineIdx === -1) {
        return JSON.stringify({
          guide,
          section,
          error: `Section "${section}" not found.`,
          hint: "Try sf_docs_search to find the exact section heading.",
        });
      }

      // Return ~2 pages of content starting from the section match
      const start = Math.max(0, bestLineIdx - 2);
      const end = Math.min(lines.length, bestLineIdx + LINES_PER_PAGE * 2);
      const content = lines.slice(start, end).join("\n");

      return JSON.stringify({
        guide,
        section,
        startLine: start + 1,
        endLine: end,
        totalLines: lines.length,
        content,
      });
    }

    // If a page number is specified, return that page
    if (page !== undefined) {
      const pageIdx = Math.max(1, page) - 1;
      const start = pageIdx * LINES_PER_PAGE;
      const end = Math.min(lines.length, start + LINES_PER_PAGE);

      if (start >= lines.length) {
        return JSON.stringify({
          guide,
          page,
          error: `Page ${page} is beyond the end of the document.`,
          totalPages: Math.ceil(lines.length / LINES_PER_PAGE),
        });
      }

      const content = lines.slice(start, end).join("\n");
      return JSON.stringify({
        guide,
        page,
        startLine: start + 1,
        endLine: end,
        totalLines: lines.length,
        totalPages: Math.ceil(lines.length / LINES_PER_PAGE),
        content,
      });
    }

    // No section or page — return table of contents (first 3 pages)
    const content = lines.slice(0, LINES_PER_PAGE * 3).join("\n");
    return JSON.stringify({
      guide,
      totalLines: lines.length,
      totalPages: Math.ceil(lines.length / LINES_PER_PAGE),
      content,
      hint: "Use 'page' or 'section' parameter to read specific parts.",
    });
  }
}

// ---------------------------------------------------------------------------
// Export instances
// ---------------------------------------------------------------------------

export const docsTools = [new SfDocsSearchTool(), new SfDocsReadTool()];
