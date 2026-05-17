// PRD default trigger rules shipped with the MVP.
// Stable string IDs are used so persistence and UI can reference them safely.

import type { TriggerRule } from "@/lib/types";

export const PRESET_RULES: TriggerRule[] = [
  {
    id: "did_not_sleep",
    name: "did_not_sleep",
    patterns: [
      "didn't sleep",
      "did not sleep",
      "no sleep",
      "couldn't sleep",
      "trouble sleeping",
    ],
    recommended_action:
      "Ask about sleep tonight; check medication and routine.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "pain",
    name: "pain",
    patterns: [
      "back was hurting",
      "back hurts",
      "in pain",
      "my chest hurts",
      "headache",
      "stomach hurts",
      "hurting",
    ],
    recommended_action:
      "Check pain location and severity; consider clinic visit.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fall_or_dizzy",
    name: "fall_or_dizzy",
    patterns: [
      "fell down",
      "i fell",
      "dizzy",
      "lightheaded",
      "lost my balance",
    ],
    recommended_action:
      "Check for injury; consider GP/clinic if recent fall.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "not_eating",
    name: "not_eating",
    patterns: [
      "haven't eaten",
      "no appetite",
      "didn't eat",
      "skipping meals",
    ],
    recommended_action:
      "Encourage hydration and a light meal; check fridge during next visit.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "loneliness",
    name: "loneliness",
    patterns: [
      "feel lonely",
      "feeling alone",
      "no one to talk to",
      "miss everyone",
    ],
    recommended_action:
      "Plan a visit or call this week; consider community programs.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "medication_issue",
    name: "medication_issue",
    patterns: [
      "ran out of",
      "forgot to take",
      "missed my pills",
      "out of medicine",
    ],
    recommended_action: "Refill check; review medication list.",
    enabled: true,
    is_preset: true,
  },
];
