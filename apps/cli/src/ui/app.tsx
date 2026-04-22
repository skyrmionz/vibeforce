import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";
import type { HarnessforceAgent, HarnessforceStreamEvent, SessionManager, ApprovalRequest } from "harnessforce-core";
import { readMemorySources, readConfig, ensureConfigFile, resolveApiKey } from "harnessforce-core";
import { MarkdownText } from "./markdown.js";
import { DiffView } from "./diff.js";
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
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [exiting, setExiting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<{ toolName: string; args: Record<string, unknown>; risk: string } | null>(null);
  const cursorOffset = useRef(0);

  // Listen to approval gate events from the agent
  useEffect(() => {
    if (!agent?.approvalGate) return;
    const gate = agent.approvalGate;

    const onNeeded = (request: ApprovalRequest) => {
      setApprovalRequest({ toolName: request.toolName, args: request.args, risk: request.risk });
    };
    const onTimeout = (request: ApprovalRequest) => {
      setApprovalRequest(null);
      setMessages((prev) => [...prev, {
        role: "system" as const,
        content: `Tool approval timed out (60s). Rejected: ${request.toolName}`,
      }]);
    };

    gate.on("approval_needed", onNeeded);
    gate.on("approval_timeout", onTimeout);
    return () => {
      gate.off("approval_needed", onNeeded);
      gate.off("approval_timeout", onTimeout);
    };
  }, [agent]);

  // Track terminal width reactively so zoom/resize reflows the UI
  const [termWidth, setTermWidth] = useState(() => process.stdout.columns || 80);
  useEffect(() => {
    const onResize = () => {
      process.stdout.write("\x1B[2J\x1B[H");
      setTermWidth(process.stdout.columns || 80);
    };
    process.stdout.on("resize", onResize);
    return () => { process.stdout.removeListener("resize", onResize); };
  }, []);
  const barLine = useMemo(() => "━".repeat(Math.max(termWidth - 2, 20)), [termWidth]);

  // Refs for menu state — declared early so useInput can access them
  const showCommandMenuRef = useRef(false);
  const selectedHintRef = useRef(-1);
  const hintsRef = useRef<SlashCommand[]>([]);
  const handleSubmitRef = useRef<(value: string) => void>(() => {});

  useInput((_input, key) => {
    // Approval prompt: capture Y/N when a destructive tool is pending
    if (approvalRequest && agent?.approvalGate) {
      if (_input === "y" || _input === "Y") {
        agent.approvalGate.respond(true);
        setMessages((prev) => [...prev, { role: "system" as const, content: `Approved: ${approvalRequest.toolName}` }]);
        setApprovalRequest(null);
      } else if (_input === "n" || _input === "N" || key.escape) {
        agent.approvalGate.respond(false);
        setMessages((prev) => [...prev, { role: "system" as const, content: `Rejected: ${approvalRequest.toolName}` }]);
        setApprovalRequest(null);
      }
      return;
    }

    // Ctrl+C — exit
    if (key.ctrl && _input === "c") {
      setExiting(true);
      import("harnessforce-core").then(({ extractAndSaveMemories }) => {
        extractAndSaveMemories(messages.map(m => ({ role: m.role, content: m.content }))).catch(() => {});
      }).catch(() => {});
      setTimeout(() => { exit(); process.exit(0); }, 200);
      return;
    }

    // Ctrl+U — clear line
    if (key.ctrl && _input === "u") {
      setInput("");
      cursorOffset.current = 0;
      return;
    }

    // ESC to cancel streaming
    if (key.escape && streaming) {
      agent?.approvalGate?.respond(false);
      setApprovalRequest(null);
      abortControllerRef.current?.abort("user-cancel");
      setStreaming(false);
      setCurrentResponse((partial) => {
        if (partial.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: partial },
            { role: "system", content: "Interrupted · What should Harnessforce do instead?" },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: "Interrupted · What should Harnessforce do instead?" },
          ]);
        }
        return "";
      });
      setCurrentTool(null);
      return;
    }

    // ESC to close command menu
    if (key.escape && showCommandMenuRef.current) {
      setShowCommandMenu(false);
      setSelectedHint(-1);
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

    // Skip tab key
    if (key.tab) return;

    // Enter — submit or select from menu
    if (key.return) {
      if (showCommandMenuRef.current && selectedHintRef.current >= 0) {
        const cmd = hintsRef.current[selectedHintRef.current];
        if (cmd) {
          const val = `/${cmd.name} `;
          setInput(val);
          cursorOffset.current = val.length;
          setShowCommandMenu(false);
          setSelectedHint(-1);
          return;
        }
      }
      handleSubmitRef.current(input);
      return;
    }

    // Arrow key navigation for command menu
    if (showCommandMenuRef.current && hintsRef.current.length > 0) {
      if (key.downArrow) {
        setSelectedHint((prev) => Math.min(prev + 1, hintsRef.current.length - 1));
        return;
      } else if (key.upArrow) {
        setSelectedHint((prev) => Math.max(prev - 1, 0));
        return;
      }
    }

    // Up/Down arrow for input history (when NOT in command menu)
    if (key.upArrow && inputHistory.length > 0) {
      const newIndex = historyIndex < inputHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      const val = inputHistory[inputHistory.length - 1 - newIndex] ?? "";
      setInput(val);
      cursorOffset.current = val.length;
      return;
    }
    if (key.downArrow) {
      const newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setInput("");
        cursorOffset.current = 0;
      } else {
        const val = inputHistory[inputHistory.length - 1 - newIndex] ?? "";
        setInput(val);
        cursorOffset.current = val.length;
      }
      return;
    }

    // Left/Right arrow for cursor movement
    if (key.leftArrow) {
      cursorOffset.current = Math.max(0, cursorOffset.current - 1);
      setInput(v => v); // trigger re-render
      return;
    }
    if (key.rightArrow) {
      setInput(v => {
        cursorOffset.current = Math.min(v.length, cursorOffset.current + 1);
        return v;
      });
      return;
    }

    // Backspace / Delete
    if (key.backspace || key.delete) {
      if (cursorOffset.current > 0) {
        setInput(v => {
          const next = v.slice(0, cursorOffset.current - 1) + v.slice(cursorOffset.current);
          cursorOffset.current--;
          return next;
        });
      }
      return;
    }

    // Skip other ctrl combos
    if (key.ctrl) return;

    // Regular character input
    if (_input) {
      setInput(v => {
        const next = v.slice(0, cursorOffset.current) + _input + v.slice(cursorOffset.current);
        cursorOffset.current += _input.length;
        return next;
      });
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
    if (!input.startsWith("/") || input.length < 1) return [];
    const partial = input.slice(1).toLowerCase();
    const allCmds = getCommands(skillsDir);
    if (!partial) return allCmds;
    return allCmds.filter((c) => c.name.toLowerCase().startsWith(partial));
  }, [input, skillsDir]);

  // Sync menu visibility state from hints (outside useMemo to avoid re-render loops)
  useEffect(() => {
    if (!input.startsWith("/") || input.length < 1) {
      setShowCommandMenu(false);
      setSelectedHint(-1);
    } else {
      setShowCommandMenu(hints.length > 0);
      // Auto-select first item so Enter always picks something
      setSelectedHint((prev) => {
        if (prev < 0 && hints.length > 0) return 0;
        return Math.min(prev, hints.length - 1);
      });
    }
  }, [hints]);

  // Sync refs with latest state for use inside useInput/handleSubmit
  showCommandMenuRef.current = showCommandMenu;
  selectedHintRef.current = selectedHint;
  hintsRef.current = hints;

  const handleSubmit = useCallback(
    async (value: string) => {

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
      cursorOffset.current = 0;

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
        if (trimmed === "/" && showCommandMenuRef.current && selectedHintRef.current >= 0 && hintsRef.current[selectedHintRef.current]) {
          const cmd = hintsRef.current[selectedHintRef.current];
          setInput(`/${cmd!.name} `);
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
  handleSubmitRef.current = handleSubmit;

  const streamToAgent = useCallback(
    async (message: string) => {
      if (!agent) {
        let msg: string;
        if (agentLoading) {
          msg = "Agent is still loading — try again in a moment.";
        } else {
          // Diagnose what's missing
          try {
            ensureConfigFile();
            const diagConfig = readConfig();
            const providers = Object.keys(diagConfig.providers);
            if (providers.length === 0) {
              msg = "No provider configured.\n\n" +
                "  /provider openrouter   — use OpenRouter (200+ models)\n" +
                "  /provider bedrock      — enterprise Bedrock Gateway (zero cost)\n" +
                "  /provider local        — use Ollama/local models\n\n" +
                "Slash commands still work — type / to see them.";
            } else {
              const [pName] = diagConfig.defaultModel.includes(":")
                ? diagConfig.defaultModel.split(":")
                : ["openrouter"];
              const provider = diagConfig.providers[pName];
              const key = provider?.apiKey ? resolveApiKey(provider.apiKey) : "";
              if (!key && provider?.type !== "local") {
                const isBedrock = pName === "bedrock-gateway" || provider?.baseUrl?.includes("sfproxy") || provider?.baseUrl?.includes("bedrock");
                msg = isBedrock
                  ? `Provider "${pName}" is set but has no auth token.\n\n` +
                    "  /provider bedrock <gateway-url> <auth-token>\n\n" +
                    "Get a token at https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/\n" +
                    "Slash commands still work — type / to see them."
                  : `Provider "${pName}" is set but has no API key.\n\n` +
                    "  /set-key sk-or-your-key-here\n\n" +
                    "Get a key at https://openrouter.ai/keys\n" +
                    "Slash commands still work — type / to see them.";
              } else {
                msg = "Agent failed to initialize. Run /provider to check your setup.";
              }
            }
          } catch {
            msg = "No API key configured. Use /set-key to set it, or /provider for setup help.";
          }
        }
        setMessages((prev) => [...prev, { role: "system", content: msg }]);
        return;
      }

      // Auto-switch from plan to default after first turn
      if (isFirstTurn) {
        setIsFirstTurn(false);
        setCurrentPermissionMode("default");
      }

      // Create AbortController for this turn (Claude Code pattern)
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStreaming(true);
      setCurrentResponse("");
      setCurrentTool(null);

      // Read fresh memory from agent.md on every turn
      const memory = readMemorySources([".harnessforce/agent.md"]);
      let enrichedMessage = message;
      if (memory) {
        enrichedMessage = `<memory>\n${memory}\n</memory>\n\n${enrichedMessage}`;
      }
      enrichedMessage = `<agent_mode>${currentPermissionMode}</agent_mode>\n${enrichedMessage}`;

      let fullResponse = "";
      let hadToolCall = false;
      let toolCallCount = 0;
      const toolCallCounts: Record<string, number> = {};

      try {
        for await (const event of (agent.stream as any)(enrichedMessage, threadId, currentPermissionMode, controller.signal)) {
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
              toolCallCount++;
              toolCallCounts[event.name] = (toolCallCounts[event.name] ?? 0) + 1;
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
              // Approval is now handled by the ApprovalGate side channel.
              // This event type is kept for backward compatibility but the gate
              // blocks tool execution and shows the Y/N prompt via its own events.
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

      // Tool use summary (Claude Code pattern — collapse verbose tool blocks)
      if (toolCallCount >= 3) {
        const summary = Object.entries(toolCallCounts)
          .map(([name, count]) => `${name} ×${count}`)
          .join(", ");
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Used ${toolCallCount} tools: ${summary}` },
        ]);
      }

      setCurrentResponse("");
      setCurrentTool(null);
      setStreaming(false);
    },
    [agent, agentLoading, threadId, currentPermissionMode, isFirstTurn]
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Message history (virtual scroll — only render last 50 messages) */}
      {messages.length > 50 && (
        <Text dimColor>  ↑ {messages.length - 50} older messages hidden</Text>
      )}
      {messages.slice(-50).map((msg, _i) => {
        const i = messages.length > 50 ? _i + messages.length - 50 : _i;
        // Show turn separator between assistant/tool messages and user messages
        const prevMsg = i > 0 ? messages[i - 1] : undefined;
        const showSeparator = msg.role === "user" && prevMsg && (prevMsg.role === "assistant" || prevMsg.role === "tool");
        return (
        <Box key={i} flexDirection="column" marginBottom={0}>
          {showSeparator && <Text dimColor>{"  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"}</Text>}
          {msg.role === "user" ? (
            <Box>
              <Text backgroundColor="#2D3748" color="#FFFFFF">{" ❯ " + msg.content + " ".repeat(Math.max(0, termWidth - msg.content.length - 5))}</Text>
            </Box>
          ) : msg.role === "tool" ? (
            msg.toolName === "edit_file" && msg.content.includes("=>") ? (
              <Box flexDirection="column">
                <Text dimColor>{"  "}<Text color="#F5A623">{"⚡ "}</Text>{msg.content.split("=>")[0]?.trim()}</Text>
                {(() => {
                  // Try to extract old/new from the edit result for diff display
                  const parts = msg.content.split("=>");
                  if (parts.length >= 2) {
                    return <DiffView oldStr={parts[0]?.trim() ?? ""} newStr={parts[1]?.trim() ?? ""} />;
                  }
                  return null;
                })()}
              </Box>
            ) : (
              <Text dimColor>
                {"  "}
                <Text color="#F5A623">{"⚡ "}</Text>
                {msg.content}
              </Text>
            )
          ) : msg.role === "system" ? (
            <Text>
              {"\n"}
              <Text color="#7C3AED">{msg.content}</Text>
              {"\n"}
            </Text>
          ) : (
            <Box flexDirection="column" marginTop={1} marginBottom={0}>
              <MarkdownText>{msg.content}</MarkdownText>
            </Box>
          )}
        </Box>
        );
      })}

      {/* Streaming response */}
      {streaming && currentResponse && (
        <Box flexDirection="column" marginTop={1} marginBottom={0}>
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

      {!exiting && (
        <>
          {/* Thinking/loading — right above input container */}
          {streaming && !currentTool && !currentResponse && (
            <Box marginTop={1} marginBottom={0}>
              <Text color="#00A1E0">{"  Harnessing..."}</Text>
            </Box>
          )}
          {agentLoading && messages.length === 0 && (
            <Box marginTop={1} marginBottom={0}>
              <Text color="#00A1E0">{"  Initializing agent..."}</Text>
            </Box>
          )}

          {/* Approval prompt — shown when a destructive tool is pending */}
          {approvalRequest && (
            <Box flexDirection="column" marginTop={1} paddingX={2} borderStyle="round" borderColor="yellow">
              <Text color="yellow" bold>Tool Approval Required</Text>
              <Text>  Tool: <Text bold>{approvalRequest.toolName}</Text></Text>
              <Text>  Risk: <Text color="red">{approvalRequest.risk}</Text></Text>
              <Text dimColor>  Args: {JSON.stringify(approvalRequest.args, null, 2).slice(0, 200)}</Text>
              <Text color="green" bold>  Y = approve    N = reject    ESC = reject</Text>
            </Box>
          )}

          {/* Input container with blue bars */}
          <Box flexDirection="column" marginTop={0}>
            <Text color="#00A1E0">{barLine}</Text>
            <Box paddingX={1}>
              <Text color="#00A1E0" bold>
                {"❯ "}
              </Text>
              <Text>
                {input.length > 0
                  ? (() => {
                      const before = input.slice(0, cursorOffset.current);
                      const cursorChar = input[cursorOffset.current] ?? " ";
                      const after = input.slice(cursorOffset.current + 1);
                      return before + chalk.inverse(cursorChar) + after;
                    })()
                  : chalk.inverse(" ") + chalk.gray(streaming ? "Type to interrupt or add context..." : "Ask Harnessforce anything... (type / for commands)")}
              </Text>
            </Box>
            <Text color="#00A1E0">{barLine}</Text>
          </Box>

          {/* Mode + status underneath input */}
          <StatusBar
            permissionMode={currentPermissionMode}
            model={currentModel}
            org={org}
          />
        </>
      )}

      {exiting && (
        <Box marginTop={1}>
          <Text dimColor>  Session ended.</Text>
        </Box>
      )}
    </Box>
  );
}
