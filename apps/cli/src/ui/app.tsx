import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { HarnessforceAgent, HarnessforceStreamEvent, SessionManager } from "harnessforce-core";
import { readMemorySources } from "harnessforce-core";
import { MarkdownText } from "./markdown.js";
import { StatusBar } from "./status-bar.js";
import {
  getCommands,
  findCommand,
  type CommandContext,
  type SlashCommand,
} from "../commands/registry.js";

interface Message {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
}

interface AppProps {
  agent?: HarnessforceAgent | null;
  agentPromise?: Promise<HarnessforceAgent | null>;
  skillsDir?: string;
  org?: string;
  model?: string;
  sessionManager?: SessionManager;
  initialMessages?: Message[];
  threadId?: string;
  permissionMode?: string;
}

export default function App({ agent: initialAgent, agentPromise, skillsDir = "./skills", org, model: initialModel, sessionManager, initialMessages, threadId, permissionMode: initialPermissionMode }: AppProps) {
  const { exit } = useApp();
  const [agent, setAgent] = useState<HarnessforceAgent | null>(initialAgent ?? null);
  const [agentLoading, setAgentLoading] = useState(!initialAgent && !!agentPromise);
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [input, setInput] = useState("");

  // Resolve agent from promise when it arrives
  useEffect(() => {
    if (agentPromise && !initialAgent) {
      agentPromise.then((resolved) => {
        if (resolved) setAgent(resolved);
        setAgentLoading(false);
      }).catch(() => {
        setAgentLoading(false);
      });
    }
  }, []);
  const [currentPermissionMode, setCurrentPermissionMode] = useState("plan");
  const [isFirstTurn, setIsFirstTurn] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState(initialModel);
  const [selectedHint, setSelectedHint] = useState(-1);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [menuJustSelected, setMenuJustSelected] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
      process.exit(0);
    }

    // ESC to cancel streaming (interrupt the agent)
    if (key.escape && streaming) {
      setStreaming(false);
      setCurrentResponse("");
      setCurrentTool(null);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Interrupted. You can add more context or ask a new question." },
      ]);
      return;
    }

    // Shift+Tab to cycle permission modes
    if (key.shift && key.tab) {
      const modes = ["default", "plan", "yolo"];
      const idx = modes.indexOf(currentPermissionMode);
      const next = modes[(idx + 1) % modes.length]!;
      setCurrentPermissionMode(next);
      return;
    }

    // Up/Down arrow for input history (when NOT in command menu)
    if (!showCommandMenu && key.upArrow && inputHistory.length > 0) {
      const newIndex = historyIndex < inputHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? "");
      return;
    }
    if (!showCommandMenu && key.downArrow) {
      const newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setInput("");
      } else {
        setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? "");
      }
      return;
    }

    // Arrow key navigation for command menu
    if (showCommandMenu && hints.length > 0) {
      if (key.downArrow) {
        setSelectedHint((prev) => Math.min(prev + 1, hints.length - 1));
      } else if (key.upArrow) {
        setSelectedHint((prev) => Math.max(prev - 1, 0));
      } else if (key.return && selectedHint >= 0) {
        // Fill input with selected command and block handleSubmit
        const cmd = hints[selectedHint];
        if (cmd) {
          setInput(`/${cmd.name} `);
          setShowCommandMenu(false);
          setSelectedHint(-1);
          setMenuJustSelected(true);
        }
      } else if (key.escape) {
        setShowCommandMenu(false);
        setSelectedHint(-1);
      }
    }
  });

  // Build command context
  const commandContext: CommandContext = useMemo(
    () => ({
      skillsDir,
      org,
      model: currentModel,
      setModel: (id: string) => setCurrentModel(id),
      clearMessages: () => setMessages([]),
      setPermissionMode: (mode: string) => setCurrentPermissionMode(mode),
    }),
    [skillsDir, org, currentModel]
  );

  // Autocomplete hints: filter commands by prefix when input starts with /
  const hints = useMemo(() => {
    if (!input.startsWith("/") || input.length < 1) {
      setShowCommandMenu(false);
      setSelectedHint(-1);
      return [];
    }
    const partial = input.slice(1).toLowerCase();
    const allCmds = getCommands(skillsDir);
    let filtered: SlashCommand[];
    if (!partial) {
      // Just "/" — show all commands (scrollable)
      filtered = allCmds;
      setShowCommandMenu(true);
    } else {
      filtered = allCmds.filter((c) => c.name.toLowerCase().startsWith(partial));
      setShowCommandMenu(filtered.length > 0);
    }
    // Reset selection when filter changes
    setSelectedHint((prev) => Math.min(prev, filtered.length - 1));
    return filtered;
  }, [input, skillsDir]);

  const handleSubmit = useCallback(
    async (value: string) => {
      // Skip if menu just selected a command (useInput already handled it)
      if (menuJustSelected) {
        setMenuJustSelected(false);
        return;
      }

      const trimmed = value.trim();
      if (!trimmed) return;

      // Add to input history
      setInputHistory(prev => [...prev, trimmed]);
      setHistoryIndex(-1);

      // If streaming, interrupt and queue the new message
      if (streaming) {
        setStreaming(false);
        setCurrentResponse("");
        setCurrentTool(null);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "Interrupted." },
        ]);
        // Fall through to process the new message
      }

      setInput("");

      // ── Shell command (! prefix) ─────────────────────────────────
      if (trimmed.startsWith("!")) {
        const shellCmd = trimmed.slice(1).trim();
        if (!shellCmd) return;
        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
        try {
          const { execSync } = await import("node:child_process");
          const output = execSync(shellCmd, {
            encoding: "utf-8",
            timeout: 30_000,
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"],
          });
          setMessages((prev) => [
            ...prev,
            { role: "system", content: output.trim() || "(no output)" },
          ]);
        } catch (err: any) {
          const output = err.stdout || err.stderr || err.message || "Command failed";
          setMessages((prev) => [
            ...prev,
            { role: "system", content: output.trim() },
          ]);
        }
        return;
      }

      // ── Slash command handling ──────────────────────────────────
      if (trimmed.startsWith("/")) {
        // Just "/" alone — if a hint is selected, use it; otherwise show menu
        if (trimmed === "/" && showCommandMenu && selectedHint >= 0 && hints[selectedHint]) {
          const cmd = hints[selectedHint];
          setInput(`/${cmd.name} `);
          setShowCommandMenu(false);
          setSelectedHint(-1);
          return;
        }
        if (trimmed === "/") {
          // Show scrollable menu hint
          setShowCommandMenu(true);
          setSelectedHint(0);
          return;
        }

        const cmdName = trimmed.slice(1).split(/\s+/)[0]!;
        const cmdArgs = trimmed.slice(1 + cmdName.length).trim();
        const cmd = findCommand(cmdName, skillsDir);

        if (!cmd) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed },
            {
              role: "system",
              content: `Unknown command: /${cmdName}\nType / to see available commands.`,
            },
          ]);
          return;
        }

        // Local command — execute in-process
        if (cmd.type === "local" && cmd.execute) {
          setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
          try {
            const result = await cmd.execute(cmdArgs, commandContext);
            setMessages((prev) => [
              ...prev,
              { role: "system", content: result },
            ]);
          } catch (err: any) {
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Command error: ${err.message}` },
            ]);
          }
          return;
        }

        // Prompt command — expand and send to agent
        if (cmd.type === "prompt" && cmd.getPrompt) {
          const prompt = cmd.getPrompt(cmdArgs);
          setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
          // Fall through to agent streaming with the expanded prompt
          await streamToAgent(prompt);
          return;
        }
      }

      // ── Regular message — send to agent ────────────────────────
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      sessionManager?.appendMessage({ role: "user", content: trimmed, timestamp: new Date().toISOString() });
      await streamToAgent(trimmed);
    },
    [agent, streaming, exit, skillsDir, commandContext]
  );

  const streamToAgent = useCallback(
    async (message: string) => {
      if (!agent) {
        const msg = agentLoading
          ? "Agent is still loading — try again in a moment."
          : "No API key configured. Use /set-key to set it now:\n\n" +
            "  /set-key sk-or-your-key-here\n\n" +
            "Or set it in your terminal before launching:\n\n" +
            "  export OPENROUTER_API_KEY=sk-or-...\n  harnessforce\n\n" +
            "Get a key at https://openrouter.ai/keys\n" +
            "Slash commands still work — type / to see them.";
        setMessages((prev) => [...prev, { role: "system", content: msg }]);
        return;
      }

      // Auto-switch from plan to default after first turn
      if (isFirstTurn) {
        setIsFirstTurn(false);
        setCurrentPermissionMode("default");
      }

      setStreaming(true);
      setCurrentResponse("");
      setCurrentTool(null);

      // Read fresh memory from agent.md on every turn
      const memory = readMemorySources([".harnessforce/agent.md"]);
      const enrichedMessage = memory
        ? `<memory>\n${memory}\n</memory>\n\n${message}`
        : message;

      let fullResponse = "";
      let hadToolCall = false;

      try {
        for await (const event of (agent.stream as any)(enrichedMessage, threadId, currentPermissionMode)) {
          switch (event.type) {
            case "token":
              // If we just came back from a tool call, flush the current response
              // as a separate message and start a new one
              if (hadToolCall && fullResponse.trim()) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: fullResponse },
                ]);
                sessionManager?.appendMessage({ role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
                fullResponse = "";
                setCurrentResponse("");
              }
              hadToolCall = false;
              fullResponse += event.content;
              setCurrentResponse(fullResponse);
              break;
            case "tool_call":
              // Flush any accumulated text before the tool call
              if (fullResponse.trim()) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: fullResponse },
                ]);
                sessionManager?.appendMessage({ role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
                fullResponse = "";
                setCurrentResponse("");
              }
              setCurrentTool(event.name);
              setMessages((prev) => [
                ...prev,
                {
                  role: "tool",
                  content: `Calling ${event.name}...`,
                  toolName: event.name,
                },
              ]);
              sessionManager?.appendMessage({ role: "tool", content: `Calling ${event.name}...`, timestamp: new Date().toISOString() });
              break;
            case "tool_result":
              setCurrentTool(null);
              hadToolCall = true;
              const display =
                event.content.length > 500
                  ? event.content.slice(0, 500) + "..."
                  : event.content;
              setMessages((prev) => [
                ...prev,
                {
                  role: "tool",
                  content: `${event.name} => ${display}`,
                  toolName: event.name,
                },
              ]);
              sessionManager?.appendMessage({ role: "tool", content: `${event.name} => ${display}`, timestamp: new Date().toISOString() });
              break;
            case "approval_required":
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `\u26A0 ${(event as any).tool} requires approval (${(event as any).risk})\n  Args: ${JSON.stringify((event as any).args)}\n  Proceeding automatically in default mode.`,
                },
              ]);
              break;
            case "error":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${event.error}` },
              ]);
              break;
            case "done":
              break;
          }
        }
      } catch (err: any) {
        if (err.message?.includes("402") || err.message?.includes("Insufficient credits")) {
          setMessages(prev => [...prev, {
            role: "system",
            content: "\u26A0 API credits exhausted.\n\nAdd credits: https://openrouter.ai/settings/credits\nOr switch to free model: /model openrouter:qwen/qwen3.6-plus-preview:free"
          }]);
        }
        fullResponse += `\nError: ${err.message}`;
      }

      if (fullResponse) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullResponse },
        ]);
        sessionManager?.appendMessage({ role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
      }

      setCurrentResponse("");
      setCurrentTool(null);
      setStreaming(false);
    },
    [agent, agentLoading, threadId, currentPermissionMode, isFirstTurn]
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Message history */}
      {messages.map((msg, i) => {
        // Show turn separator between assistant/tool messages and user messages
        const prevMsg = i > 0 ? messages[i - 1] : undefined;
        const showSeparator = msg.role === "user" && prevMsg && (prevMsg.role === "assistant" || prevMsg.role === "tool");
        return (
        <Box key={i} flexDirection="column" marginBottom={0}>
          {showSeparator && <Text dimColor>{"  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"}</Text>}
          {msg.role === "user" ? (
            <Text>
              <Text color="#00A1E0" bold>
                {"❯ "}
              </Text>
              <Text>{msg.content}</Text>
            </Text>
          ) : msg.role === "tool" ? (
            <Text dimColor>
              {"  "}
              <Text color="#F5A623">{"⚡ "}</Text>
              {msg.content}
            </Text>
          ) : msg.role === "system" ? (
            <Text>
              {"\n"}
              <Text color="#7C3AED">{msg.content}</Text>
              {"\n"}
            </Text>
          ) : (
            <Box flexDirection="column" marginTop={1} marginBottom={1}>
              <MarkdownText>{msg.content}</MarkdownText>
            </Box>
          )}
        </Box>
        );
      })}

      {/* Streaming response */}
      {streaming && currentResponse && (
        <Box flexDirection="column" marginBottom={0}>
          <MarkdownText>{currentResponse}</MarkdownText>
        </Box>
      )}

      {/* Spinner */}
      {streaming && currentTool && (
        <Box>
          <Text dimColor>
            <Text color="#F5A623">{"⏳ "}</Text>
            Running {currentTool}...
          </Text>
        </Box>
      )}

      {streaming && !currentTool && !currentResponse && (
        <Box>
          <Text color="#00A1E0">{"  Vibing..."}</Text>
        </Box>
      )}

      {/* Agent loading indicator */}
      {agentLoading && messages.length === 0 && (
        <Box>
          <Text color="#00A1E0">{"  Initializing agent..."}</Text>
        </Box>
      )}

      {/* Scrollable command menu */}
      {!streaming && showCommandMenu && hints.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={0}>
          <Text dimColor>{`  ${hints.length} commands (↑↓ navigate, Enter select, Esc close)`}</Text>
          {hints
            .slice(
              Math.max(0, selectedHint - 4),
              Math.max(0, selectedHint - 4) + 10
            )
            .map((cmd, i) => {
              const actualIndex = Math.max(0, selectedHint - 4) + i;
              const isSelected = actualIndex === selectedHint;
              return (
                <Text key={cmd.name}>
                  {isSelected ? (
                    <>
                      <Text color="#00A1E0" bold>{"❯ "}</Text>
                      <Text color="#00A1E0" bold>{"/"}{cmd.name}</Text>
                      <Text>{"  "}{cmd.description}</Text>
                    </>
                  ) : (
                    <>
                      <Text>{"  "}</Text>
                      <Text dimColor>{"/"}{cmd.name}</Text>
                      <Text dimColor>{"  "}{cmd.description}</Text>
                    </>
                  )}
                </Text>
              );
            })}
        </Box>
      )}

      {/* Input container with blue bars */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="#00A1E0">{"━".repeat(process.stdout.columns ? process.stdout.columns - 2 : 60)}</Text>
        <Box paddingX={1}>
          <Text color="#00A1E0" bold>
            {"❯ "}
          </Text>
          <TextInput
            value={input}
            onChange={(val) => {
              // Ctrl+U sends a special character (U+0015) — clear input
              if (val.includes('\u0015')) {
                setInput("");
                return;
              }
              setInput(val);
            }}
            onSubmit={handleSubmit}
            placeholder={streaming ? "Type to interrupt or add context..." : "Ask Harnessforce anything... (type / for commands)"}
          />
        </Box>
        <Text color="#00A1E0">{"━".repeat(process.stdout.columns ? process.stdout.columns - 2 : 60)}</Text>
      </Box>

      {/* Mode + status underneath input */}
      <StatusBar
        permissionMode={currentPermissionMode}
        model={currentModel}
        org={org}
      />
    </Box>
  );
}
