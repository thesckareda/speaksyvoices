"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Archive,
  AlertTriangle,
  FolderDown,
} from "lucide-react";
import type { Conversation } from "@/lib/types";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import {
  buildRecordingsZip,
  triggerBlobDownload,
  type DownloadAudioFormat,
} from "@/lib/download-all";
import { AudioPlayer } from "./AudioPlayer";
import { Badge, Button, Card } from "./ui";

export function ResultsView({
  conversations,
  jobId,
  fileName,
  onRegenerate,
  onBack,
  regeneratingId,
}: {
  conversations: Conversation[];
  jobId: string | null;
  fileName?: string;
  onRegenerate: (id: string) => void;
  onBack: () => void;
  regeneratingId?: string | null;
}) {
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] =
    useState<DownloadAudioFormat>("mp3");

  const completed = conversations.filter(
    (c) => c.status === "completed" && c.audio
  );
  const sourceName = fileName || "conversations.md";

  const downloadAll = async () => {
    if (completed.length === 0) return;
    setZipping(true);
    setDownloadError(null);
    setDownloadHint(null);

    try {
      // Prefer server ZIP (reads files from disk) when job still lives in memory
      if (jobId) {
        const res = await fetch("/api/download-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            fileName: sourceName,
            conversationIds: completed.map((c) => c.id),
            format: downloadFormat,
          }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const header = res.headers.get("Content-Disposition") || "";
          const match = header.match(/filename="?([^"]+)"?/i);
          const zipName =
            match?.[1] ||
            `${sourceName.replace(/\.md$/i, "")}-${downloadFormat}-recordings.zip`;
          triggerBlobDownload(blob, zipName);
          setDownloadHint(
            `Downloaded ${completed.length} ${downloadFormat.toUpperCase()} recording${completed.length === 1 ? "" : "s"} in ${zipName}`
          );
          return;
        }

        // Fall through to client zip on JOB_NOT_FOUND / errors
        const errBody = await res.json().catch(() => ({}));
        if (res.status !== 404) {
          console.warn("Server download-all failed, using client ZIP:", errBody);
        }
      }

      // Client-side: audio-only folder ZIP
      const { blob, zipName, folder, fileCount } = await buildRecordingsZip(
        conversations,
        sourceName,
        downloadFormat
      );
      triggerBlobDownload(blob, zipName);
      setDownloadHint(
        `Downloaded folder “${folder}/” with ${fileCount} ${downloadFormat.toUpperCase()} file${fileCount === 1 ? "" : "s"}`
      );
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "Download failed"
      );
    } finally {
      setZipping(false);
    }
  };

  const copyTranscript = async (c: Conversation) => {
    await navigator.clipboard.writeText(c.transcript);
    setCopied(c.id);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
            Your phone calls are ready
          </h2>
          <p className="text-ink-secondary mt-2 text-[15px]">
            {completed.length} of {conversations.length} conversation
            {conversations.length === 1 ? "" : "s"} exported
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBack}>
            New file
          </Button>
          <Button
            onClick={() => void downloadAll()}
            loading={zipping}
            disabled={completed.length === 0}
          >
            <FolderDown className="size-4" />
            Download all
          </Button>
        </div>
      </div>

      {/* Download-all panel with format picker */}
      {completed.length > 0 && (
        <Card className="space-y-4 border border-primary/20 bg-primary-soft/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-fg">
                <Archive className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  Download all recordings
                </p>
                <p className="text-sm text-ink-secondary mt-0.5 leading-relaxed">
                  ZIP folder of audio only — one{" "}
                  <span className="font-mono text-xs text-ink">
                    {`{slug}.${downloadFormat}`}
                  </span>{" "}
                  per conversation. No transcripts or extras.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => void downloadAll()}
              loading={zipping}
              className="shrink-0"
            >
              <FolderDown className="size-4" />
              Download {downloadFormat.toUpperCase()} ({completed.length})
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-primary/15">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Format
            </span>
            <div
              className="inline-flex rounded-full border border-border bg-bg/80 p-1"
              role="radiogroup"
              aria-label="Download audio format"
            >
              <button
                type="button"
                role="radio"
                aria-checked={downloadFormat === "mp3"}
                onClick={() => setDownloadFormat("mp3")}
                disabled={zipping}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  downloadFormat === "mp3"
                    ? "bg-primary text-primary-fg shadow-[var(--shadow-sm)]"
                    : "text-ink-secondary hover:text-ink"
                )}
              >
                MP3
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={downloadFormat === "wav"}
                onClick={() => setDownloadFormat("wav")}
                disabled={zipping}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  downloadFormat === "wav"
                    ? "bg-primary text-primary-fg shadow-[var(--shadow-sm)]"
                    : "text-ink-secondary hover:text-ink"
                )}
              >
                WAV
              </button>
            </div>
            <span className="text-xs text-muted">
              Audio files only · named by conversation title
            </span>
          </div>
        </Card>
      )}

      {downloadError && (
        <p className="text-sm text-danger bg-danger-soft rounded-[var(--radius-md)] px-4 py-3">
          {downloadError}
        </p>
      )}
      {downloadHint && !downloadError && (
        <p className="text-sm text-success bg-success-soft rounded-[var(--radius-md)] px-4 py-3">
          {downloadHint}
        </p>
      )}

      <div className="grid gap-4">
        {conversations.map((c, i) => {
          const audioSrc = c.audio?.mp3Url || c.audio?.wavUrl;
          const isOpen = openTranscript === c.id;

          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.05, 0.35),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-ink tracking-tight">
                      {c.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge tone="accent">{c.language}</Badge>
                      {c.tone && (
                        <Badge tone="primary">Tone: {c.tone}</Badge>
                      )}
                      <Badge>{c.turnCount} turns</Badge>
                      {c.audio && (
                        <>
                          <Badge>
                            {formatDuration(c.audio.durationSec)}
                          </Badge>
                          <Badge>
                            {formatBytes(c.audio.fileSizeBytes)}
                          </Badge>
                        </>
                      )}
                      {c.status === "error" && (
                        <Badge tone="danger">Failed</Badge>
                      )}
                      {c.status === "completed" && (
                        <Badge tone="success">Ready</Badge>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted mt-2">
                      {c.slug}.mp3
                    </p>
                  </div>
                </div>

                {c.status === "error" && (
                  <div className="flex gap-2 rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    {c.error || c.parseError || "Generation failed"}
                  </div>
                )}

                {audioSrc && c.status === "completed" && (
                  <AudioPlayer src={audioSrc} />
                )}

                <div className="flex flex-wrap gap-2">
                  {audioSrc && (
                    <a
                      href={audioSrc}
                      download={`${c.slug}${audioSrc.endsWith(".wav") ? ".wav" : ".mp3"}`}
                    >
                      <Button size="sm" variant="soft">
                        <Download className="size-3.5" />
                        Download{" "}
                        {audioSrc.endsWith(".wav") ? "WAV" : "MP3"}
                      </Button>
                    </a>
                  )}
                  {c.audio?.wavUrl && c.audio?.mp3Url && (
                    <a href={c.audio.wavUrl} download={`${c.slug}.wav`}>
                      <Button size="sm" variant="ghost">
                        <Download className="size-3.5" />
                        WAV
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onRegenerate(c.id)}
                    loading={regeneratingId === c.id}
                    disabled={!!c.parseError && c.turns.length === 0}
                  >
                    <RefreshCw className="size-3.5" />
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setOpenTranscript(isOpen ? null : c.id)
                    }
                  >
                    <FileText className="size-3.5" />
                    {isOpen ? "Hide" : "View"} transcript
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyTranscript(c)}
                  >
                    {copied === c.id ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied === c.id ? "Copied" : "Copy"}
                  </Button>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.pre
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className={cn(
                        "overflow-hidden text-sm leading-relaxed",
                        "rounded-[var(--radius-md)] bg-surface-2/90 border border-border",
                        "p-4 text-ink-secondary whitespace-pre-wrap font-sans max-h-72 overflow-y-auto"
                      )}
                    >
                      {c.transcript || "No transcript"}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
