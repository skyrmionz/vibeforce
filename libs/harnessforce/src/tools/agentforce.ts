/**
 * Agentforce Tools — 4 LangChain StructuredTools wrapping `sf agent` CLI commands
 * for publishing, activating, validating, and previewing Agentforce agents.
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** Default timeout for SF CLI commands (2 minutes) */
const SF_TIMEOUT_MS = 120_000;

/** Default target org alias; empty string means use the default org */
const DEFAULT_ALIAS = "";

interface SfCommandResult {
  status: number;
  result: unknown;
  warnings?: string[];
}

/**
 * Execute an `sf` CLI command and return parsed JSON output.
 * Throws with a descriptive message on failure.
 */
async function runSfCommand(command: string): Promise<SfCommandResult> {
  try {
    const { stdout } = await execAsync(command, {
      timeout: SF_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return JSON.parse(stdout) as SfCommandResult;
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    // Try to parse JSON error from stderr
    if (err.stderr) {
      try {
        const parsed = JSON.parse(err.stderr);
        throw new Error(
          `sf command failed: ${parsed.message ?? JSON.stringify(parsed)}`
        );
      } catch {
        // stderr wasn't JSON
      }
      throw new Error(`sf command failed: ${err.stderr}`);
    }
    throw new Error(`sf command failed: ${err.message ?? String(error)}`);
  }
}

function orgFlag(alias?: string): string {
  return alias ? ` -o ${alias}` : "";
}

// ---------------------------------------------------------------------------
// 1. agent_publish
// ---------------------------------------------------------------------------

class AgentPublishTool extends StructuredTool {
  name = "agent_publish";
  description =
    "Publish an Agentforce authoring bundle by name. This makes the agent available for activation.";
  schema = z.object({
    bundleName: z.string().describe("The developer name of the authoring bundle to publish"),
    alias: z.string().optional().describe("Target org alias or username (uses default org if omitted)"),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const cmd = `sf agent publish authoring-bundle --bundle-name ${input.bundleName} --json${orgFlag(input.alias)}`;
    const result = await runSfCommand(cmd);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. agent_activate
// ---------------------------------------------------------------------------

class AgentActivateTool extends StructuredTool {
  name = "agent_activate";
  description =
    "Activate a published Agentforce agent so it can handle conversations.";
  schema = z.object({
    agentName: z.string().describe("The API name of the agent to activate"),
    alias: z.string().optional().describe("Target org alias or username (uses default org if omitted)"),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const cmd = `sf agent activate --agent-name ${input.agentName} --json${orgFlag(input.alias)}`;
    const result = await runSfCommand(cmd);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 3. agent_validate
// ---------------------------------------------------------------------------

class AgentValidateTool extends StructuredTool {
  name = "agent_validate";
  description =
    "Validate an Agentforce authoring bundle on disk before publishing. Checks for syntax errors, missing references, and schema conformance.";
  schema = z.object({
    bundlePath: z.string().describe("Local file path to the authoring bundle directory"),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const cmd = `sf agent validate authoring-bundle --bundle-path ${input.bundlePath} --json`;
    const result = await runSfCommand(cmd);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 4. agent_preview
// ---------------------------------------------------------------------------

class AgentPreviewTool extends StructuredTool {
  name = "agent_preview";
  description =
    "Start an interactive preview session with an Agentforce agent, send a test message, and end the session. Returns the agent's response.";
  schema = z.object({
    agentName: z.string().describe("The API name of the agent to preview"),
    message: z.string().describe("The test message/utterance to send to the agent"),
    alias: z.string().optional().describe("Target org alias or username (uses default org if omitted)"),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const org = orgFlag(input.alias);
    const results: Record<string, unknown> = {};

    // Start preview session
    try {
      const startCmd = `sf agent preview start --agent-name ${input.agentName} --json${org}`;
      const startResult = await runSfCommand(startCmd);
      results.start = startResult;
    } catch (error: unknown) {
      const err = error as { message?: string };
      return JSON.stringify({
        error: `Failed to start preview: ${err.message ?? String(error)}`,
      });
    }

    // Send message
    try {
      // Escape the message for shell safety
      const escapedMessage = input.message.replace(/'/g, "'\\''");
      const sendCmd = `sf agent preview send --message '${escapedMessage}' --json${org}`;
      const sendResult = await runSfCommand(sendCmd);
      results.response = sendResult;
    } catch (error: unknown) {
      const err = error as { message?: string };
      results.sendError = err.message ?? String(error);
    }

    // End preview session (always attempt cleanup)
    try {
      const endCmd = `sf agent preview end --json${org}`;
      const endResult = await runSfCommand(endCmd);
      results.end = endResult;
    } catch (error: unknown) {
      const err = error as { message?: string };
      results.endError = err.message ?? String(error);
    }

    return JSON.stringify(results, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const agentPublish = new AgentPublishTool();
export const agentActivate = new AgentActivateTool();
export const agentValidate = new AgentValidateTool();
export const agentPreview = new AgentPreviewTool();

/** All Agentforce tools as an array, ready to pass to an agent executor */
export const agentforceTools = [
  agentPublish,
  agentActivate,
  agentValidate,
  agentPreview,
];
