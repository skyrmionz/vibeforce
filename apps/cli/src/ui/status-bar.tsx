import React from "react";
import { Box, Text } from "ink";

const MODE_DESCRIPTIONS: Record<string, string> = {
  plan: "Agent creates a plan for review before execution",
  default: "Agent confirms actions before executing",
  yolo: "Agent is auto-approved for all tool calls",
};

interface StatusBarProps {
  permissionMode: string;
  model?: string;
  org?: string;
  tokenCount?: number;
  gitBranch?: string;
}

export function StatusBar({ permissionMode, model, org, tokenCount, gitBranch }: StatusBarProps) {
  const modeColor = permissionMode === "plan" ? "#F5A623" : permissionMode === "yolo" ? "#FF4444" : "#00A1E0";
  const desc = MODE_DESCRIPTIONS[permissionMode] ?? "";
  return (
    <Box paddingX={1} gap={1}>
      <Text color={modeColor} bold>[{permissionMode.toUpperCase()}]</Text>
      <Text dimColor>{desc}</Text>
      {model && <Text dimColor>• {model.split("/").pop()}</Text>}
      {org && <Text dimColor>• org:{org}</Text>}
      {tokenCount !== undefined && <Text dimColor>• {tokenCount}tok</Text>}
      {gitBranch && <Text dimColor>• {gitBranch}</Text>}
      <Text dimColor>• shift+tab</Text>
    </Box>
  );
}
