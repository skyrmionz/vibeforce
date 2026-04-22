/**
 * Tiered model routing — select cheap/standard/premium models per turn.
 *
 * Cheap: short follow-ups, confirmations, compaction summarization
 * Standard: code generation, multi-step tasks, debugging
 * Premium: architecture, complex refactors, novel agent design
 */

export type ModelTier = "cheap" | "standard" | "premium";

export interface RoutingConfig {
  enabled: boolean;
  cheap: string;
  standard: string;
  premium: string;
}

export function getDefaultRoutingConfig(): RoutingConfig {
  return {
    enabled: false,
    cheap: "openrouter:google/gemini-2.5-flash",
    standard: "openrouter:anthropic/claude-4.6-sonnet-20260217",
    premium: "openrouter:anthropic/claude-opus-4.6",
  };
}

const PREMIUM_PATTERNS =
  /\b(refactor|architect|design pattern|redesign|migration strategy|restructur|rethink|overhaul|system design)\b/i;

const CHEAP_PATTERNS =
  /^(yes|no|ok|sure|thanks|thank you|got it|looks good|perfect|great|go ahead|do it|yep|nah|k|y|n)\s*[.!?]?\s*$/i;

export function classifyMessage(message: string, turnCount: number): ModelTier {
  if (PREMIUM_PATTERNS.test(message)) return "premium";

  if (message.length < 60 && CHEAP_PATTERNS.test(message.trim())) return "cheap";
  if (turnCount >= 5 && message.length < 80) return "cheap";

  return "standard";
}

export function resolveRoutingModel(
  tier: ModelTier,
  routing: RoutingConfig,
): string {
  switch (tier) {
    case "cheap":
      return routing.cheap;
    case "standard":
      return routing.standard;
    case "premium":
      return routing.premium;
  }
}
