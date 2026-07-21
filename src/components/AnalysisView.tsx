"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Languages,
  MessageSquare,
  Clock,
  AlertTriangle,
  Sparkles,
  Check,
  Mic2,
  AudioLines,
  Waves,
} from "lucide-react";
import type { CartesiaVoiceOption, Conversation } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { CONVERSATION_TONES, toneLabel } from "@/lib/tones";
import {
  applyLanguageVoiceDefaults,
  groupAgentVoices,
  groupUserVoices,
  languageSuggestionLabel,
  type VoiceGroups,
} from "@/lib/voice-suggest";
import { Badge, Button, Card } from "./ui";

function VoiceOptGroups({
  groups,
  mode,
  language,
  optionKeyPrefix = "",
}: {
  groups: VoiceGroups;
  mode: "agent" | "user";
  language: string;
  optionKeyPrefix?: string;
}) {
  const suggestedLabel = languageSuggestionLabel(language);
  // User: cloned first; Agent: suggested first
  const order: Array<{
    key: string;
    label: string;
    items: CartesiaVoiceOption[];
  }> =
    mode === "user"
      ? [
          { key: "cloned", label: "Cloned voices", items: groups.cloned },
          {
            key: "suggested",
            label: suggestedLabel,
            items: groups.suggested,
          },
          { key: "other", label: "More voices", items: groups.other },
        ]
      : [
          {
            key: "suggested",
            label: suggestedLabel,
            items: groups.suggested,
          },
          { key: "cloned", label: "Cloned voices", items: groups.cloned },
          { key: "other", label: "More voices", items: groups.other },
        ];

  return (
    <>
      {order.map(
        (g) =>
          g.items.length > 0 && (
            <optgroup key={g.key} label={g.label}>
              {g.items.map((v) => (
                <option key={`${optionKeyPrefix}${v.id}`} value={v.id}>
                  {(v.isOwner || v.isPro ? "★ " : "") +
                    v.name +
                    (v.language ? ` (${v.language})` : "")}
                </option>
              ))}
            </optgroup>
          )
      )}
    </>
  );
}

function isSelectable(c: Conversation) {
  return !c.parseError && c.turns.length > 0;
}

function FieldLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted mb-1.5">
      {icon}
      {children}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  disabled,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value);
      }}
      className={cn(
        "w-full h-10 rounded-[10px] border border-border bg-bg px-3 text-sm text-ink",
        "focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        "appearance-none cursor-pointer",
        className
      )}
    >
      {children}
    </select>
  );
}

export function AnalysisView({
  conversations,
  fileName,
  warnings,
  source,
  onGenerate,
  onBack,
  onConversationsChange,
  loading,
}: {
  conversations: Conversation[];
  fileName: string;
  warnings: string[];
  source?: string;
  onGenerate: (selected: Conversation[]) => void;
  onBack: () => void;
  onConversationsChange: (next: Conversation[]) => void;
  loading?: boolean;
}) {
  const valid = useMemo(
    () => conversations.filter(isSelectable),
    [conversations]
  );
  const invalid = conversations.filter((c) => !isSelectable(c));

  // Stable key of selectable ids — only reset selection when analysis set changes
  const validIdsKey = useMemo(
    () =>
      valid
        .map((c) => c.id)
        .sort()
        .join("|"),
    [valid]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(valid.map((c) => c.id))
  );
  const [voices, setVoices] = useState<CartesiaVoiceOption[]>([]);
  const [voicesWarning, setVoicesWarning] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const appliedVoiceKeyRef = useRef("");

  useEffect(() => {
    setSelectedIds(new Set(validIdsKey ? validIdsKey.split("|") : []));
    // Allow language-based defaults when a new analysis set arrives
    appliedVoiceKeyRef.current = "";
  }, [validIdsKey]);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    fetch("/api/voices")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setVoices(data.voices || []);
        setVoicesWarning(data.warning || null);
      })
      .catch(() => {
        if (!cancelled) setVoicesWarning("Could not load Cartesia voices.");
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-pick language-appropriate Agent / User voices when voices load
  useEffect(() => {
    if (voicesLoading || voices.length === 0 || !validIdsKey) return;
    const key = `${validIdsKey}::${voices.length}`;
    if (appliedVoiceKeyRef.current === key) return;
    appliedVoiceKeyRef.current = key;
    onConversationsChange(applyLanguageVoiceDefaults(conversations, voices));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when analysis set or voice list changes
  }, [voices, voicesLoading, validIdsKey]);

  const selectedCount = valid.filter((c) => selectedIds.has(c.id)).length;
  const allValidSelected =
    valid.length > 0 && valid.every((c) => selectedIds.has(c.id));
  const noneSelected = selectedCount === 0;

  const toggle = (id: string, enabled: boolean) => {
    if (!enabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(valid.map((c) => c.id)));
  const selectNone = () => setSelectedIds(new Set());

  const patchConversation = (
    id: string,
    patch: Partial<Conversation> | ((c: Conversation) => Conversation)
  ) => {
    onConversationsChange(
      conversations.map((c) => {
        if (c.id !== id) return c;
        if (typeof patch === "function") return patch(c);
        return { ...c, ...patch };
      })
    );
  };

  const handleGenerate = () => {
    const selected = conversations.filter(
      (c) => isSelectable(c) && selectedIds.has(c.id)
    );
    if (selected.length === 0) return;
    onGenerate(selected);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted mb-1">{fileName}</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
            {conversations.length} conversation
            {conversations.length === 1 ? "" : "s"} detected
          </h2>
          <p className="text-ink-secondary mt-2 text-[15px]">
            Select conversations, review tone, and pick Agent / User TTS voices
            per scenario.
            {source === "deepseek" && (
              <span className="text-primary">
                {" "}
                · Analyzed with DeepSeek V4 Flash
              </span>
            )}
            {source === "deterministic" && (
              <span className="text-muted">
                {" "}
                · Parsed with local Markdown rules
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Back
          </Button>
          <Button
            onClick={handleGenerate}
            loading={loading}
            disabled={noneSelected || valid.length === 0}
          >
            <Sparkles className="size-4" />
            Generate {selectedCount} audio
            {selectedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {valid.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface/50 px-4 py-3">
          <p className="text-sm text-ink-secondary">
            <span className="font-medium text-ink tabular-nums">
              {selectedCount}
            </span>
            {" of "}
            <span className="tabular-nums">{valid.length}</span>
            {" ready conversation"}
            {valid.length === 1 ? "" : "s"}
            {" selected"}
            {voicesLoading && (
              <span className="text-muted"> · Loading voices…</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={selectAll}
              disabled={loading || allValidSelected}
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={selectNone}
              disabled={loading || noneSelected}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {(source === "deterministic" ||
        warnings.length > 0 ||
        voicesWarning) && (
        <div className="rounded-[var(--radius-md)] border border-warning/25 bg-warning-soft px-4 py-3 space-y-1">
          {source === "deterministic" && (
            <p className="text-sm text-warning flex gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              Local parsing used — tone is heuristic. DeepSeek improves tone
              detection.
            </p>
          )}
          {voicesWarning && (
            <p className="text-sm text-warning flex gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              {voicesWarning}
            </p>
          )}
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-warning flex gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {conversations.map((c, i) => {
          const selectable = isSelectable(c);
          const selected = selectable && selectedIds.has(c.id);
          const agentVoiceId = c.voices?.agentVoiceId || "";
          const userVoiceId = c.voices?.userVoiceId || "";

          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: Math.min(i * 0.06, 0.4),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card
                className={cn(
                  "relative transition-all duration-300",
                  c.parseError &&
                    "border border-danger/30 bg-danger-soft/40 opacity-90",
                  selectable &&
                    selected &&
                    "ring-2 ring-primary/50 shadow-[var(--shadow-glow)] border-primary/20",
                  selectable && !selected && "opacity-80",
                  !selectable && "opacity-75"
                )}
              >
                {/* Header / select */}
                <div
                  className={cn(
                    "flex items-start gap-3 mb-4",
                    selectable && "cursor-pointer"
                  )}
                  onClick={() => toggle(c.id, selectable)}
                  onKeyDown={(e) => {
                    if (!selectable) return;
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(c.id, true);
                    }
                  }}
                  role={selectable ? "checkbox" : undefined}
                  aria-checked={selectable ? selected : undefined}
                  tabIndex={selectable ? 0 : undefined}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[8px] border transition-colors",
                      !selectable &&
                        "border-border bg-surface-2 text-muted opacity-40",
                      selectable &&
                        selected &&
                        "border-primary bg-primary text-primary-fg",
                      selectable &&
                        !selected &&
                        "border-border-strong bg-bg text-transparent"
                    )}
                    aria-hidden
                  >
                    {selectable && selected && (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink text-[17px] leading-snug text-balance">
                          {c.title}
                        </h3>
                        {c.scenario && (
                          <p className="text-sm text-muted mt-1">{c.scenario}</p>
                        )}
                      </div>
                      <Badge
                        tone={
                          c.parseError
                            ? "danger"
                            : selected
                              ? "primary"
                              : "default"
                        }
                      >
                        {c.parseError
                          ? "Error"
                          : selected
                            ? "Selected"
                            : "Skipped"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="pl-9 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent">
                      <Languages className="size-3" />
                      {c.language}
                    </Badge>
                    <Badge>
                      <MessageSquare className="size-3" />
                      {c.turnCount} turns
                    </Badge>
                    <Badge>
                      <Clock className="size-3" />
                      ~{formatDuration(c.estimatedDurationSec)}
                    </Badge>
                    {c.tone && (
                      <Badge tone="primary">
                        <Waves className="size-3" />
                        {toneLabel(c.tone)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted font-mono truncate">
                    {c.slug}.mp3
                  </p>

                  {c.parseError ? (
                    <div className="rounded-[var(--radius-sm)] bg-danger-soft/80 px-3 py-2 text-sm text-danger">
                      <p className="font-medium mb-0.5">Parsing issue</p>
                      <p className="opacity-90">{c.parseError}</p>
                      {c.sourceStartLine != null && (
                        <p className="text-xs mt-1 opacity-70">
                          Lines {c.sourceStartLine}–{c.sourceEndLine}
                        </p>
                      )}
                      <p className="text-xs mt-2 opacity-70">
                        Cannot be selected for generation.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-ink-secondary line-clamp-2 leading-relaxed">
                        {c.turns[0]
                          ? `${c.turns[0].speaker === "agent" ? "Agent" : "User"}: ${c.turns[0].text}`
                          : "—"}
                      </p>

                      {/* Tone + voices — stop propagation so selecting doesn't toggle card */}
                      <div
                        className="space-y-3 rounded-[var(--radius-md)] border border-border/80 bg-surface-2/40 p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div>
                          <FieldLabel icon={<Waves className="size-3" />}>
                            Delivery tone
                          </FieldLabel>
                          <SelectField
                            value={c.tone || "calm"}
                            disabled={loading || !selectable}
                            onChange={(tone) =>
                              patchConversation(c.id, {
                                tone,
                                toneReason: `Manual: ${toneLabel(tone)}`,
                              })
                            }
                          >
                            {CONVERSATION_TONES.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} — {t.description}
                              </option>
                            ))}
                          </SelectField>
                          {c.toneReason && (
                            <p className="mt-1.5 text-xs text-muted leading-relaxed">
                              {c.toneReason}
                            </p>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-1">
                          <div>
                            <FieldLabel icon={<AudioLines className="size-3" />}>
                              Agent voice
                            </FieldLabel>
                            <SelectField
                              value={agentVoiceId}
                              disabled={loading || !selectable || voicesLoading}
                              onChange={(next) =>
                                patchConversation(c.id, (conv) => ({
                                  ...conv,
                                  voices: {
                                    ...conv.voices,
                                    agentVoiceId: next,
                                  },
                                }))
                              }
                            >
                              <VoiceOptGroups
                                mode="agent"
                                language={c.language}
                                groups={groupAgentVoices(
                                  voices,
                                  c.language,
                                  c.languageCode,
                                  agentVoiceId
                                )}
                              />
                            </SelectField>
                            <p className="mt-1 text-[11px] text-muted">
                              Language matches for {c.language || "this call"}{" "}
                              listed first · TTS for Agent lines
                            </p>
                          </div>

                          <div>
                            <FieldLabel icon={<Mic2 className="size-3" />}>
                              User voice
                            </FieldLabel>
                            <SelectField
                              value={userVoiceId}
                              disabled={loading || !selectable || voicesLoading}
                              onChange={(next) =>
                                patchConversation(c.id, (conv) => ({
                                  ...conv,
                                  voices: {
                                    ...conv.voices,
                                    userVoiceId: next,
                                  },
                                }))
                              }
                            >
                              <VoiceOptGroups
                                mode="user"
                                language={c.language}
                                optionKeyPrefix="u-"
                                groups={groupUserVoices(
                                  voices,
                                  c.language,
                                  c.languageCode,
                                  userVoiceId
                                )}
                              />
                            </SelectField>
                            <p className="mt-1 text-[11px] text-muted">
                              Cloned voices first, then {c.language || "language"}{" "}
                              matches · TTS for User lines
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {invalid.length > 0 && (
        <p className="text-sm text-muted text-center">
          {invalid.length} malformed section
          {invalid.length === 1 ? "" : "s"} cannot be selected.
        </p>
      )}

      {noneSelected && valid.length > 0 && (
        <p className="text-sm text-center text-warning">
          Select at least one conversation to continue to generation.
        </p>
      )}
    </div>
  );
}
