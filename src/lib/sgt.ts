// Singapore time helpers — every timestamp the UI shows must use SGT (UTC+8).

const SGT_OFFSET_MIN = 8 * 60;

export function nowSgtISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() + (SGT_OFFSET_MIN - -now.getTimezoneOffset()) * 60_000);
  // Format as ISO-like string in SGT
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mi = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
}

export function formatSgt(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}
