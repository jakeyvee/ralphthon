// Scripted transcript fixture for the demo / fallback simulator.
// Order matters: the elder's third turn is the canonical demo trigger
// phrase that must match the "did_not_sleep" and "pain" preset rules.

import type { ChunkSpeaker } from "@/lib/types";

export interface ScriptedChunk {
  source: ChunkSpeaker;
  text: string;
  /** Pause before emitting this chunk, in milliseconds. */
  delayMs: number;
}

export const SCRIPTED_CHUNKS: ScriptedChunk[] = [
  {
    source: "agent",
    text: "Good morning auntie, this is your daily check-in. How are you feeling today?",
    delayMs: 300,
  },
  {
    source: "elder",
    text: "Oh hello dear, I'm okay lah, just a bit tired this morning.",
    delayMs: 500,
  },
  {
    source: "agent",
    text: "I'm glad to hear from you. Did you manage to rest well last night?",
    delayMs: 400,
  },
  // ---- Required demo trigger chunk (verbatim) ----
  {
    source: "elder",
    text: "I didn't sleep well last night, my back was hurting.",
    delayMs: 600,
  },
  {
    source: "agent",
    text: "I'm sorry to hear that. Have you been able to eat breakfast this morning?",
    delayMs: 400,
  },
  {
    source: "elder",
    text: "Yes, I had some porridge. The grandchildren are coming on Sunday so I'm looking forward to that.",
    delayMs: 500,
  },
  {
    source: "agent",
    text: "That sounds lovely. Are you taking your medication on schedule?",
    delayMs: 350,
  },
  {
    source: "elder",
    text: "Yes, I took my pills after breakfast as usual.",
    delayMs: 400,
  },
  {
    source: "agent",
    text: "Wonderful. I'll let your family know you're doing alright. Please rest your back today.",
    delayMs: 350,
  },
  {
    source: "elder",
    text: "Thank you dear, talk to you tomorrow. Bye bye.",
    delayMs: 300,
  },
];
