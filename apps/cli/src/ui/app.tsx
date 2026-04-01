import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { VibeforceAgent, VibeforceStreamEvent, SessionManager } from "vibeforce-core";
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
  agent: VibeforceAgent;
  skillsDir?: string;
  org?: string;
  model?: string;
  sessionManager?: SessionManager;
  initialMessages?: Message[];
}

export default function App({ agent, skillsDir = "./skills", org, model: initialModel, sessionManager, initialMessages }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState(initialModel);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
      process.exit(0);
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
    }),
    [skillsDir, org, currentModel]
  );

  // Autocomplete hints: filter commands by prefix when input starts with /
  const hints = useMemo(() => {
    if (!input.startsWith("/") || input.length < 1) return [];
    const partial = input.slice(1).toLowerCase();
    if (!partial) {
      // Just "/" — show first 5 commands
      return getCommands(skillsDir).slice(0, 5);
    }
    return getCommands(skillsDir)
      .filter((c) => c.name.toLowerCase().startsWith(partial))
      .slice(0, 5);
  }, [input, skillsDir]);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || streaming) return;

      setInput("");

      // ── Slash command handling ──────────────────────────────────
      if (trimmed.startsWith("/")) {
        // Just "/" alone — show all commands
        if (trimmed === "/") {
          const cmds = getCommands(skillsDir);
          const maxName = Math.max(...cmds.map((c) => c.name.length));
          const lines = cmds.map((c) => {
            const tag = c.type === "prompt" ? " (prompt)" : "";
            return `  /${c.name.padEnd(maxName + 2)}${c.description}${tag}`;
          });
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `Available commands:\n\n${lines.join("\n")}\n` },
          ]);
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
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content:
              "No API key configured. Set your OpenRouter key to start chatting:\n\n" +
              "  export OPENROUTER_API_KEY=sk-or-...\n\n" +
              "Or pass it directly:\n\n" +
              "  vibeforce --api-key sk-or-...\n\n" +
              "Get a key at https://openrouter.ai/keys\n" +
              "Slash commands still work — type / to see them.",
          },
        ]);
        return;
      }

      setStreaming(true);
      setCurrentResponse("");
      setCurrentTool(null);

      let fullResponse = "";

      try {
        for await (const event of agent.stream(message)) {
          switch (event.type) {
            case "token":
              fullResponse += event.content;
              setCurrentResponse(fullResponse);
              break;
            case "tool_call":
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
    [agent]
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Message history */}
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={0}>
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
            <Text>
              {"\n"}
              {msg.content}
              {"\n"}
            </Text>
          )}
        </Box>
      ))}

      {/* Streaming response */}
      {streaming && currentResponse && (
        <Box marginBottom={0}>
          <Text>{currentResponse}</Text>
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
          <Text dimColor>{"  Thinking..."}</Text>
        </Box>
      )}

      {/* Autocomplete hints */}
      {!streaming && input.startsWith("/") && hints.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {hints.map((cmd, i) => (
            <Text key={i} dimColor>
              <Text color="#635BFF">{"/"}</Text>
              <Text>{cmd.name}</Text>
              <Text dimColor>{"  "}{cmd.description}</Text>
            </Text>
          ))}
        </Box>
      )}

      {/* Input */}
      {!streaming && (
        <Box marginTop={1}>
          <Text color="#00A1E0" bold>
            {"❯ "}
          </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask Vibeforce anything... (type / for commands)"
          />
        </Box>
      )}
    </Box>
  );
}
