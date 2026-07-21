/**
 * Pure PCM / WAV / MP3 helpers for stitching conversation turns
 * into a single phone-call style audio file.
 */

const SAMPLE_RATE = 44100;

export interface PcmSegment {
  pcm: Buffer;
  sampleRate: number;
}

/** Generate silence as 16-bit PCM little-endian mono */
export function silencePcm(durationSec: number, sampleRate = SAMPLE_RATE): Buffer {
  const samples = Math.max(0, Math.floor(durationSec * sampleRate));
  return Buffer.alloc(samples * 2, 0);
}

/** Natural inter-turn pause based on speaker change and text length */
export function interTurnPauseSec(
  prevSpeaker: string | null,
  nextSpeaker: string,
  nextText: string
): number {
  if (!prevSpeaker) return 0.15;
  const base = prevSpeaker === nextSpeaker ? 0.25 : 0.55;
  const lengthBoost = Math.min(0.35, nextText.length / 400);
  // Slight randomness for human feel (deterministic-ish from length)
  const jitter = ((nextText.length * 17) % 20) / 100; // 0–0.19
  return base + lengthBoost + jitter;
}

/** Concatenate PCM segments with optional leading silence on each (except first) */
export function mergePcmSegments(
  segments: Buffer[],
  pausesSec: number[],
  sampleRate = SAMPLE_RATE
): Buffer {
  const parts: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const pause = pausesSec[i - 1] ?? 0.5;
      parts.push(silencePcm(pause, sampleRate));
    }
    parts.push(segments[i]);
  }
  return Buffer.concat(parts);
}

/** Wrap mono 16-bit LE PCM into a WAV buffer */
export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE, channels = 1): Buffer {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export function pcmDurationSec(pcm: Buffer, sampleRate = SAMPLE_RATE): number {
  return pcm.length / 2 / sampleRate;
}

/**
 * Encode mono 16-bit LE PCM to MP3 using lamejs.
 * Falls back to null if encoder is unavailable.
 */
export async function pcmToMp3(
  pcm: Buffer,
  sampleRate = SAMPLE_RATE,
  kbps = 128
): Promise<Buffer | null> {
  try {
    // Maintained lamejs fork (original package breaks on modern Node)
    const lamejs = await import("@breezystack/lamejs");
    const Encoder = lamejs.Mp3Encoder ?? lamejs.default?.Mp3Encoder;
    if (!Encoder) throw new Error("Mp3Encoder not found in @breezystack/lamejs");

    const encoder = new Encoder(1, sampleRate, kbps);
    // Copy into a clean Int16Array (avoid SharedArrayBuffer / offset issues)
    const samples = new Int16Array(pcm.byteLength / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = pcm.readInt16LE(i * 2);
    }

    const blockSize = 1152;
    const mp3Chunks: Buffer[] = [];

    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, Math.min(i + blockSize, samples.length));
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Chunks.push(Buffer.from(mp3buf));
      }
    }

    const end = encoder.flush();
    if (end.length > 0) {
      mp3Chunks.push(Buffer.from(end));
    }

    const out = Buffer.concat(mp3Chunks);
    return out.length > 0 ? out : null;
  } catch (err) {
    console.error("MP3 encode failed:", err);
    return null;
  }
}

export { SAMPLE_RATE };
