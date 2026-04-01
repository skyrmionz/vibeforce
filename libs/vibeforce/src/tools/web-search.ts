/**
 * Web search and fetch tools — look up documentation, Stack Exchange answers,
 * and other web content.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// web_search — search the web via DuckDuckGo HTML
// ---------------------------------------------------------------------------

export const webSearchTool = tool(
  async ({ query, maxResults }) => {
    const limit = maxResults ?? 5;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Vibeforce/1.0; +https://github.com/vibeforce)",
        },
      });

      if (!response.ok) {
        return `Search failed with status ${response.status}`;
      }

      const html = await response.text();

      // Parse results from DuckDuckGo HTML response
      const results: { title: string; url: string; snippet: string }[] = [];
      const resultRegex =
        /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
        const rawUrl = match[1] ?? "";
        const title = (match[2] ?? "").replace(/<[^>]+>/g, "").trim();
        const snippet = (match[3] ?? "").replace(/<[^>]+>/g, "").trim();

        // DuckDuckGo wraps URLs in a redirect — extract the actual URL
        const udParam = new URL(rawUrl, "https://duckduckgo.com").searchParams.get("uddg");
        const cleanUrl = udParam ? decodeURIComponent(udParam) : rawUrl;

        if (title && cleanUrl) {
          results.push({ title, url: cleanUrl, snippet });
        }
      }

      if (results.length === 0) {
        return `No results found for: ${query}`;
      }

      return results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`,
        )
        .join("\n\n");
    } catch (err: any) {
      return `Search error: ${err.message}`;
    }
  },
  {
    name: "web_search",
    description:
      "Search the web for information. Useful for looking up Salesforce documentation, Stack Exchange answers, best practices, and troubleshooting.",
    schema: z.object({
      query: z.string().describe("Search query string"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    }),
  },
);

// ---------------------------------------------------------------------------
// web_fetch — fetch a URL and convert to plain text
// ---------------------------------------------------------------------------

export const webFetchTool = tool(
  async ({ url, maxLength }) => {
    const limit = maxLength ?? 10_000;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Vibeforce/1.0; +https://github.com/vibeforce)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return `Fetch failed with status ${response.status}: ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();

      // For JSON responses, return formatted JSON
      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(body);
          const formatted = JSON.stringify(json, null, 2);
          return formatted.length > limit
            ? formatted.slice(0, limit) + "\n... (truncated)"
            : formatted;
        } catch {
          // Fall through to text handling
        }
      }

      // Strip HTML tags for HTML responses
      let text = body;
      if (contentType.includes("html")) {
        // Remove script and style blocks entirely
        text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
        text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
        text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
        text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
        text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");

        // Convert some elements to markdown-ish equivalents
        text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n## $1\n");
        text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
        text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
        text = text.replace(/<br\s*\/?>/gi, "\n");
        text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

        // Remove all remaining HTML tags
        text = text.replace(/<[^>]+>/g, "");

        // Clean up whitespace
        text = text.replace(/&nbsp;/g, " ");
        text = text.replace(/&amp;/g, "&");
        text = text.replace(/&lt;/g, "<");
        text = text.replace(/&gt;/g, ">");
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        text = text.replace(/\n{3,}/g, "\n\n");
        text = text.trim();
      }

      return text.length > limit
        ? text.slice(0, limit) + "\n... (truncated)"
        : text;
    } catch (err: any) {
      return `Fetch error: ${err.message}`;
    }
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and return its content as plain text. HTML is stripped and converted to readable text. Useful for reading documentation pages, blog posts, and API references.",
    schema: z.object({
      url: z.string().describe("The URL to fetch"),
      maxLength: z
        .number()
        .optional()
        .describe(
          "Maximum character length of returned content (default: 10000)",
        ),
    }),
  },
);

/** Both web tools. */
export const webTools = [webSearchTool, webFetchTool];
