import JSZip from "jszip";
import type { Conversation } from "./types";

export type DownloadAudioFormat = "mp3" | "wav";

function folderNameFromFile(fileName: string): string {
  const base = (fileName || "conversations")
    .replace(/\.md$/i, "")
    .replace(/[^\w\-.\s]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return base || "conversations";
}

/**
 * Client-side ZIP: folder of audio only (MP3 or WAV — no transcripts/manifest).
 */
export async function buildRecordingsZip(
  conversations: Conversation[],
  sourceFileName: string,
  format: DownloadAudioFormat = "mp3"
): Promise<{ blob: Blob; zipName: string; folder: string; fileCount: number }> {
  const folder = folderNameFromFile(sourceFileName);
  const zip = new JSZip();
  const completed = conversations.filter(
    (c) => c.status === "completed" && c.audio && (c.audio.mp3Url || c.audio.wavUrl)
  );

  if (completed.length === 0) {
    throw new Error("No completed audio files to download");
  }

  let fileCount = 0;
  const ext = format === "wav" ? "wav" : "mp3";

  for (const conv of completed) {
    const slug = conv.slug || "conversation";

    // Prefer requested format; fall back to the other if missing
    const preferredUrl =
      format === "mp3"
        ? conv.audio?.mp3Url || conv.audio?.wavUrl
        : conv.audio?.wavUrl || conv.audio?.mp3Url;

    if (!preferredUrl) continue;

    const res = await fetch(preferredUrl);
    if (!res.ok) continue;

    const buf = await res.arrayBuffer();
    // Keep requested extension when possible; if we fell back, still use requested name
    // only when the preferred URL matches format, else use actual source extension
    let outExt = ext;
    if (format === "mp3" && !conv.audio?.mp3Url && conv.audio?.wavUrl) {
      outExt = "wav";
    } else if (format === "wav" && !conv.audio?.wavUrl && conv.audio?.mp3Url) {
      outExt = "mp3";
    }

    zip.file(`${folder}/${slug}.${outExt}`, buf);
    fileCount += 1;
  }

  if (fileCount === 0) {
    throw new Error(
      format === "mp3"
        ? "No MP3 files available to download"
        : "No WAV files available to download"
    );
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    blob,
    zipName: `${folder}-${format}-recordings.zip`,
    folder,
    fileCount,
  };
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
