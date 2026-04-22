/**
 * Cost tracker — estimates session spend based on OpenRouter pricing.
 */

// OpenRouter pricing estimates (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-4.6-sonnet-20260217": { input: 3, output: 15 },
  "anthropic/claude-opus-4.6": { input: 5, output: 25 },
  "openai/gpt-5.4": { input: 2.5, output: 15 },
  "openai/gpt-4.1": { input: 2, output: 8 },
  "google/gemini-2.5-pro": { input: 1.25, output: 5 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "meta-llama/llama-4-maverick": { input: 0.2, output: 0.6 },
  // Direct Anthropic (same pricing, no OpenRouter markup)
  "claude-opus-4.6": { input: 5, output: 25 },
  "claude-sonnet-4.6": { input: 3, output: 15 },
  "claude-haiku-4.5": { input: 0.25, output: 1.25 },
  // Bedrock Gateway (enterprise — effectively zero cost to the user)
  "us.anthropic.claude-opus-4-6-v1": { input: 0, output: 0 },
  "us.anthropic.claude-sonnet-4-6-v1": { input: 0, output: 0 },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0, output: 0 },
};

export type BudgetWarningLevel = "none" | "50%" | "80%" | "exceeded";

export interface BudgetCheck {
  warningLevel: BudgetWarningLevel;
  spent: number;
  budget: number;
  message: string | null;
}

export class CostTracker {
  private usage: Map<string, { input: number; output: number }> = new Map();
  private startTime = Date.now();
  private budget: number;
  private lastWarning: BudgetWarningLevel = "none";

  constructor(budget = 1.0) {
    this.budget = budget;
  }

  setBudget(amount: number): void {
    this.budget = amount;
  }

  addUsage(model: string, inputTokens: number, outputTokens: number): void {
    const existing = this.usage.get(model) ?? { input: 0, output: 0 };
    existing.input += inputTokens;
    existing.output += outputTokens;
    this.usage.set(model, existing);
  }

  checkBudget(): BudgetCheck {
    const spent = this.getTotalCost();
    const ratio = spent / this.budget;

    if (ratio >= 1.0 && this.lastWarning !== "exceeded") {
      this.lastWarning = "exceeded";
      return { warningLevel: "exceeded", spent, budget: this.budget, message: `Session budget exceeded ($${spent.toFixed(4)} / $${this.budget.toFixed(2)}). Consider starting a new session or running /compact.` };
    }
    if (ratio >= 0.8 && this.lastWarning !== "80%" && this.lastWarning !== "exceeded") {
      this.lastWarning = "80%";
      return { warningLevel: "80%", spent, budget: this.budget, message: `Session at 80% of budget ($${spent.toFixed(4)} / $${this.budget.toFixed(2)}). Consider wrapping up or switching to a cheaper model.` };
    }
    if (ratio >= 0.5 && this.lastWarning === "none") {
      this.lastWarning = "50%";
      return { warningLevel: "50%", spent, budget: this.budget, message: `Session at 50% of budget ($${spent.toFixed(4)} / $${this.budget.toFixed(2)}).` };
    }
    return { warningLevel: "none", spent, budget: this.budget, message: null };
  }

  getTotalCost(): number {
    let total = 0;
    for (const [model, tokens] of this.usage) {
      const pricing = PRICING[model] ?? { input: 3, output: 15 };
      total += (tokens.input / 1_000_000) * pricing.input;
      total += (tokens.output / 1_000_000) * pricing.output;
    }
    return total;
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  getUsageSummary(): string {
    if (this.usage.size === 0) return "No usage recorded.";

    const lines: string[] = ["Model                                    | Input     | Output    | Est. Cost"];
    lines.push("-".repeat(lines[0]!.length));

    for (const [model, tokens] of this.usage) {
      const pricing = PRICING[model] ?? { input: 3, output: 15 };
      const cost =
        (tokens.input / 1_000_000) * pricing.input +
        (tokens.output / 1_000_000) * pricing.output;
      const name = model.length > 40 ? model.slice(0, 37) + "..." : model.padEnd(40);
      lines.push(
        `${name} | ${String(tokens.input).padStart(9)} | ${String(tokens.output).padStart(9)} | $${cost.toFixed(4)}`,
      );
    }

    const total = this.getTotalCost();
    const durationSec = (this.getDuration() / 1000).toFixed(1);
    lines.push("-".repeat(lines[1]!.length));
    lines.push(`Total: $${total.toFixed(4)} | Duration: ${durationSec}s`);

    return lines.join("\n");
  }
}

export const sessionCostTracker = new CostTracker();
