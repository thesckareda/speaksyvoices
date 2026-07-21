import OpenAI from "openai";
import type { Conversation, DialogueTurn } from "./types";
import {
  estimateSpeechDuration,
  mapLanguageToCartesiaCode,
  uniqueSlug,
} from "./utils";
import { parseMarkdownDeterministic } from "./parser";
import {
  inferConversationTone,
  normalizeTone,
  toneLabel,
} from "./tones";
import { getVoiceConfig } from "./cartesia";

const SYSTEM_PROMPT = `You are an expert conversation analyst for a phone-call audio generation system.

Your job: analyze Markdown that may contain ONE OR MORE independent conversation scenarios between an AI Agent and a User.

Rules:
1. Detect every independent conversation. Never merge conversations.
2. Conversations typically start at markdown headings like "# Hinglish (EMI Reminder)" or "## Scenario Name".
3. Dialogue lines look like "Agent:" / "User:" (also "AI:", "Assistant:", "Customer:", "Bot:", "Human:").
4. Preserve exact dialogue order and exact text. NEVER translate.
5. Ignore comments, notes, instructions, or metadata that is not spoken dialogue.
6. Extract title, language, and scenario when available from headings or nearby labels.
7. Support unlimited conversations in one file.
8. If a conversation is malformed, still return it with an error field explaining the issue.
9. Language can be English, Hindi, Hinglish, Telugu, Tamil, Kannada, Marathi, or mixed.
10. Analyze the OVERALL emotional tone of each conversation for natural TTS delivery.
11. Optionally suggest a per-turn emotion when a line clearly differs from the overall tone.

Tone must be EXACTLY one of these Cartesia emotion values:
calm, neutral, content, confident, curious, sympathetic, grateful, apologetic,
enthusiastic, happy, anxious, frustrated, sad, determined, peaceful

Examples:
- EMI payment reminder / collections → calm or anxious
- Apology / service recovery → apologetic or sympathetic
- Sales / offers → enthusiastic or happy
- Support troubleshooting → calm or curious
- Angry customer → frustrated (conversation tone may still be calm for the agent; pick the dominant emotional register of the call)

Return ONLY valid JSON matching this schema:
{
  "conversations": [
    {
      "title": "string",
      "language": "string (e.g. Hinglish, Hindi, English)",
      "scenario": "string or null",
      "tone": "one of the allowed Cartesia emotions",
      "tone_reason": "one short sentence explaining the tone choice",
      "error": "string or null if malformed",
      "turns": [
        {
          "speaker": "agent" | "user",
          "text": "exact spoken text",
          "emotion": "optional Cartesia emotion for this line only, or null"
        }
      ]
    }
  ],
  "warnings": ["optional warnings"]
}`;

function getClient(): OpenAI | null {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

function defaultVoices() {
  const v = getVoiceConfig();
  return {
    agentVoiceId: v.agentVoiceId,
    userVoiceId: v.userVoiceId,
  };
}

function normalizeConversations(
  raw: Array<{
    title?: string;
    language?: string;
    scenario?: string | null;
    tone?: string | null;
    tone_reason?: string | null;
    error?: string | null;
    turns?: Array<{ speaker?: string; text?: string; emotion?: string | null }>;
  }>,
  fileName: string
): Conversation[] {
  const used = new Set<string>();
  const voices = defaultVoices();

  return raw.map((c, idx) => {
    const title = (c.title || `Conversation ${idx + 1}`).trim();
    const language = (c.language || "English").trim();
    const turns: DialogueTurn[] = [];
    for (const t of c.turns || []) {
      const speakerRaw = (t.speaker || "").toLowerCase();
      let speaker: "agent" | "user" | null = null;
      if (
        ["agent", "ai", "assistant", "bot", "system"].some((s) =>
          speakerRaw.includes(s)
        )
      ) {
        speaker = "agent";
      } else if (
        ["user", "customer", "human", "client", "caller"].some((s) =>
          speakerRaw.includes(s)
        )
      ) {
        speaker = "user";
      }
      if (!speaker || !t.text?.trim()) continue;
      turns.push({
        index: turns.length,
        speaker,
        text: t.text.trim(),
        emotion: t.emotion ? normalizeTone(t.emotion) : undefined,
      });
    }

    const totalText = turns.map((t) => t.text).join(" ");
    const estimatedDurationSec =
      estimateSpeechDuration(totalText) + turns.length * 0.55;

    const slug = uniqueSlug(title, used);
    const transcript = turns
      .map((t) => `${t.speaker === "agent" ? "Agent" : "User"}: ${t.text}`)
      .join("\n\n");

    const tone = normalizeTone(
      c.tone || inferConversationTone(transcript || totalText)
    );

    const parseError =
      c.error ||
      (turns.length === 0
        ? "No valid Agent/User dialogue turns found"
        : undefined);

    return {
      id: `conv-${idx + 1}-${slug}`,
      title,
      slug,
      language,
      languageCode: mapLanguageToCartesiaCode(language),
      scenario: c.scenario || undefined,
      tone,
      toneReason: c.tone_reason?.trim() || `Detected tone: ${toneLabel(tone)}`,
      voices: { ...voices },
      turns,
      turnCount: turns.length,
      estimatedDurationSec: Math.round(estimatedDurationSec),
      status: parseError ? "error" : "pending",
      progress: 0,
      error: parseError,
      parseError,
      transcript,
    } satisfies Conversation;
  });
}

/**
 * Analyze markdown with DeepSeek V4 Flash. Falls back to deterministic
 * parser if the API key is missing or the model call fails.
 */
export async function analyzeMarkdown(
  markdown: string,
  fileName: string
): Promise<{
  conversations: Conversation[];
  warnings: string[];
  source: "deepseek" | "deterministic";
}> {
  const client = getClient();

  if (!client) {
    const parsed = parseMarkdownDeterministic(markdown, fileName);
    return {
      ...parsed,
      warnings: [
        ...parsed.warnings,
        "DEEPSEEK_API_KEY not set — used deterministic Markdown parser.",
      ],
      source: "deterministic",
    };
  }

  try {
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `File name: ${fileName}\n\nAnalyze this Markdown: detect every independent conversation, extract dialogue, and set the best delivery tone for each call:\n\n\`\`\`markdown\n${markdown}\n\`\`\``,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from DeepSeek");
    }

    const parsed = JSON.parse(content) as {
      conversations?: unknown[];
      warnings?: string[];
    };

    if (!Array.isArray(parsed.conversations) || parsed.conversations.length === 0) {
      const det = parseMarkdownDeterministic(markdown, fileName);
      return {
        ...det,
        warnings: [
          ...(parsed.warnings || []),
          ...det.warnings,
          "DeepSeek returned no conversations — used deterministic parser.",
        ],
        source: "deterministic",
      };
    }

    const conversations = normalizeConversations(
      parsed.conversations as Parameters<typeof normalizeConversations>[0],
      fileName
    );

    if (conversations.every((c) => c.turns.length === 0)) {
      const det = parseMarkdownDeterministic(markdown, fileName);
      return {
        ...det,
        warnings: [
          ...(parsed.warnings || []),
          "DeepSeek produced empty turns — used deterministic parser.",
        ],
        source: "deterministic",
      };
    }

    return {
      conversations,
      warnings: parsed.warnings || [],
      source: "deepseek",
    };
  } catch (err) {
    console.error("DeepSeek analysis failed, falling back:", err);
    const det = parseMarkdownDeterministic(markdown, fileName);
    return {
      ...det,
      warnings: [
        ...det.warnings,
        `DeepSeek analysis failed (${err instanceof Error ? err.message : "unknown"}) — used deterministic parser.`,
      ],
      source: "deterministic",
    };
  }
}
