import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { VibeForceAgent, VibeForceStreamEvent } from "@vibeforce/core";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

interface AppProps {
  agent: VibeForceAgent;
}

export default function App({ agent }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
      process.exit(0);
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || streaming) return;

      if (trimmed.toLowerCase() === "/quit" || trimmed.toLowerCase() === "/exit") {
        exit();
        process.exit(0);
      }

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setStreaming(true);
      setCurrentResponse("");
      setCurrentTool(null);

      let fullResponse = "";

      try {
        for await (const event of agent.stream(trimmed)) {
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
              break;
            case "tool_result":
              setCurrentTool(null);
              // Truncate long tool results for display
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
      }

      setCurrentResponse("");
      setCurrentTool(null);
      setStreaming(false);
    },
    [agent, streaming, exit]
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
            placeholder="Ask VibeForce anything..."
          />
        </Box>
      )}
    </Box>
  );
}
