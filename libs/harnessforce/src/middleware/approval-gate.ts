/**
 * Approval gate — blocks destructive tool execution until the user
 * approves (Y) or rejects (N) in the TUI.
 *
 * Works by returning a Promise from requestApproval() that only resolves
 * when respond() is called from the TUI side. While the Promise is pending,
 * LangGraph's tool executor is blocked, so the stream pauses naturally.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { riskOf } from "./permissions.js";
import type { PermissionMode, RiskLevel } from "./types.js";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
}

export class ApprovalGate extends EventEmitter {
  private pendingResolver: ((approved: boolean) => void) | null = null;
  private _permissionMode: PermissionMode = "default";
  private _timeoutMs = 60_000;

  get permissionMode(): PermissionMode {
    return this._permissionMode;
  }

  set permissionMode(mode: PermissionMode) {
    this._permissionMode = mode;
  }

  set timeoutMs(ms: number) {
    this._timeoutMs = ms;
  }

  /**
   * Called by the tool wrapper. Blocks until user responds or timeout.
   * Returns true (approved) or false (rejected).
   */
  async requestApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    const risk = riskOf(toolName);

    // yolo: auto-approve everything
    if (this._permissionMode === "yolo") return true;

    // plan: reject write/destructive (backup — tools already filtered)
    if (this._permissionMode === "plan" && risk !== "read") return false;

    // default: auto-approve read/write, confirm destructive
    if (this._permissionMode === "default" && risk !== "destructive") return true;

    // safe: auto-approve read, reject write/destructive
    if (this._permissionMode === "safe" && risk === "read") return true;
    if (this._permissionMode === "safe") return false;

    // Need user confirmation (default mode + destructive tool)
    const request: ApprovalRequest = {
      id: randomUUID(),
      toolName,
      args,
      risk,
    };

    return new Promise<boolean>((resolve) => {
      // Timeout: auto-reject after N seconds
      const timer = setTimeout(() => {
        if (this.pendingResolver) {
          this.pendingResolver = null;
          resolve(false);
          this.emit("approval_timeout", request);
        }
      }, this._timeoutMs);

      this.pendingResolver = (approved: boolean) => {
        clearTimeout(timer);
        resolve(approved);
      };

      // Side channel: notify the TUI to show a prompt
      this.emit("approval_needed", request);
    });
  }

  /**
   * Called by the TUI when the user responds to the approval prompt.
   */
  respond(approved: boolean): void {
    if (this.pendingResolver) {
      const resolver = this.pendingResolver;
      this.pendingResolver = null;
      resolver(approved);
    }
  }

  /** Whether there's a pending approval request. */
  get hasPending(): boolean {
    return this.pendingResolver !== null;
  }
}
