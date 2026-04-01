/**
 * Session persistence — save and resume conversations.
 *
 * Sessions are stored as JSONL files in .vibeforce/sessions/{id}.jsonl
 * where each line is a JSON-encoded message with a timestamp.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
  role: string;
  content: string;
  timestamp?: string;
}

export interface Session {
  /** Unique session identifier. */
  id: string;
  /** ISO timestamp of first message. */
  startedAt: string;
  /** ISO timestamp of most recent message. */
  lastMessageAt: string;
  /** Total number of messages in the session. */
  messageCount: number;
  /** Optional summary of the session. */
  summary?: string;
}

export interface SessionManager {
  /** Save messages to the current session. Returns the session ID. */
  save(messages: Message[]): Promise<string>;
  /** Load all messages from a session by ID. */
  load(sessionId: string): Promise<Message[]>;
  /** List all saved sessions with metadata. */
  list(): Promise<Session[]>;
  /** Get the current session ID, or null if none active. */
  getCurrent(): string | null;
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

function messageToJsonl(msg: Message): string {
  return JSON.stringify({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp ?? new Date().toISOString(),
  });
}

function parseJsonlLine(line: string): Message | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Message;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session manager factory
// ---------------------------------------------------------------------------

/**
 * Create a session manager that persists conversations as JSONL files.
 *
 * @param sessionsDir - Directory to store session files (default: .vibeforce/sessions)
 */
export function createSessionManager(
  sessionsDir: string = ".vibeforce/sessions",
): SessionManager {
  let currentSessionId: string | null = null;

  function ensureDir(): void {
    mkdirSync(sessionsDir, { recursive: true });
  }

  function sessionPath(id: string): string {
    return join(sessionsDir, `${id}.jsonl`);
  }

  async function save(messages: Message[]): Promise<string> {
    ensureDir();

    if (!currentSessionId) {
      currentSessionId = randomUUID();
    }

    const filePath = sessionPath(currentSessionId);

    // Write all messages (overwrite style: write fresh each time)
    const lines = messages.map(messageToJsonl).join("\n") + "\n";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, lines, "utf-8");

    return currentSessionId;
  }

  async function load(sessionId: string): Promise<Message[]> {
    const filePath = sessionPath(sessionId);
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const messages: Message[] = [];

    for (const line of lines) {
      const msg = parseJsonlLine(line);
      if (msg) messages.push(msg);
    }

    currentSessionId = sessionId;
    return messages;
  }

  async function list(): Promise<Session[]> {
    ensureDir();

    let files: string[];
    try {
      files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return [];
    }

    const sessions: Session[] = [];

    for (const file of files) {
      const filePath = join(sessionsDir, file);
      const id = basename(file, ".jsonl");

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim());

        if (lines.length === 0) continue;

        const firstMsg = parseJsonlLine(lines[0]!);
        const lastMsg = parseJsonlLine(lines[lines.length - 1]!);

        sessions.push({
          id,
          startedAt: firstMsg?.timestamp ?? "unknown",
          lastMessageAt: lastMsg?.timestamp ?? "unknown",
          messageCount: lines.length,
        });
      } catch {
        // Skip corrupt session files
      }
    }

    // Sort by most recent first
    sessions.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime(),
    );

    return sessions;
  }

  function getCurrent(): string | null {
    return currentSessionId;
  }

  return { save, load, list, getCurrent };
}

/**
 * Append a single message to the current session file.
 * Useful for incremental saves after each message exchange.
 */
export function appendMessage(
  sessionsDir: string,
  sessionId: string,
  message: Message,
): void {
  mkdirSync(sessionsDir, { recursive: true });
  const filePath = join(sessionsDir, `${sessionId}.jsonl`);
  appendFileSync(filePath, messageToJsonl(message) + "\n", "utf-8");
}
