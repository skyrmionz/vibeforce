import React from "react";
import { Text } from "ink";

/**
 * Render a simple unified diff with red (removed) and green (added) lines.
 * Used for edit_file tool results.
 */
export function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }): React.ReactElement {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const elements: React.ReactElement[] = [];

  // Find common prefix and suffix to minimize diff
  let prefixLen = 0;
  while (prefixLen < oldLines.length && prefixLen < newLines.length && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removedLines = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const addedLines = newLines.slice(prefixLen, newLines.length - suffixLen);

  // Context line before diff
  if (prefixLen > 0) {
    const ctx = oldLines[prefixLen - 1] ?? "";
    elements.push(<Text key="ctx-before" dimColor>  {ctx}</Text>);
  }

  // Removed lines
  for (let i = 0; i < removedLines.length; i++) {
    elements.push(
      <Text key={`rm-${i}`} color="#FF6B6B">{"- "}{removedLines[i]}</Text>
    );
  }

  // Added lines
  for (let i = 0; i < addedLines.length; i++) {
    elements.push(
      <Text key={`add-${i}`} color="#51CF66">{"+ "}{addedLines[i]}</Text>
    );
  }

  // Context line after diff
  if (suffixLen > 0) {
    const ctx = oldLines[oldLines.length - suffixLen] ?? "";
    elements.push(<Text key="ctx-after" dimColor>  {ctx}</Text>);
  }

  if (elements.length === 0) {
    return <Text dimColor>  (no visible changes)</Text>;
  }

  return <>{elements.map((el, i) => <Text key={i}>{el}{"\n"}</Text>)}</>;
}
