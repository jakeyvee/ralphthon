// Tiny wrapper around repo.createCall — convenience for the simulator (VOL-143)
// and the real voice path (VOL-147) so they don't need to import db helpers
// directly. Server-only.
import "server-only";
import { createCall as repoCreateCall } from "@/lib/db/repo";
import type { CallSource, CallStatus } from "@/lib/types";

export interface StartCallInput {
  source: CallSource;
  status: CallStatus;
}

export interface StartCallResult {
  id: string;
  source: CallSource;
  status: CallStatus;
}

export async function startCall(
  input: StartCallInput,
): Promise<StartCallResult> {
  const { id } = await repoCreateCall({
    source: input.source,
    status: input.status,
  });
  return { id, source: input.source, status: input.status };
}
