import React from "react";
import { Text } from "ink";

/**
 * Check if a line is a markdown table row (starts and ends with |, or starts with |).
 */
function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

/**
 * Check if a line is a table separator row (e.g. |---|---|)
 */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s\-:|]+\|\s*$/.test(line);
}

/**
 * Parse a table row into cells.
 */
function parseTableCells(line: string): string[] {
  return line.split("|").slice(1, -1).map(c => c.trim());
}

/**
 * Strip markdown formatting for width calculation.
 */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/**
 * Render collected table lines into formatted <Text> elements.
 */
function renderTable(tableLines: string[], startKey: number): React.ReactElement[] {
  // Filter out separator rows, keep data rows
  const dataRows = tableLines.filter(l => !isSeparatorRow(l));
  if (dataRows.length === 0) return [];

  const parsed = dataRows.map(parseTableCells);
  const colCount = Math.max(...parsed.map(r => r.length));

  // Calculate column widths
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.max(...parsed.map(r => stripMarkdown(r[c] ?? "").length), 0);
  }

  const elements: React.ReactElement[] = [];
  const separator = "  " + colWidths.map(w => "─".repeat(w + 2)).join("┬") + "";

  parsed.forEach((cells, rowIdx) => {
    // Header separator after first row
    if (rowIdx === 1) {
      elements.push(<Text key={`tsep-${startKey}`} dimColor>{separator}</Text>);
    }

    const rowStr = "  " + cells.map((cell, c) => {
      const plain = stripMarkdown(cell);
      const pad = (colWidths[c] ?? 0) - plain.length;
      return " " + cell + " ".repeat(Math.max(pad + 1, 1));
    }).join("│");

    if (rowIdx === 0) {
      // Header row — bold
      elements.push(
        <Text key={`tr-${startKey}-${rowIdx}`} bold color="#00A1E0">
          {rowStr}
        </Text>
      );
    } else {
      elements.push(
        <Text key={`tr-${startKey}-${rowIdx}`}>
          {rowStr}
        </Text>
      );
    }
  });

  return elements;
}

/**
 * Render a markdown string as styled Ink <Text> elements.
 * Handles: **bold**, `code`, ## headings, - list items, ```code blocks```, | tables |
 */
export function MarkdownText({ children }: { children: string }): React.ReactElement {
  const lines = children.split("\n");
  const elements: React.ReactElement[] = [];

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.trimStart().startsWith("```")) {
      // Flush table buffer if any
      if (tableBuffer.length > 0) {
        elements.push(...renderTable(tableBuffer, i - tableBuffer.length));
        tableBuffer = [];
      }
      if (inCodeBlock) {
        elements.push(
          <Text key={`cb-${i}`} color="#A0A0A0">
            {codeBlockLines.join("\n")}
          </Text>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Table row — collect into buffer
    if (isTableRow(line)) {
      tableBuffer.push(line);
      continue;
    }

    // Flush table buffer if we hit a non-table line
    if (tableBuffer.length > 0) {
      elements.push(...renderTable(tableBuffer, i - tableBuffer.length));
      tableBuffer = [];
    }

    // Heading ##
    if (line.match(/^#{1,3}\s/)) {
      const text = line.replace(/^#{1,3}\s+/, "");
      elements.push(
        <Text key={i} bold color="#00A1E0">
          {text}
        </Text>
      );
      continue;
    }

    // List item -
    if (line.match(/^\s*-\s/)) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const text = line.replace(/^\s*-\s+/, "");
      elements.push(
        <Text key={i}>
          {indent}{"  • "}{renderInline(text, i)}
        </Text>
      );
      continue;
    }

    // Empty line — skip consecutive blanks, render single blank as newline only
    if (!line.trim()) {
      const lastEl = elements[elements.length - 1];
      const isLastBlank = lastEl?.key?.toString().startsWith("blank-");
      if (!isLastBlank && elements.length > 0) {
        elements.push(<Text key={`blank-${i}`}>{""}</Text>);
      }
      continue;
    }

    // Regular text with inline formatting
    elements.push(<Text key={i}>{renderInline(line, i)}</Text>);
  }

  // Flush remaining table buffer
  if (tableBuffer.length > 0) {
    elements.push(...renderTable(tableBuffer, lines.length));
  }

  // Close unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <Text key="cb-end" color="#A0A0A0">
        {codeBlockLines.join("\n")}
      </Text>
    );
  }

  return <>{elements.map((el, i) => <Text key={i}>{el}{"\n"}</Text>)}</>;
}

/**
 * Render inline markdown: **bold**, `code`
 */
function renderInline(text: string, lineKey: number): React.ReactElement {
  // Split on **bold** and `code` patterns
  const parts: React.ReactElement[] = [];
  let remaining = text;
  let partIndex = 0;

  while (remaining.length > 0) {
    // Check for **bold**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Check for `code`
    const codeMatch = remaining.match(/`([^`]+)`/);

    // Find which comes first
    const boldIdx = boldMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (boldIdx === Infinity && codeIdx === Infinity) {
      // No more patterns — push rest as plain text
      parts.push(<Text key={`${lineKey}-${partIndex++}`}>{remaining}</Text>);
      break;
    }

    if (boldIdx <= codeIdx && boldMatch) {
      // Bold comes first
      if (boldIdx > 0) {
        parts.push(<Text key={`${lineKey}-${partIndex++}`}>{remaining.slice(0, boldIdx)}</Text>);
      }
      parts.push(<Text key={`${lineKey}-${partIndex++}`} bold>{boldMatch[1]}</Text>);
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      // Code comes first
      if (codeIdx > 0) {
        parts.push(<Text key={`${lineKey}-${partIndex++}`}>{remaining.slice(0, codeIdx)}</Text>);
      }
      parts.push(<Text key={`${lineKey}-${partIndex++}`} color="#00A1E0">{codeMatch[1]}</Text>);
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return <>{parts}</>;
}
