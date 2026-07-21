import { mapLanguageToCartesiaCode } from "./utils";
import { SAMPLE_RATE } from "./audio-merge";
import type { CartesiaVoiceOption } from "./types";

const CARTESIA_API = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-03-01";

/** Default public Cartesia voices — override via env for cloned voices */
export function getVoiceConfig() {
  return {
    agentVoiceId:
      process.env.CARTESIA_AGENT_VOICE_ID ||
      "f786b574-daa5-4673-aa0c-cbe3e8534c02", // calm female default
    userVoiceId:
      process.env.CARTESIA_USER_VOICE_ID ||
      "a0e99841-438c-4a64-b679-ae501e7d6091", // male default
    modelId: process.env.CARTESIA_MODEL_ID || "sonic-3.5",
  };
}

export function getCartesiaApiKey(): string | null {
  return process.env.CARTESIA_API_KEY || null;
}

/** Built-in fallbacks when the List Voices API is unavailable */
export const FALLBACK_VOICES: CartesiaVoiceOption[] = [
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie — Calm Support",
    description: "Warm female — ideal for AI agent / support",
    language: "en",
    gender: "feminine",
  },
  {
    id: "a0e99841-438c-4a64-b679-ae501e7d6091",
    name: "Nathan — Clear Male",
    description: "Clear male — ideal for user / customer",
    language: "en",
    gender: "masculine",
  },
  {
    id: "694f9389-aac1-45b6-b726-9d9369183238",
    name: "Sarah — Professional",
    description: "Professional female",
    language: "en",
    gender: "feminine",
  },
  {
    id: "248be419-c632-4f23-adf1-5324ed7dbf1d",
    name: "Indian English Male",
    description: "Male voice suited to Indian English / Hinglish",
    language: "en",
    gender: "masculine",
  },
];

/**
 * List Cartesia voices (owned clones first, then public library).
 * Tries is_owner=true then a broader list.
 */
export async function listCartesiaVoices(): Promise<{
  voices: CartesiaVoiceOption[];
  source: "api" | "fallback";
  warning?: string;
}> {
  const apiKey = getCartesiaApiKey();
  if (!apiKey) {
    return {
      voices: FALLBACK_VOICES,
      source: "fallback",
      warning: "CARTESIA_API_KEY not set — showing default voice list.",
    };
  }

  try {
    const collected: CartesiaVoiceOption[] = [];
    const seen = new Set<string>();

    const fetchPage = async (params: string) => {
      const res = await fetch(`${CARTESIA_API}/voices?${params}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Cartesia-Version": CARTESIA_VERSION,
        },
      });
      if (!res.ok) {
        throw new Error(`List voices failed (${res.status})`);
      }
      return res.json() as Promise<{
        data?: Array<{
          id: string;
          name: string;
          description?: string;
          language?: string;
          gender?: string | null;
          is_owner?: boolean;
          is_pro?: boolean;
        }>;
        has_more?: boolean;
        next_page?: string | null;
      }>;
    };

    // Owned / cloned voices first
    let page = await fetchPage("limit=100&is_owner=true");
    for (const v of page.data || []) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      collected.push({
        id: v.id,
        name: v.name,
        description: v.description,
        language: v.language,
        gender: v.gender,
        isOwner: v.is_owner,
        isPro: v.is_pro,
      });
    }

    // Broader library (may include public + more)
    page = await fetchPage("limit=100");
    for (const v of page.data || []) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      collected.push({
        id: v.id,
        name: v.name,
        description: v.description,
        language: v.language,
        gender: v.gender,
        isOwner: v.is_owner,
        isPro: v.is_pro,
      });
    }

    if (collected.length === 0) {
      return {
        voices: FALLBACK_VOICES,
        source: "fallback",
        warning: "No voices returned from Cartesia — using defaults.",
      };
    }

    // Prefer owned voices at top
    collected.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

    return { voices: collected, source: "api" };
  } catch (err) {
    console.error("listCartesiaVoices:", err);
    return {
      voices: FALLBACK_VOICES,
      source: "fallback",
      warning:
        err instanceof Error
          ? `Could not load Cartesia voices: ${err.message}`
          : "Could not load Cartesia voices",
    };
  }
}

export interface TtsOptions {
  text: string;
  voiceId: string;
  language?: string;
  emotion?: string;
  speed?: number;
}

/**
 * Synthesize a single line of speech as raw 16-bit LE mono PCM.
 */
export async function synthesizePcm(options: TtsOptions): Promise<Buffer> {
  const apiKey = getCartesiaApiKey();
  if (!apiKey) {
    throw new Error(
      "CARTESIA_API_KEY is not set. Add it to your .env.local file."
    );
  }

  const { modelId } = getVoiceConfig();
  const language = mapLanguageToCartesiaCode(options.language || "en");

  const body: Record<string, unknown> = {
    model_id: modelId,
    transcript: options.text,
    voice: {
      mode: "id",
      id: options.voiceId,
    },
    language,
    output_format: {
      container: "raw",
      encoding: "pcm_s16le",
      sample_rate: SAMPLE_RATE,
    },
    generation_config: {
      speed: options.speed ?? 1.0,
      volume: 1.0,
      ...(options.emotion ? { emotion: options.emotion } : {}),
    },
  };

  const res = await fetch(`${CARTESIA_API}/tts/bytes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Cartesia TTS failed (${res.status}): ${errText.slice(0, 400) || res.statusText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Resolve emotion for a turn: prefer turn-level, then conversation tone,
 * then light text heuristics.
 */
export function resolveTurnEmotion(
  speaker: "agent" | "user",
  text: string,
  conversationTone?: string,
  turnEmotion?: string
): string | undefined {
  if (turnEmotion) return turnEmotion;
  if (conversationTone) return conversationTone;
  return inferEmotion(speaker, text);
}

/** Infer a light emotion from dialogue content for more natural phone delivery */
export function inferEmotion(
  speaker: "agent" | "user",
  text: string
): string | undefined {
  const t = text.toLowerCase();
  if (/sorry|apolog|maaf|क्षमा/.test(t)) return "apologetic";
  if (/thank|धन्यवाद|shukriya|thanks/.test(t)) return "grateful";
  if (/\?|क्या|कैसे|why|how|when|where/.test(t)) return "curious";
  if (/urgent|immediately|asap|जरूरी/.test(t)) return "anxious";
  if (/great|wonderful|excellent|बढ़िया|achha/.test(t)) return "content";
  if (speaker === "agent") return "calm";
  return "neutral";
}
