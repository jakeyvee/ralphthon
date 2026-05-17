// PRD v0.2 default trigger rules shipped with the MVP.
// Stable string IDs are used so persistence and UI can reference them safely.

import type { TriggerRule } from "@/lib/types";

export const PRESET_RULES: TriggerRule[] = [
  {
    id: "pain",
    name: "Pain",
    patterns: ["pain", "hurting", "ache", "aching", "sore", "back hurts"],
    recommended_action:
      "Call mum today to check the pain and whether she needs help.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fall",
    name: "Fall",
    patterns: ["fell", "fall down", "slipped", "tripped"],
    recommended_action:
      "Call immediately and confirm whether she is injured.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "dizzy",
    name: "Dizzy",
    patterns: ["dizzy", "lightheaded", "faint", "almost fainted"],
    recommended_action:
      "Call immediately and check if she is safe sitting or lying down.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "did_not_eat",
    name: "Didn't eat",
    patterns: [
      "didn't eat",
      "did not eat",
      "no appetite",
      "skipped dinner",
      "skipped breakfast",
    ],
    recommended_action: "Call mum today and check whether she has eaten.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "did_not_sleep",
    name: "Didn't sleep",
    patterns: [
      "didn't sleep",
      "did not sleep",
      "couldn't sleep",
      "poor sleep",
      "awake all night",
    ],
    recommended_action: "Call mum today to check how she is feeling.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "lonely",
    name: "Lonely",
    patterns: [
      "lonely",
      "no one to talk to",
      "alone all day",
      "very quiet at home",
    ],
    recommended_action: "Call mum today and arrange a family check-in.",
    enabled: true,
    is_preset: true,
  },
];
