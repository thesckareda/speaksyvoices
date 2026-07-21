"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
  Ban,
} from "lucide-react";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, ProgressBar } from "./ui";

const STAGES = [
  "Parsing Markdown",
  "Detecting conversations",
  "Preparing voices",
  "Generating Agent speech",
  "Generating User speech",
  "Merging conversation",
  "Exporting MP3",
];

function statusIcon(status: ConversationStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-5 text-success" />;
    case "error":
      return <XCircle className="size-5 text-danger" />;
    case "cancelled":
      return <Ban className="size-5 text-muted" />;
    case "pending":
    case "queued":
      return <CircleDashed className="size-5 text-muted" />;
    default:
      return <Loader2 className="size-5 text-primary animate-spin" />;
  }
}

function stageIndex(status: ConversationStatus, label?: string): number {
  if (status === "completed") return STAGES.length;
  if (status === "preparing") return 2;
  if (status === "generating_agent") return 3;
  if (status === "generating_user") return 4;
  if (status === "merging") return 5;
  if (status === "exporting") return 6;
  if (label?.toLowerCase().includes("agent")) return 3;
  if (label?.toLowerCase().includes("user")) return 4;
  return 2;
}

export function GenerationView({
  conversations,
  globalStage,
  onCancel,
  onCancelOne,
}: {
  conversations: Conversation[];
  globalStage?: string;
  onCancel: () => void;
  onCancelOne: (id: string) => void;
}) {
  const done = conversations.filter((c) => c.status === "completed").length;
  const total = conversations.filter((c) => !c.parseError).length;
  const overall =
    total === 0
      ? 0
      : Math.round(
          conversations
            .filter((c) => !c.parseError)
            .reduce((sum, c) => sum + (c.progress || 0), 0) / total
        );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
            Generating audio
          </h2>
          <p className="text-ink-secondary mt-2 text-[15px]">
            {globalStage || "Synthesizing natural phone-call dialogue…"}
          </p>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          Cancel all
        </Button>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-secondary font-medium">Overall progress</span>
          <span className="text-ink tabular-nums">
            {done}/{total} · {overall}%
          </span>
        </div>
        <ProgressBar value={overall} shimmer={overall < 100} className="h-2" />

        <div className="flex flex-wrap gap-2 pt-2">
          {STAGES.map((s, i) => {
            const anyActive = conversations.some(
              (c) => stageIndex(c.status, c.progressLabel) === i
            );
            const allPast = conversations
              .filter((c) => !c.parseError)
              .every((c) => stageIndex(c.status, c.progressLabel) > i);
            return (
              <span
                key={s}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  anyActive && "bg-primary-soft text-primary font-medium pulse-soft",
                  allPast && !anyActive && "bg-success-soft text-success",
                  !anyActive && !allPast && "bg-surface-2 text-muted"
                )}
              >
                {s}
              </span>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3">
        {conversations.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="py-4 px-5">
              <div className="flex items-start gap-4">
                <div className="mt-0.5">{statusIcon(c.status)}</div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{c.title}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {c.progressLabel || c.status}
                        {c.error ? ` — ${c.error}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          c.status === "completed"
                            ? "success"
                            : c.status === "error"
                              ? "danger"
                              : c.status === "cancelled"
                                ? "default"
                                : "primary"
                        }
                      >
                        {c.language}
                      </Badge>
                      {(c.status === "queued" ||
                        c.status === "preparing" ||
                        c.status === "generating_agent" ||
                        c.status === "generating_user" ||
                        c.status === "merging" ||
                        c.status === "exporting") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCancelOne(c.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  {!c.parseError && c.status !== "error" && (
                    <ProgressBar
                      value={c.progress}
                      shimmer={
                        c.progress > 0 &&
                        c.progress < 100 &&
                        c.status !== "completed"
                      }
                    />
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
