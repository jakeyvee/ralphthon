"use client";

// VOL-151: Family-editable trigger rules — UI.
// Lets a family member add / edit / disable / delete rules that the call
// scanner (VOL-142) reads per chunk via VOL-144. Style intentionally mirrors
// ConfigPanel and AuditPanel: rounded-2xl border border-zinc-800 bg-[#18181C] p-6.

import { useState, useTransition } from "react";
import type { TriggerRule } from "@/lib/types";

type DraftRule = TriggerRule & {
  _patternsText: string; // textarea-friendly representation (one per line)
  _isNew: boolean;
  _open: boolean;
  _error?: string;
  _flash?: { kind: "success" | "error"; message: string };
};

function toDraft(rule: TriggerRule, opts?: { isNew?: boolean; open?: boolean }): DraftRule {
  return {
    ...rule,
    _patternsText: rule.patterns.join("\n"),
    _isNew: opts?.isNew ?? false,
    _open: opts?.open ?? false,
  };
}

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `rule_${Date.now().toString(36)}`;
}

function newBlankRule(): DraftRule {
  return {
    id: `rule_${Date.now().toString(36)}`,
    name: "",
    patterns: [],
    recommended_action: "",
    enabled: true,
    is_preset: false,
    _patternsText: "",
    _isNew: true,
    _open: true,
  };
}

export function RulesEditor({ initialRules }: { initialRules: TriggerRule[] }) {
  const [rules, setRules] = useState<DraftRule[]>(() =>
    initialRules.map((r) => toDraft(r)),
  );
  const [isPending, startTransition] = useTransition();
  const [globalFlash, setGlobalFlash] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  function patchRule(index: number, patch: Partial<DraftRule>) {
    setRules((rs) =>
      rs.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function validate(rule: DraftRule): string | null {
    if (!rule.name.trim()) return "Name is required.";
    const patterns = rule._patternsText
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (patterns.length === 0)
      return "At least one non-empty pattern is required.";
    if (!rule.recommended_action.trim())
      return "Recommended action is required.";
    return null;
  }

  function handleSave(index: number) {
    const draft = rules[index];
    if (!draft) return;
    const err = validate(draft);
    if (err) {
      patchRule(index, { _error: err, _flash: undefined });
      return;
    }
    patchRule(index, { _error: undefined });

    const patterns = draft._patternsText
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const payload: TriggerRule = {
      id: draft._isNew ? slugify(draft.name) : draft.id,
      name: draft.name.trim(),
      patterns,
      recommended_action: draft.recommended_action.trim(),
      enabled: draft.enabled,
      is_preset: draft.is_preset,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rule?: TriggerRule;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.rule) {
          patchRule(index, {
            _flash: {
              kind: "error",
              message: data.error || `Save failed (${res.status})`,
            },
          });
          return;
        }
        // Optimistic merge with the server's authoritative copy.
        patchRule(index, {
          ...data.rule,
          _patternsText: data.rule.patterns.join("\n"),
          _isNew: false,
          _error: undefined,
          _flash: { kind: "success", message: "Saved." },
        });
      } catch (e) {
        patchRule(index, {
          _flash: {
            kind: "error",
            message: e instanceof Error ? e.message : "Network error",
          },
        });
      }
    });
  }

  function handleDelete(index: number) {
    const draft = rules[index];
    if (!draft) return;
    if (draft.is_preset) return; // safety: preset rules are not deletable

    if (draft._isNew) {
      // never persisted — just drop it locally
      setRules((rs) => rs.filter((_, i) => i !== index));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rules/${encodeURIComponent(draft.id)}`,
          { method: "DELETE" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          patchRule(index, {
            _flash: {
              kind: "error",
              message: data.error || `Delete failed (${res.status})`,
            },
          });
          return;
        }
        setRules((rs) => rs.filter((_, i) => i !== index));
      } catch (e) {
        patchRule(index, {
          _flash: {
            kind: "error",
            message: e instanceof Error ? e.message : "Network error",
          },
        });
      }
    });
  }

  function handleAdd() {
    setRules((rs) => [...rs, newBlankRule()]);
  }

  function handleReset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset all rules to the default preset? Custom rules will be deleted.",
      )
    ) {
      return;
    }
    setGlobalFlash(null);
    startTransition(async () => {
      try {
        const resetRes = await fetch("/api/rules/reset", { method: "POST" });
        const resetData = (await resetRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!resetRes.ok || !resetData.ok) {
          setGlobalFlash({
            kind: "error",
            message:
              resetData.error || `Reset failed (${resetRes.status})`,
          });
          return;
        }
        // Read fresh list.
        const listRes = await fetch("/api/rules", { cache: "no-store" });
        const listData = (await listRes.json().catch(() => ({}))) as {
          rules?: TriggerRule[];
        };
        const fresh = listData.rules ?? [];
        setRules(fresh.map((r) => toDraft(r)));
        setGlobalFlash({
          kind: "success",
          message: `Reset to preset (${fresh.length} rules).`,
        });
      } catch (e) {
        setGlobalFlash({
          kind: "error",
          message: e instanceof Error ? e.message : "Network error",
        });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Trigger rules
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="rounded-lg bg-[#F472B6] px-3 py-1.5 text-xs font-medium text-zinc-950 shadow-sm hover:bg-pink-400 disabled:opacity-60"
          >
            Reset to preset
          </button>
        </div>
      </div>

      {globalFlash ? (
        <div
          className={`mb-3 rounded-md border px-2 py-1 text-xs font-medium ${
            globalFlash.kind === "success"
              ? "border-[#818CF8]/40 bg-[#818CF8]/15 text-[#818CF8]"
              : "border-red-500/40 bg-red-500/15 text-red-300"
          }`}
          role="status"
        >
          {globalFlash.message}
        </div>
      ) : null}

      <ul className="space-y-2">
        {rules.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-800 bg-[#0E0E10] p-4 text-center text-xs text-zinc-500">
            No rules. Add one below or reset to preset.
          </li>
        ) : null}

        {rules.map((rule, index) => (
          <li
            key={`${rule.id}-${index}`}
            className="rounded-xl border border-zinc-800 bg-[#0E0E10]"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => patchRule(index, { _open: !rule._open })}
                className="flex flex-1 items-center gap-2 text-left"
                aria-expanded={rule._open}
              >
                <span
                  className={`inline-block transition-transform ${
                    rule._open ? "rotate-90" : ""
                  } text-zinc-500`}
                  aria-hidden="true"
                >
                  &#9656;
                </span>
                <span className="truncate text-sm font-medium text-zinc-100">
                  {rule.name.trim() || (
                    <span className="italic text-zinc-500">
                      (untitled rule)
                    </span>
                  )}
                </span>
                {rule.is_preset ? (
                  <span className="rounded-full border border-[#F472B6]/50 bg-transparent px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-[#F472B6]">
                    Preset
                  </span>
                ) : null}
                {rule._isNew ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Unsaved
                  </span>
                ) : null}
              </button>
              <label className="flex items-center gap-1 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    patchRule(index, { enabled: e.target.checked })
                  }
                />
                Enabled
              </label>
            </div>

            {rule._open ? (
              <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
                <div className="space-y-1">
                  <label
                    htmlFor={`rule-name-${index}`}
                    className="block text-xs font-medium text-zinc-400"
                  >
                    Name
                  </label>
                  <input
                    id={`rule-name-${index}`}
                    type="text"
                    value={rule.name}
                    onChange={(e) =>
                      patchRule(index, { name: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
                    placeholder="e.g. Did not sleep"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`rule-patterns-${index}`}
                    className="block text-xs font-medium text-zinc-400"
                  >
                    Patterns (one per line, case-insensitive)
                  </label>
                  <textarea
                    id={`rule-patterns-${index}`}
                    value={rule._patternsText}
                    onChange={(e) =>
                      patchRule(index, { _patternsText: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
                    placeholder={"didn't sleep\nno sleep\ncouldn't sleep"}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`rule-action-${index}`}
                    className="block text-xs font-medium text-zinc-400"
                  >
                    Recommended action
                  </label>
                  <textarea
                    id={`rule-action-${index}`}
                    value={rule.recommended_action}
                    onChange={(e) =>
                      patchRule(index, {
                        recommended_action: e.target.value,
                      })
                    }
                    rows={2}
                    className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
                    placeholder="e.g. Ask about sleep tonight; check medication and routine."
                  />
                </div>

                {rule._error ? (
                  <p className="text-xs font-medium text-red-300">
                    {rule._error}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSave(index)}
                    disabled={isPending}
                    className="rounded-lg bg-[#818CF8] px-3 py-1.5 text-xs font-medium text-zinc-950 shadow-sm hover:bg-indigo-400 disabled:opacity-60"
                  >
                    {isPending ? "Saving..." : "Save rule"}
                  </button>
                  {rule.is_preset ? (
                    <span className="text-[11px] text-zinc-500">
                      Preset rules can be disabled but not deleted.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      disabled={isPending}
                      className="rounded-lg border border-[#F472B6]/40 bg-transparent px-3 py-1.5 text-xs font-medium text-[#F472B6] hover:bg-[#F472B6]/10 disabled:opacity-60"
                      aria-label="Delete rule"
                    >
                      Delete
                    </button>
                  )}
                  {rule._flash ? (
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        rule._flash.kind === "success"
                          ? "border-[#818CF8]/40 bg-[#818CF8]/15 text-[#818CF8]"
                          : "border-red-500/40 bg-red-500/15 text-red-300"
                      }`}
                      role="status"
                    >
                      {rule._flash.message}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="rounded-lg border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-60"
        >
          + Add rule
        </button>
        <span className="text-[11px] text-zinc-500">
          Edits apply to the next call.
        </span>
      </div>
    </div>
  );
}
