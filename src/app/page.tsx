"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppStep, Conversation } from "@/lib/types";
import { Header } from "@/components/Header";
import { UploadZone } from "@/components/UploadZone";
import { AnalysisView } from "@/components/AnalysisView";
import { GenerationView } from "@/components/GenerationView";
import { ResultsView } from "@/components/ResultsView";
import { StepPill } from "@/components/ui";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "analysis", label: "Analysis" },
  { id: "generation", label: "Generation" },
  { id: "results", label: "Results" },
];

export default function HomePage() {
  const [step, setStep] = useState<AppStep>("upload");
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [source, setSource] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [globalStage, setGlobalStage] = useState<string>();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const resetStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  };

  const subscribeJob = useCallback((id: string, onDone: () => void) => {
    resetStream();
    const es = new EventSource(`/api/generate?jobId=${id}`);
    eventSourceRef.current = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          type: string;
          job?: { conversations: Conversation[]; status: string };
          conversation?: Conversation;
          conversationId?: string;
          message?: string;
          stage?: string;
          status?: string;
        };

        if (data.type === "snapshot" && data.job) {
          setConversations(data.job.conversations);
        }

        if (data.type === "conversation_update" && data.conversation) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === data.conversation!.id
                ? { ...c, ...data.conversation }
                : c
            )
          );
        }

        if (data.type === "stage") {
          setGlobalStage(data.message || data.stage);
        }

        if (data.type === "job_complete") {
          if (data.job?.conversations) {
            setConversations(data.job.conversations);
          }
          resetStream();
          onDone();
        }

        if (data.type === "job_error") {
          setError(data.message || "Generation failed");
          resetStream();
          onDone();
        }
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      // Poll fallback once on error
      void fetch(`/api/jobs/${id}`)
        .then((r) => r.json())
        .then((job) => {
          if (job.conversations) setConversations(job.conversations);
          if (
            job.status === "completed" ||
            job.status === "cancelled" ||
            job.status === "error"
          ) {
            resetStream();
            onDone();
          }
        })
        .catch(() => {});
    };
  }, []);

  const handleFile = async (text: string, name: string) => {
    setError(null);
    setAnalyzing(true);
    setMarkdown(text);
    setFileName(name);
    setStep("analysis");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: text, fileName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setConversations(data.conversations);
      setWarnings(data.warnings || []);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("upload");
    } finally {
      setAnalyzing(false);
    }
  };

  const startGeneration = async (
    list: Conversation[],
    regenerateOnly?: string[]
  ) => {
    setError(null);
    setGenerating(true);
    setStep("generation");
    setGlobalStage("Starting generation…");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversations: list,
          fileName,
          regenerateOnly,
          concurrency: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");

      setJobId(data.jobId);
      subscribeJob(data.jobId, () => {
        setGenerating(false);
        setRegeneratingId(null);
        setStep("results");
        setGlobalStage(undefined);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setGenerating(false);
      setStep(regenerateOnly ? "results" : "analysis");
    }
  };

  const cancelAll = async () => {
    if (!jobId) return;
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
  };

  const cancelOne = async (conversationId: string) => {
    if (!jobId) return;
    await fetch(
      `/api/jobs/${jobId}?conversationId=${encodeURIComponent(conversationId)}`,
      { method: "DELETE" }
    );
  };

  const regenerate = async (id: string) => {
    setRegeneratingId(id);
    await startGeneration(conversations, [id]);
  };

  return (
    <>
      <div className="ambient" aria-hidden />
      <Header />

      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 sm:py-12">
          <div className="mb-10 flex justify-center">
            <StepPill steps={STEPS} current={step} />
          </div>

          {error && (
            <div className="mb-6 rounded-[var(--radius-md)] bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger text-center">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === "upload" && (
                <UploadZone onFile={handleFile} loading={analyzing} />
              )}

              {step === "analysis" && (
                <AnalysisView
                  conversations={conversations}
                  fileName={fileName}
                  warnings={warnings}
                  source={source}
                  loading={generating || analyzing}
                  onConversationsChange={setConversations}
                  onBack={() => {
                    setStep("upload");
                    setError(null);
                  }}
                  onGenerate={(selected) => {
                    setConversations(selected);
                    void startGeneration(selected);
                  }}
                />
              )}

              {step === "generation" && (
                <GenerationView
                  conversations={conversations}
                  globalStage={globalStage}
                  onCancel={() => void cancelAll()}
                  onCancelOne={(id) => void cancelOne(id)}
                />
              )}

              {step === "results" && (
                <ResultsView
                  conversations={conversations}
                  jobId={jobId}
                  fileName={fileName}
                  onRegenerate={(id) => void regenerate(id)}
                  regeneratingId={regeneratingId}
                  onBack={() => {
                    resetStream();
                    setStep("upload");
                    setConversations([]);
                    setJobId(null);
                    setMarkdown("");
                    setFileName("");
                    setWarnings([]);
                    setError(null);
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/50 py-6 text-center text-xs text-muted">
        Speaksy Voices · DeepSeek V4 Flash · Cartesia Sonic
        {markdown ? "" : ""}
      </footer>
    </>
  );
}
