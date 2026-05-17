"use server";

import { z } from "zod";
import type { ElderConfig } from "@/lib/types";

const ConfigSchema = z.object({
  elder_name: z.string().min(1, "Elder name is required").max(120),
  elder_phone: z.string().min(1, "Elder phone is required").max(40),
  family_name: z.string().min(1, "Family name is required").max(120),
  telegram_bot_token: z.string().max(200).optional().or(z.literal("")),
  telegram_chat_id: z.string().max(120).optional().or(z.literal("")),
  sms_recipients: z.string().max(2000).optional().or(z.literal("")),
  daily_call_time_sgt: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  consent_acknowledged: z.string().optional().or(z.literal("")),
});

export type SaveConfigResult =
  | { ok: true; persisted: boolean; config: Omit<ElderConfig, "id"> }
  | { ok: false; error: string };

/**
 * Persist elder config. If VOL-149 has merged a `@/lib/db/repo` module with
 * an `updateElderConfig` export, swap the no-op below for that call. Until
 * then we validate + echo the config and the client persists to localStorage.
 */
export async function saveConfig(formData: FormData): Promise<SaveConfigResult> {
  const raw = {
    elder_name: String(formData.get("elder_name") ?? ""),
    elder_phone: String(formData.get("elder_phone") ?? ""),
    family_name: String(formData.get("family_name") ?? ""),
    telegram_bot_token: String(formData.get("telegram_bot_token") ?? ""),
    telegram_chat_id: String(formData.get("telegram_chat_id") ?? ""),
    sms_recipients: String(formData.get("sms_recipients") ?? ""),
    daily_call_time_sgt: String(
      formData.get("daily_call_time_sgt") ?? "08:30",
    ),
    consent_acknowledged: String(formData.get("consent_acknowledged") ?? ""),
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input",
    };
  }

  const cfg: Omit<ElderConfig, "id"> = {
    elder_name: parsed.data.elder_name.trim(),
    elder_phone: parsed.data.elder_phone.trim(),
    family_name: parsed.data.family_name.trim(),
    telegram_bot_token: parsed.data.telegram_bot_token?.trim() || undefined,
    telegram_chat_id: parsed.data.telegram_chat_id?.trim() || undefined,
    sms_recipients: (parsed.data.sms_recipients ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    daily_call_time_sgt: parsed.data.daily_call_time_sgt,
    consent_acknowledged: parsed.data.consent_acknowledged === "on",
  };

  // TODO(VOL-149): once `@/lib/db/repo` exists, wire `updateElderConfig(cfg)`
  // here and set `persisted: true`.
  const persisted = false;

  return { ok: true, persisted, config: cfg };
}
