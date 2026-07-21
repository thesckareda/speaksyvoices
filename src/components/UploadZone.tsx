"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Upload,
  FolderOpen,
  Clock,
  PenLine,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Card } from "./ui";
import { cn } from "@/lib/utils";

const RECENT_KEY = "speaksy-recent-files";

const PASTE_PLACEHOLDER = `# Hinglish (EMI Reminder)

Agent:
Namaste! Main Priya bol rahi hoon...

User:
Haan, main Rahul bol raha hoon...

# Hindi (EMI Reminder)

Agent:
नमस्ते! मैं प्रिया बोल रही हूँ...

User:
हाँ, मैं राहुल बोल रहा हूँ...
`;

export interface RecentFile {
  name: string;
  size: number;
  content: string;
  at: number;
}

function loadRecent(): RecentFile[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(file: RecentFile) {
  const entry = {
    ...file,
    content: file.content.slice(0, 400_000),
  };
  const list = loadRecent().filter((f) => f.name !== file.name);
  list.unshift(entry);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {
    /* quota exceeded — ignore */
  }
}

function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "pasted-conversations"}.md`;
}

type InputMode = "upload" | "enter";

export function UploadZone({
  onFile,
  loading,
}: {
  onFile: (markdown: string, fileName: string) => void;
  loading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>("upload");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Empty on SSR + first client paint to avoid hydration mismatch with localStorage
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [pasteTitle, setPasteTitle] = useState("conversations");
  const [pasteBody, setPasteBody] = useState("");

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const submitContent = useCallback(
    (text: string, fileName: string) => {
      setError(null);
      if (!text.trim()) {
        setError("Please enter some Markdown dialogue before continuing.");
        return;
      }
      const name = fileName.toLowerCase().endsWith(".md")
        ? fileName
        : slugifyName(fileName);
      const entry: RecentFile = {
        name,
        size: new TextEncoder().encode(text).length,
        content: text,
        at: Date.now(),
      };
      saveRecent(entry);
      setRecent(loadRecent());
      onFile(text, name);
    },
    [onFile]
  );

  const handleText = useCallback(
    async (file: File) => {
      setError(null);
      if (
        !file.name.toLowerCase().endsWith(".md") &&
        file.type !== "text/markdown"
      ) {
        if (!file.type.startsWith("text/") && file.type !== "") {
          setError("Please upload a Markdown (.md) file.");
          return;
        }
      }
      if (file.size > 8 * 1024 * 1024) {
        setError("File is too large (max 8 MB).");
        return;
      }
      const text = await file.text();
      if (!text.trim()) {
        setError("The file appears to be empty.");
        return;
      }
      submitContent(text, file.name);
    },
    [submitContent]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleText(file);
    },
    [handleText]
  );

  const loadSample = async () => {
    try {
      const res = await fetch("/samples/emi-reminders.md");
      const text = await res.text();
      if (mode === "enter") {
        setPasteBody(text);
        setPasteTitle("emi-reminders");
        setError(null);
        return;
      }
      onFile(text, "emi-reminders.md");
    } catch {
      setError("Could not load sample file.");
    }
  };

  const submitPaste = () => {
    submitContent(pasteBody, pasteTitle || "conversations");
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-xl mx-auto space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink text-balance"
        >
          Conversations, as real phone calls
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="text-ink-secondary text-[15px] sm:text-base leading-relaxed"
        >
          Upload a Markdown file or paste dialogue directly. Speaksy detects
          every scenario, synthesizes natural voices with Cartesia, and exports
          one MP3 per conversation.
        </motion.p>
      </div>

      {/* Mode switch */}
      <div className="flex justify-center">
        <div
          className="inline-flex rounded-full border border-border bg-surface/80 p-1 shadow-[var(--shadow-sm)]"
          role="tablist"
          aria-label="Input method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => {
              setMode("upload");
              setError(null);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
              mode === "upload"
                ? "bg-primary text-primary-fg shadow-[var(--shadow-sm)]"
                : "text-ink-secondary hover:text-ink"
            )}
          >
            <Upload className="size-3.5" />
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "enter"}
            onClick={() => {
              setMode("enter");
              setError(null);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
              mode === "enter"
                ? "bg-primary text-primary-fg shadow-[var(--shadow-sm)]"
                : "text-ink-secondary hover:text-ink"
            )}
          >
            <PenLine className="size-3.5" />
            Enter data
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === "upload" ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card
              className={cn(
                "relative overflow-hidden transition-all duration-300 p-0",
                dragging &&
                  "ring-2 ring-primary shadow-[var(--shadow-glow)] scale-[1.01]"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center px-6 py-16 sm:py-20 text-center",
                  "bg-gradient-to-b from-primary-soft/40 to-transparent"
                )}
              >
                <div
                  className={cn(
                    "mb-6 flex size-16 items-center justify-center rounded-[20px]",
                    "bg-primary/10 text-primary border border-primary/15",
                    dragging && "scale-110"
                  )}
                >
                  <Upload className="size-7" strokeWidth={1.75} />
                </div>

                <p className="text-lg font-medium text-ink mb-1">
                  {dragging ? "Release to upload" : "Drag & drop your Markdown"}
                </p>
                <p className="text-sm text-muted mb-8 max-w-sm">
                  Supports multi-conversation files · Hinglish, Hindi, English &
                  more
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => inputRef.current?.click()}
                    loading={loading}
                  >
                    <FolderOpen className="size-4" />
                    Browse file
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => void loadSample()}
                    disabled={loading}
                  >
                    <FileText className="size-4" />
                    Try sample
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => setMode("enter")}
                    disabled={loading}
                  >
                    <PenLine className="size-4" />
                    Enter data
                  </Button>
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleText(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="enter"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary border border-primary/15">
                  <PenLine className="size-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink tracking-tight">
                    Enter conversation Markdown
                  </h2>
                  <p className="text-sm text-ink-secondary mt-1 leading-relaxed">
                    Paste or type Agent / User dialogue. Use headings for each
                    independent scenario.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="paste-title"
                  className="text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Title
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="paste-title"
                    type="text"
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder="conversations"
                    disabled={loading}
                    className={cn(
                      "flex-1 h-11 rounded-[var(--radius-md)] border border-border bg-bg px-3.5",
                      "text-sm text-ink placeholder:text-muted",
                      "focus:outline-none focus:ring-2 focus:ring-ring"
                    )}
                  />
                  <span className="text-sm text-muted shrink-0">.md</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="paste-body"
                    className="text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    Markdown content
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPasteBody(PASTE_PLACEHOLDER);
                      setError(null);
                    }}
                    className="text-xs text-primary hover:underline"
                    disabled={loading}
                  >
                    Insert template
                  </button>
                </div>
                <textarea
                  id="paste-body"
                  value={pasteBody}
                  onChange={(e) => setPasteBody(e.target.value)}
                  placeholder={PASTE_PLACEHOLDER}
                  disabled={loading}
                  spellCheck={false}
                  className={cn(
                    "w-full min-h-[280px] sm:min-h-[340px] resize-y rounded-[var(--radius-md)]",
                    "border border-border bg-bg px-4 py-3",
                    "font-mono text-[13px] leading-relaxed text-ink placeholder:text-muted/70",
                    "focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                />
                <p className="text-xs text-muted tabular-nums">
                  {pasteBody.trim()
                    ? `${pasteBody.length.toLocaleString()} characters · ${
                        pasteBody.split(/\n/).length
                      } lines`
                    : "Paste full multi-conversation Markdown here"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  size="lg"
                  onClick={submitPaste}
                  loading={loading}
                  disabled={!pasteBody.trim()}
                >
                  <Sparkles className="size-4" />
                  Analyze conversations
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => void loadSample()}
                  disabled={loading}
                >
                  <FileText className="size-4" />
                  Load sample
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => {
                    setPasteBody("");
                    setError(null);
                  }}
                  disabled={loading || !pasteBody}
                >
                  Clear
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-center text-sm text-danger bg-danger-soft rounded-[var(--radius-md)] px-4 py-3">
          {error}
        </p>
      )}

      {recent.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Clock className="size-3.5" />
            Recent
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((f) => (
              <button
                key={`${f.name}-${f.at}`}
                type="button"
                onClick={() => {
                  if (mode === "enter" && f.content?.trim()) {
                    setPasteBody(f.content);
                    setPasteTitle(f.name.replace(/\.md$/i, ""));
                    setError(null);
                    return;
                  }
                  if (f.content?.trim()) onFile(f.content, f.name);
                }}
                className={cn(
                  "text-left rounded-[var(--radius-md)] border border-border bg-surface/60",
                  "px-4 py-3 hover:border-primary/30 hover:bg-primary-soft/30 transition-colors"
                )}
              >
                <div className="flex items-start gap-3">
                  <FileText className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {f.name}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {(f.size / 1024).toFixed(1)} KB ·{" "}
                      {new Date(f.at).toLocaleDateString()}
                      {mode === "enter" ? " · Load into editor" : ""}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
