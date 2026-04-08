import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { HarnessforceAgent, HarnessforceStreamEvent, SessionManager, ApprovalRequest, ProjectContext } from "harnessforce-core";
import { createHarnessforceAgent, readMemorySources, readConfig, ensureConfigFile, resolveApiKey } from "harnessforce-core";
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
  apiKey?: string;
  systemPrompt?: string;
  projectContext?: ProjectContext;
}

export default function App({ agent: initialAgent, agentPromise, skillsDir = "./skills", org, model: initialModel, sessionManager, initialMessages, threadId, permissionMode: initialPermissionMode, apiKey, systemPrompt, projectContext }: AppProps) {
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
  const [exiting, setExiting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<{ toolName: string; args: Record<string, unknown>; risk: string } | null>(null);

  // Recreate agent when model changes mid-conversation
  const initialModelRef = useRef(initialModel);
  useEffect(() => {
    // Skip the initial render — agent is already created with initialModel
    if (currentModel === initialModelRef.current) return;
    if (!apiKey) return;

    setAgentLoading(true);
    setMessages((prev) => [...prev, { role: "system", content: `Switching model to ${currentModel}...` }]);

    createHarnessforceAgent({
      model: currentModel,
      apiKey,
      skillsDir,
      systemPrompt,
      projectContext,
    })
      .then((newAgent) => {
        setAgent(newAgent);
        initialModelRef.current = currentModel;
        setAgentLoading(false);
        setMessages((prev) => [...prev, { role: "system", content: `Model switched to ${currentModel}.` }]);
      })
      .catch((err) => {
        setAgentLoading(false);
        setMessages((prev) => [...prev, { role: "system", content: `Failed to switch model: ${err.message}` }]);
      });
  }, [currentModel]);

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

  // Raw stdin listener for Ctrl+U (ink-text-input intercepts it before useInput can)
  useEffect(() => {
    const handler = (data: Buffer) => {
      // Ctrl+U = 0x15
      if (data.length === 1 && data[0] === 0x15) {
        setInput("");
      }
    };
    process.stdin.on("data", handler);
    return () => { process.stdin.removeListener("data", handler); };
  }, []);

  // Cache terminal width and bar string to avoid recalculating on every render
  const termWidth = useMemo(() => process.stdout.columns || 80, []);
  const barLine = useMemo(() => "━".repeat(Math.max(termWidth - 2, 20)), [termWidth]);

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
      return; // consume input while approval is pending
    }

    if (key.ctrl && _input === "c") {
      setExiting(true);
      // Extract memories from conversation before exit (best-effort, non-blocking)
      import("harnessforce-core").then(({ extractAndSaveMemories }) => {
        extractAndSaveMemories(messages.map(m => ({ role: m.role, content: m.content }))).catch(() => {});
      }).catch(() => {});
      setTimeout(() => {
        exit();
        process.exit(0);
      }, 200); // Slightly longer to allow memory extraction
      return;
    }

    // ESC to cancel streaming (abort the API stream + preserve partial response)
    if (key.escape && streaming) {
      // Unblock any pending approval before aborting
      agent?.approvalGate?.respond(false);
      setApprovalRequest(null);
      // Abort the underlying API stream (Claude Code pattern)
      abortControllerRef.current?.abort("user-cancel");
      setStreaming(false);
      // Preserve partial response in history
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
      setSelectedHint((prev) => Math.min(prev, hints.length - 1));
    }
  }, [hints]);

  const handleSubmit = useCallback(
    async (value: string) => {
      // Skip if menu just selected a command or menu is still open
      if (menuJustSelected || (showCommandMenu && selectedHint >= 0)) {
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
                "  /provider local        — use Ollama/local models\n\n" +
                "Slash commands still work — type / to see them.";
            } else {
              const [pName] = diagConfig.defaultModel.includes(":")
                ? diagConfig.defaultModel.split(":")
                : ["openrouter"];
              const provider = diagConfig.providers[pName];
              const key = provider?.apiKey ? resolveApiKey(provider.apiKey) : "";
              if (!key && provider?.type !== "local") {
                msg = `Provider "${pName}" is set but has no API key.\n\n` +
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
              <TextInput
                value={input}
                onChange={(val) => {
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
