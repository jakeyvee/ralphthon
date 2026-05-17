// Deployment readiness gate for real elder calls.
//
// Combines `serviceStatus()` credential flags with the persisted elder config
// (phone present + consent_acknowledged) to derive a single, presentation-ready
// readiness payload. Used by:
//   - GET /api/deployment/readiness
//   - POST /api/calls/start-real (as a safety gate before placing a real call)
//   - <RealDeploymentPanel /> (UI checklist + call-mode banner)
//
// This module is intentionally pure (one async call to repo + env), additive,
// and does not mutate any existing schema or routes.
import "server-only";

import { serviceStatus } from "@/lib/env";
import { getOrCreateElderConfig } from "@/lib/db/repo";

export type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  reason?: string;
};

export type ReadinessMode = "simulator" | "test-call" | "real-elder";

export type Readiness = {
  ready: boolean;
  blockers: ReadinessCheck[];
  passing: ReadinessCheck[];
  mode: ReadinessMode;
};

export async function computeReadiness(): Promise<Readiness> {
  const status = serviceStatus();

  // Elder config may be unavailable if Supabase is not reachable; in that case
  // treat the elder-side checks as failing rather than throwing.
  let elderPhone = "";
  let consent = false;
  try {
    const elder = await getOrCreateElderConfig();
    if (elder) {
      elderPhone = (elder.elder_phone ?? "").trim();
      consent = Boolean(elder.consent_acknowledged);
    }
  } catch {
    // swallow — treated as missing below
  }

  const checks: ReadinessCheck[] = [
    {
      id: "supabase",
      label: "Supabase configured",
      ok: status.supabase.configured,
      reason: status.supabase.configured ? undefined : status.supabase.reason,
    },
    {
      id: "twilioVoice",
      label: "Twilio Voice configured",
      ok: status.twilioVoice.configured,
      reason: status.twilioVoice.configured
        ? undefined
        : status.twilioVoice.reason,
    },
    {
      id: "elevenlabs",
      label: "ElevenLabs voice agent configured",
      ok: status.elevenlabs.configured,
      reason: status.elevenlabs.configured
        ? undefined
        : status.elevenlabs.reason,
    },
    {
      id: "telegram",
      label: "Telegram alerts configured",
      ok: status.telegram.configured,
      reason: status.telegram.configured ? undefined : status.telegram.reason,
    },
    {
      id: "elder_phone",
      label: "Elder phone number set",
      ok: elderPhone.length > 0,
      reason:
        elderPhone.length > 0
          ? undefined
          : "Set the elder phone (E.164) in the config panel.",
    },
    {
      id: "consent_acknowledged",
      label: "Consent acknowledged",
      ok: consent,
      reason: consent
        ? undefined
        : "Family must acknowledge the consent statement in the config panel.",
    },
  ];

  const passing = checks.filter((c) => c.ok);
  const blockers = checks.filter((c) => !c.ok);

  const allRealElderOk =
    status.supabase.configured &&
    status.twilioVoice.configured &&
    status.elevenlabs.configured &&
    status.telegram.configured &&
    elderPhone.length > 0 &&
    consent;

  const testCallOk =
    status.twilioVoice.configured && status.elevenlabs.configured;

  const mode: ReadinessMode = allRealElderOk
    ? "real-elder"
    : testCallOk
      ? "test-call"
      : "simulator";

  return {
    ready: mode === "real-elder",
    blockers,
    passing,
    mode,
  };
}
