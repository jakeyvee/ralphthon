// Hard-coded local fallback rules for VOL-141 UI.
// Used only when @/lib/rules/preset (VOL-142) is not yet importable.
// Mirrors the 6-rule preset list described in the product spec.
import type { TriggerRule } from "@/lib/types";

export const FALLBACK_PRESET_RULES: TriggerRule[] = [
  {
    id: "fallback-fall",
    name: "Possible fall or injury",
    patterns: ["fell", "fall", "tripped", "slipped", "can't get up"],
    recommended_action:
      "Family: call to confirm safety. Consider in-person check.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fallback-chest-pain",
    name: "Chest pain or breathing trouble",
    patterns: [
      "chest pain",
      "can't breathe",
      "short of breath",
      "tight chest",
    ],
    recommended_action:
      "Family: contact elder immediately. If unresponsive, dial local emergency services.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fallback-no-meds",
    name: "Missed medication",
    patterns: ["forgot my meds", "no medicine", "ran out", "skipped pill"],
    recommended_action:
      "Family: confirm medication schedule and refill status.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fallback-low-mood",
    name: "Low mood or loneliness",
    patterns: ["lonely", "no one to talk to", "feeling down", "sad today"],
    recommended_action:
      "Family: schedule a visit or longer call. Consider SAGE helpline as a listening resource.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fallback-confusion",
    name: "Confusion or disorientation",
    patterns: ["don't know where", "what day", "who are you", "confused"],
    recommended_action:
      "Family: review with primary caregiver. Consider AIC for care navigation.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fallback-no-food",
    name: "Skipped meals",
    patterns: ["haven't eaten", "no food", "skipped lunch", "no appetite"],
    recommended_action: "Family: check fridge stock and offer meal support.",
    enabled: true,
    is_preset: true,
  },
];
