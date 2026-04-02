import React from "react";
import { Text } from "ink";

/**
 * Render a markdown string as styled Ink <Text> elements.
 * Handles: **bold**, `code`, ## headings, - list items, ```code blocks```
 */
export function MarkdownText({ children }: { children: string }): React.ReactElement {
  const lines = children.split("\n");
  const elements: React.ReactElement[] = [];

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
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

    // Empty line — minimal spacing (no extra gap)
    if (!line.trim()) {
      elements.push(<Text key={i}>{""}</Text>);
      continue;
    }

    // Regular text with inline formatting
    elements.push(<Text key={i}>{renderInline(line, i)}</Text>);
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
