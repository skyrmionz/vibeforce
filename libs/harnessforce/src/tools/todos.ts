/**
 * Todo / Planning tool — session-scoped in-memory todo list.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

/** Session-scoped todo storage. */
let sessionTodos: Todo[] = [];

/** Read the current todo list (for slash commands / external access). */
export function getTodos(): Todo[] {
  return sessionTodos;
}

/** Reset todos (useful for testing). */
export function resetTodos(): void {
  sessionTodos = [];
}

function formatTodos(todos: Todo[]): string {
  if (todos.length === 0) return "No todos.";
  const lines = todos.map((t) => {
    const icon =
      t.status === "completed"
        ? "\u2713"
        : t.status === "in_progress"
          ? "\u25C9"
          : "\u2610";
    return `${icon} [${t.id}] ${t.title}`;
  });
  return lines.join("\n");
}

export const writeTodosTool = tool(
  async ({ todos }) => {
    sessionTodos = todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as Todo["status"],
    }));
    return formatTodos(sessionTodos);
  },
  {
    name: "write_todos",
    description:
      "Replace the entire todo list with the provided items. Use this to plan, track progress, and mark tasks complete.",
    schema: z.object({
      todos: z
        .array(
          z.object({
            id: z.string().describe("Unique identifier for the todo"),
            title: z.string().describe("Short description of the task"),
            status: z
              .enum(["pending", "in_progress", "completed"])
              .describe("Current status of the todo"),
          }),
        )
        .describe("The full list of todos (replaces any existing list)"),
    }),
  },
);
