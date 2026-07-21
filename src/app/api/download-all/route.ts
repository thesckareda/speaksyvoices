import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import JSZip from "jszip";
import { getJob } from "@/lib/job-store";
import type { Conversation } from "@/lib/types";

export const runtime = "nodejs";

type AudioFormat = "mp3" | "wav";

function folderNameFromFile(fileName: string): string {
  const base = (fileName || "conversations")
    .replace(/\.md$/i, "")
    .replace(/[^\w\-.\s]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return base || "conversations";
}

async function addAudioOnly(
  zip: JSZip,
  folder: string,
  conv: Conversation,
  format: AudioFormat
): Promise<boolean> {
  if (conv.status !== "completed" || !conv.audio) return false;
  const slug = conv.slug || "conversation";

  const preferredPath =
    format === "mp3"
      ? conv.audio.mp3Path || conv.audio.wavPath
      : conv.audio.wavPath || conv.audio.mp3Path;

  if (!preferredPath) return false;

  try {
    const data = await fs.readFile(preferredPath);
    let outExt = format;
    if (format === "mp3" && !conv.audio.mp3Path && conv.audio.wavPath) {
      outExt = "wav";
    } else if (format === "wav" && !conv.audio.wavPath && conv.audio.mp3Path) {
      outExt = "mp3";
    }
    zip.file(`${folder}/${slug}.${outExt}`, data);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      jobId?: string;
      fileName?: string;
      conversationIds?: string[];
      /** mp3 (default) or wav — audio only, no transcripts/manifest */
      format?: AudioFormat;
    };

    if (!body.jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const format: AudioFormat = body.format === "wav" ? "wav" : "mp3";

    const job = getJob(body.jobId);
    if (!job) {
      return NextResponse.json(
        {
          error:
            "Job not found on server (may have restarted). Use client download fallback.",
          code: "JOB_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const folder = folderNameFromFile(body.fileName || job.fileName);
    const zip = new JSZip();

    let count = 0;
    for (const conv of job.conversations) {
      if (
        body.conversationIds?.length &&
        !body.conversationIds.includes(conv.id)
      ) {
        continue;
      }
      const ok = await addAudioOnly(zip, folder, conv, format);
      if (ok) count += 1;
    }

    if (count === 0) {
      return NextResponse.json(
        {
          error:
            format === "mp3"
              ? "No MP3 files available to download"
              : "No WAV files available to download",
        },
        { status: 400 }
      );
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const zipName = `${folder}-${format}-recordings.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("Download-all error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ZIP failed" },
      { status: 500 }
    );
  }
}
