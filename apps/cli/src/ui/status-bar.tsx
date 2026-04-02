import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  permissionMode: string;
  model?: string;
  org?: string;
  tokenCount?: number;
  gitBranch?: string;
}

export function StatusBar({ permissionMode, model, org, tokenCount, gitBranch }: StatusBarProps) {
  const modeColor = permissionMode === "plan" ? "#F5A623" : permissionMode === "yolo" ? "#FF4444" : "#00A1E0";
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color={modeColor} bold>[{permissionMode.toUpperCase()}]</Text>
      {model && <Text dimColor> {model.split("/").pop()}</Text>}
      {org && <Text dimColor> org:{org}</Text>}
      {tokenCount !== undefined && <Text dimColor> {tokenCount}tok</Text>}
      {gitBranch && <Text dimColor> {gitBranch}</Text>}
      <Text dimColor> shift+tab to cycle</Text>
    </Box>
  );
}
