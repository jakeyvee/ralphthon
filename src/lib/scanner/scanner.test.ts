// Unit tests for the transcript scanner.
// Run via: node --test --import tsx src/lib/scanner/scanner.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESET_RULES } from "@/lib/rules/preset";
import { scanChunk, scanChunks } from "@/lib/scanner/scanner";
import type { TranscriptChunk, TriggerRule } from "@/lib/types";

function chunk(text: string, overrides: Partial<TranscriptChunk> = {}): TranscriptChunk {
  return {
    id: overrides.id ?? "c1",
    call_id: overrides.call_id ?? "call-1",
    source: overrides.source ?? "elder",
    text,
    sequence: overrides.sequence ?? 0,
    timestamp_sgt: overrides.timestamp_sgt ?? "2026-05-17T10:00:00+08:00",
  };
}

test("acceptance: 'didn't sleep' + 'back was hurting' matches did_not_sleep and pain", () => {
  const c = chunk("I didn't sleep well last night, my back was hurting.");
  const evals = scanChunk(c, PRESET_RULES);

  // All rules are returned, matched or not.
  assert.equal(evals.length, PRESET_RULES.length);

  const byId = new Map(evals.map((e) => [e.rule_id, e]));

  const sleep = byId.get("did_not_sleep");
  assert.ok(sleep, "did_not_sleep eval present");
  assert.equal(sleep.matched, true);
  assert.equal(sleep.matched_text?.toLowerCase(), "didn't sleep");

  const pain = byId.get("pain");
  assert.ok(pain, "pain eval present");
  assert.equal(pain.matched, true);
  assert.equal(pain.matched_text?.toLowerCase(), "hurting");

  // Other rules should be present with matched=false and no matched_text.
  for (const id of ["fall", "dizzy", "did_not_eat", "lonely"]) {
    const e = byId.get(id);
    assert.ok(e, `${id} eval present`);
    assert.equal(e.matched, false, `${id} should not match`);
    assert.equal(e.matched_text, undefined, `${id} should not have matched_text`);
  }
});

test("case-insensitive matching", () => {
  const c = chunk("I FELL this morning and feel DIZZY.");
  const evals = scanChunk(c, PRESET_RULES);
  const fall = evals.find((e) => e.rule_id === "fall");
  assert.ok(fall);
  assert.equal(fall.matched, true);
  assert.ok(
    fall.matched_text && /fell|fall down|slipped|tripped/i.test(fall.matched_text),
    `expected a fall phrase, got ${fall.matched_text}`,
  );
  // matched_text preserves original casing from the chunk text.
  assert.equal(fall.matched_text, fall.matched_text?.toUpperCase());

  const dizzy = evals.find((e) => e.rule_id === "dizzy");
  assert.ok(dizzy);
  assert.equal(dizzy.matched, true);
  assert.equal(dizzy.matched_text?.toLowerCase(), "dizzy");
});

test("multiple rules can match within one chunk", () => {
  const c = chunk(
    "I didn't eat all day, I feel lonely, and my back hurts.",
  );
  const evals = scanChunk(c, PRESET_RULES);
  const matched = evals.filter((e) => e.matched).map((e) => e.rule_id).sort();
  assert.deepEqual(matched, [
    "did_not_eat",
    "lonely",
    "pain",
  ]);
});

test("no-match evaluations have no matched_text", () => {
  const c = chunk("Had a lovely walk in the park today, thank you for calling.");
  const evals = scanChunk(c, PRESET_RULES);
  for (const e of evals) {
    assert.equal(e.matched, false);
    assert.equal(e.matched_text, undefined);
  }
});

test("regex special characters in patterns are escaped (no ReDoS / no regex injection)", () => {
  const customRule: TriggerRule = {
    id: "special",
    name: "special",
    patterns: ["c++", "what?!", "1+1=2"],
    recommended_action: "n/a",
    enabled: true,
    is_preset: false,
  };
  const positives = [
    "I love c++ programming.",
    "what?! that's surprising",
    "the answer is 1+1=2 today",
  ];
  for (const text of positives) {
    const evals = scanChunk(chunk(text), [customRule]);
    assert.equal(evals.length, 1);
    assert.equal(evals[0].matched, true, `should match: ${text}`);
  }

  // A near-miss that would have matched if '+' were treated as regex quantifier.
  const miss = scanChunk(chunk("I love cxx programming."), [customRule]);
  assert.equal(miss[0].matched, false);
});

test("disabled rules never match", () => {
  const off: TriggerRule = {
    ...PRESET_RULES.find((r) => r.id === "pain")!,
    enabled: false,
  };
  const c = chunk("my back was hurting badly");
  const evals = scanChunk(c, [off]);
  assert.equal(evals.length, 1);
  assert.equal(evals[0].matched, false);
});

test("word-boundary tolerance: substring inside another word does not match", () => {
  // 'painting' contains 'pain' but the word-boundary check should still
  // permit matching because 'pain' is a standalone pattern in the new preset.
  // However the boundary regex requires non-alphanumeric edges, so 'painting'
  // should NOT match 'pain' (the 't' after 'pain' violates the right boundary).
  const c1 = chunk("I was painting the wall.");
  const e1 = scanChunk(c1, PRESET_RULES);
  assert.equal(
    e1.find((e) => e.rule_id === "pain")?.matched,
    false,
    "'painting' must not trigger pain",
  );

  // 'hurting' bare word should match.
  const c2 = chunk("my knee is hurting today");
  const e2 = scanChunk(c2, PRESET_RULES);
  assert.equal(e2.find((e) => e.rule_id === "pain")?.matched, true);
});

test("scanChunks returns per-chunk results in order", () => {
  const chunks = [
    chunk("all good here", { id: "a", sequence: 0 }),
    chunk("I feel dizzy", { id: "b", sequence: 1 }),
  ];
  const results = scanChunks(chunks, PRESET_RULES);
  assert.equal(results.length, 2);
  assert.equal(results[0].chunk.id, "a");
  assert.equal(results[1].chunk.id, "b");
  const matchedB = results[1].evaluations.filter((e) => e.matched);
  assert.equal(matchedB.length, 1);
  assert.equal(matchedB[0].rule_id, "dizzy");
});
