import { NextRequest, NextResponse } from "next/server";
import type { Conversation } from "@/lib/types";
import { createJob, getJob, serializeJob, subscribe } from "@/lib/job-store";
import { newJobId, runGenerationJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      conversations: Conversation[];
      fileName?: string;
      regenerateOnly?: string[];
      concurrency?: number;
    };

    if (!body.conversations?.length) {
      return NextResponse.json(
        { error: "No conversations to generate" },
        { status: 400 }
      );
    }

    const jobId = newJobId();
    const conversations = body.conversations.map((c) => ({
      ...c,
      status:
        body.regenerateOnly?.includes(c.id)
          ? ("pending" as const)
          : c.status === "completed"
            ? ("completed" as const)
            : c.parseError
              ? ("error" as const)
              : ("pending" as const),
      progress: body.regenerateOnly?.includes(c.id) ? 0 : c.progress ?? 0,
    }));

    createJob(
      jobId,
      conversations,
      body.fileName || "conversations.md",
      body.regenerateOnly
    );

    // Fire and forget — clients subscribe via SSE
    const concurrency = Math.min(4, Math.max(1, body.concurrency ?? 2));
    void runGenerationJob(jobId, concurrency);

    return NextResponse.json({ jobId, status: "running" });
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to start generation",
      },
      { status: 500 }
    );
  }
}

/** SSE stream for live job progress */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* stream closed */
        }
      };

      // Initial snapshot
      send({ type: "snapshot", job: serializeJob(job) });

      cleanup = subscribe(jobId, (data) => send(data));

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      const checkDone = setInterval(() => {
        const j = getJob(jobId);
        if (
          j &&
          (j.status === "completed" ||
            j.status === "error" ||
            j.status === "cancelled")
        ) {
          send({ type: "job_complete", jobId, status: j.status, job: serializeJob(j) });
          clearInterval(checkDone);
          clearInterval(heartbeat);
          cleanup?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }, 500);

      // Safety timeout 10 min
      setTimeout(() => {
        clearInterval(heartbeat);
        clearInterval(checkDone);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* */
        }
      }, 10 * 60 * 1000);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
