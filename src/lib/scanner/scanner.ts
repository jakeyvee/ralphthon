// Transparent rules engine — pure functions, no DB, no Twilio, no UI.
// Used by both the simulator and the real voice pipeline.

import type {
  RuleEvaluation,
  TranscriptChunk,
  TriggerRule,
} from "@/lib/types";

// Escape regex metacharacters so user-supplied patterns are treated literally.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary tolerant boundary: start/end of string, or any non-alphanumeric.
// Using a character class instead of \b so phrases with apostrophes/spaces
// (e.g. "didn't sleep") match cleanly.
const LEFT_BOUNDARY = "(?:^|[^a-z0-9])";
const RIGHT_BOUNDARY = "(?:$|[^a-z0-9])";

interface CompiledRule {
  rule: TriggerRule;
  regex: RegExp | null;
}

function compileRule(rule: TriggerRule): CompiledRule {
  const cleaned = rule.patterns
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(escapeRegex);
  if (cleaned.length === 0) {
    return { rule, regex: null };
  }
  const body = cleaned.join("|");
  const regex = new RegExp(`${LEFT_BOUNDARY}(${body})${RIGHT_BOUNDARY}`, "i");
  return { rule, regex };
}

export function scanChunk(
  chunk: TranscriptChunk,
  rules: TriggerRule[],
): RuleEvaluation[] {
  const text = chunk.text ?? "";
  return rules.map((rule) => {
    const compiled = compileRule(rule);
    const base: RuleEvaluation = {
      rule_id: rule.id,
      rule_name: rule.name,
      matched: false,
    };
    if (!rule.enabled || !compiled.regex) {
      return base;
    }
    const m = compiled.regex.exec(text);
    if (!m) {
      return base;
    }
    // Group 1 is the matched phrase without the surrounding boundary chars.
    const matched_text = (m[1] ?? m[0]).trim();
    return {
      ...base,
      matched: true,
      matched_text,
    };
  });
}

export interface ChunkScanResult {
  chunk: TranscriptChunk;
  evaluations: RuleEvaluation[];
}

export function scanChunks(
  chunks: TranscriptChunk[],
  rules: TriggerRule[],
): ChunkScanResult[] {
  return chunks.map((chunk) => ({
    chunk,
    evaluations: scanChunk(chunk, rules),
  }));
}
