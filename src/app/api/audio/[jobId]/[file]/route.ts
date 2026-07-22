import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getAudioDataDir } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; file: string }> }
) {
  const { jobId, file } = await params;

  // Prevent path traversal
  if (
    jobId.includes("..") ||
    file.includes("..") ||
    jobId.includes("/") ||
    file.includes("/") ||
    jobId.includes("\\") ||
    file.includes("\\")
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = path.join(getAudioDataDir(), jobId, file);

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(file).toLowerCase();
    const type =
      ext === ".mp3"
        ? "audio/mpeg"
        : ext === ".wav"
          ? "audio/wav"
          : "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${file}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
}
