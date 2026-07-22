import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { Conversation, DialogueTurn } from "./types";
import {
  getVoiceConfig,
  synthesizePcm,
  resolveTurnEmotion,
  getCartesiaApiKey,
} from "./cartesia";
import {
  interTurnPauseSec,
  mergePcmSegments,
  pcmToWav,
  pcmToMp3,
  pcmDurationSec,
  SAMPLE_RATE,
  silencePcm,
} from "./audio-merge";
import {
  emit,
  isConversationCancelled,
  updateConversation,
  updateJob,
  getJob,
} from "./job-store";
import { getAudioDataDir } from "./paths";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/** Demo mode: generate silent/tone placeholders when no Cartesia key */
async function synthesizeDemoPcm(text: string): Promise<Buffer> {
  const duration = Math.min(8, Math.max(1.2, text.split(/\s+/).length * 0.28));
  const samples = Math.floor(duration * SAMPLE_RATE);
  const buf = Buffer.alloc(samples * 2);
  // Soft sine tone as placeholder so players still work in demo mode
  const freq = 220 + (text.length % 80);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope =
      Math.min(1, i / (SAMPLE_RATE * 0.05)) *
      Math.min(1, (samples - i) / (SAMPLE_RATE * 0.08));
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.15 * envelope;
    const int16 = Math.max(-32767, Math.min(32767, Math.floor(sample * 32767)));
    buf.writeInt16LE(int16, i * 2);
  }
  return buf;
}

async function synthTurn(
  turn: DialogueTurn,
  voiceId: string,
  language: string,
  useDemo: boolean,
  conversationTone?: string
): Promise<Buffer> {
  if (useDemo) return synthesizeDemoPcm(turn.text);
  const emotion = resolveTurnEmotion(
    turn.speaker,
    turn.text,
    conversationTone,
    turn.emotion
  );
  return synthesizePcm({
    text: turn.text,
    voiceId,
    language,
    emotion,
    speed: turn.speaker === "agent" ? 0.98 : 1.02,
  });
}

export async function generateConversationAudio(
  jobId: string,
  conversation: Conversation
): Promise<void> {
  if (conversation.parseError || conversation.turns.length === 0) {
    updateConversation(jobId, conversation.id, {
      status: "error",
      error: conversation.parseError || "No turns to generate",
      progress: 0,
      progressLabel: "Skipped — parse error",
    });
    emit(jobId, {
      type: "conversation_error",
      jobId,
      conversationId: conversation.id,
      error: conversation.parseError,
    });
    return;
  }

  const useDemo = !getCartesiaApiKey();
  const defaults = getVoiceConfig();
  const agentVoiceId =
    conversation.voices?.agentVoiceId || defaults.agentVoiceId;
  const userVoiceId =
    conversation.voices?.userVoiceId || defaults.userVoiceId;
  const conversationTone = conversation.tone || "calm";

  try {
    updateConversation(jobId, conversation.id, {
      status: "preparing",
      progress: 5,
      progressLabel: `Preparing voices · tone: ${conversationTone}`,
      error: undefined,
    });

    if (isConversationCancelled(jobId, conversation.id)) return;

    const pcmSegments: Buffer[] = [];
    const pauses: number[] = [];
    let prevSpeaker: string | null = null;
    const total = conversation.turns.length;

    for (let i = 0; i < total; i++) {
      if (isConversationCancelled(jobId, conversation.id)) {
        updateConversation(jobId, conversation.id, {
          status: "cancelled",
          progressLabel: "Cancelled",
        });
        return;
      }

      const turn = conversation.turns[i];
      const isAgent = turn.speaker === "agent";

      updateConversation(jobId, conversation.id, {
        status: isAgent ? "generating_agent" : "generating_user",
        progress: 10 + Math.floor((i / total) * 70),
        progressLabel: isAgent
          ? `Generating Agent TTS (${i + 1}/${total})`
          : `Generating User speech (${i + 1}/${total})`,
      });

      const voiceId = isAgent ? agentVoiceId : userVoiceId;
      const pcm = await synthTurn(
        turn,
        voiceId,
        conversation.language,
        useDemo,
        conversationTone
      );

      if (prevSpeaker !== null) {
        pauses.push(
          interTurnPauseSec(prevSpeaker, turn.speaker, turn.text)
        );
      }
      pcmSegments.push(pcm);
      prevSpeaker = turn.speaker;
    }

    if (isConversationCancelled(jobId, conversation.id)) return;

    updateConversation(jobId, conversation.id, {
      status: "merging",
      progress: 85,
      progressLabel: "Merging conversation",
    });

    // Leading ring-like pause + trailing hang-up pause
    const merged = Buffer.concat([
      silencePcm(0.35),
      mergePcmSegments(pcmSegments, pauses),
      silencePcm(0.45),
    ]);

    updateConversation(jobId, conversation.id, {
      status: "exporting",
      progress: 92,
      progressLabel: "Exporting MP3",
    });

    const durationSec = pcmDurationSec(merged);
    const wav = pcmToWav(merged);
    const mp3 = await pcmToMp3(merged);

    const dataDir = getAudioDataDir();
    await ensureDir(path.join(dataDir, jobId));
    const base = conversation.slug;
    const wavName = `${base}.wav`;
    const mp3Name = `${base}.mp3`;
    const wavPath = path.join(dataDir, jobId, wavName);
    const mp3Path = path.join(dataDir, jobId, mp3Name);

    await fs.writeFile(wavPath, wav);
    let finalMp3Path = mp3Path;
    let fileSize = wav.length;
    let hasMp3 = false;

    if (mp3 && mp3.length > 0) {
      await fs.writeFile(mp3Path, mp3);
      fileSize = mp3.length;
      hasMp3 = true;
    } else {
      // Fall back: copy WAV as primary downloadable asset
      finalMp3Path = wavPath;
      fileSize = wav.length;
    }

    updateConversation(jobId, conversation.id, {
      status: "completed",
      progress: 100,
      progressLabel: useDemo ? "Completed (demo mode)" : "Completed",
      audio: {
        wavPath,
        mp3Path: hasMp3 ? mp3Path : undefined,
        wavUrl: `/api/audio/${jobId}/${wavName}`,
        mp3Url: hasMp3
          ? `/api/audio/${jobId}/${mp3Name}`
          : `/api/audio/${jobId}/${wavName}`,
        durationSec,
        fileSizeBytes: fileSize,
      },
    });

    emit(jobId, {
      type: "conversation_complete",
      jobId,
      conversationId: conversation.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    updateConversation(jobId, conversation.id, {
      status: "error",
      progress: 0,
      progressLabel: "Error",
      error: message,
    });
    emit(jobId, {
      type: "conversation_error",
      jobId,
      conversationId: conversation.id,
      error: message,
    });
  }
}

/** Run generation for a job with limited concurrency */
export async function runGenerationJob(
  jobId: string,
  concurrency = 2
): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const useDemo = !getCartesiaApiKey();
  emit(jobId, {
    type: "job_started",
    jobId,
    message: useDemo
      ? "Demo mode: placeholder tones (set CARTESIA_API_KEY for real voices)"
      : "Starting Cartesia voice generation",
  });
  emit(jobId, {
    type: "stage",
    jobId,
    stage: useDemo ? "demo" : "live",
    message: useDemo
      ? "Demo mode — natural speech requires Cartesia"
      : "Cartesia Sonic voices ready",
  });

  emit(jobId, {
    type: "stage",
    jobId,
    stage: "preparing",
    message: "Preparing voices",
  });

  const targets = job.regenerateOnly?.length
    ? job.conversations.filter((c) => job.regenerateOnly!.includes(c.id))
    : job.conversations.filter((c) => c.status !== "error" || c.turns.length > 0);

  // Mark queued
  for (const c of targets) {
    if (c.parseError) continue;
    updateConversation(jobId, c.id, {
      status: "queued",
      progress: 0,
      progressLabel: "Queued",
    });
  }

  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, targets.length) || 1 },
    async () => {
      while (index < targets.length) {
        if (getJob(jobId)?.cancelRequested) break;
        const current = targets[index++];
        if (!current) break;
        await generateConversationAudio(jobId, current);
      }
    }
  );

  await Promise.all(workers);

  const fresh = getJob(jobId);
  if (!fresh) return;

  if (fresh.cancelRequested) {
    updateJob(jobId, { status: "cancelled" });
    emit(jobId, { type: "job_complete", jobId, message: "Cancelled" });
    return;
  }

  updateJob(jobId, { status: "completed" });
  emit(jobId, {
    type: "job_complete",
    jobId,
    message: "All conversations processed",
  });
}

export function newJobId() {
  return uuidv4();
}
