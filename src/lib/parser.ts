import type { Conversation, DialogueTurn } from "./types";
import {
  estimateSpeechDuration,
  mapLanguageToCartesiaCode,
  uniqueSlug,
} from "./utils";
import { getVoiceConfig } from "./cartesia";
import { inferConversationTone, toneLabel } from "./tones";

const SPEAKER_RE =
  /^(Agent|User|AI|Assistant|Bot|System|Customer|Human|Client|Caller)\s*:\s*(.*)$/i;

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

const COMMENT_RE = /^\s*(<!--|\/\/|\/\*|\*|Note:|Notes:|Comment:|TODO:|#\s*$)/i;

function normalizeSpeaker(label: string): "agent" | "user" | null {
  const s = label.toLowerCase();
  if (["agent", "ai", "assistant", "bot", "system"].includes(s)) return "agent";
  if (["user", "customer", "human", "client", "caller"].includes(s)) return "user";
  return null;
}

function detectLanguageFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\bhinglish\b/.test(t)) return "Hinglish";
  if (/\bhindi\b|हिंदी|हिन्दी/.test(t)) return "Hindi";
  if (/\btelugu\b|తెలుగు/.test(t)) return "Telugu";
  if (/\btamil\b|தமிழ்/.test(t)) return "Tamil";
  if (/\bkannada\b|ಕನ್ನಡ/.test(t)) return "Kannada";
  if (/\bmarathi\b|मराठी/.test(t)) return "Marathi";
  if (/\benglish\b/.test(t)) return "English";
  if (/\bmixed\b/.test(t)) return "Mixed";
  // Script heuristics on title only
  if (/[\u0900-\u097F]/.test(title)) return "Hindi";
  if (/[\u0C00-\u0C7F]/.test(title)) return "Telugu";
  if (/[\u0B80-\u0BFF]/.test(title)) return "Tamil";
  if (/[\u0C80-\u0CFF]/.test(title)) return "Kannada";
  return "English";
}

function detectLanguageFromText(text: string, fallback: string): string {
  if (fallback && fallback !== "English") return fallback;
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]{3,}/.test(text);
  if (hasDevanagari && hasLatin) return "Hinglish";
  if (hasDevanagari) return "Hindi";
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
  if (/[\u0C80-\u0CFF]/.test(text)) return "Kannada";
  return fallback || "English";
}

interface RawBlock {
  title: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * Deterministic Markdown conversation splitter.
 * Splits on H1–H3 headings; collects Agent/User turns under each.
 * Also supports a single conversation with no heading.
 */
export function parseMarkdownDeterministic(
  markdown: string,
  _fileName: string
): { conversations: Conversation[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(HEADING_RE);

    if (heading) {
      if (current) {
        current.endLine = i;
        blocks.push(current);
      }
      current = {
        title: heading[2].trim(),
        startLine: i + 1,
        endLine: i + 1,
        lines: [],
      };
      continue;
    }

    if (!current) {
      // Implicit first conversation if dialogue appears before any heading
      if (SPEAKER_RE.test(line.trim())) {
        current = {
          title: "Conversation 1",
          startLine: i + 1,
          endLine: i + 1,
          lines: [line],
        };
      }
      continue;
    }

    current.lines.push(line);
    current.endLine = i + 1;
  }

  if (current) blocks.push(current);

  // If still nothing, try whole file as one conversation
  if (blocks.length === 0 && markdown.trim()) {
    blocks.push({
      title: "Conversation 1",
      startLine: 1,
      endLine: lines.length,
      lines: lines,
    });
  }

  const used = new Set<string>();
  const conversations: Conversation[] = blocks.map((block, idx) => {
    const turns = extractTurns(block.lines);
    const bodyText = turns.map((t) => t.text).join(" ");
    const langFromTitle = detectLanguageFromTitle(block.title);
    const language = detectLanguageFromText(bodyText, langFromTitle);

    // Scenario from parentheses: "Hinglish (EMI Reminder)"
    const scenarioMatch = block.title.match(/\(([^)]+)\)/);
    const scenario = scenarioMatch?.[1]?.trim();

    const totalText = bodyText;
    const estimatedDurationSec =
      estimateSpeechDuration(totalText) + turns.length * 0.55;

    const slug = uniqueSlug(block.title, used);
    const transcript = turns
      .map((t) => `${t.speaker === "agent" ? "Agent" : "User"}: ${t.text}`)
      .join("\n\n");

    let parseError: string | undefined;
    if (turns.length === 0) {
      parseError =
        "No valid Agent/User dialogue found in this section. Expected lines like 'Agent: ...' and 'User: ...'.";
      warnings.push(`Section "${block.title}" has no dialogue turns.`);
    } else if (turns.length === 1) {
      warnings.push(
        `Section "${block.title}" has only one turn — may sound incomplete.`
      );
    }

    const tone = inferConversationTone(transcript || totalText);
    const voiceDefaults = getVoiceConfig();

    return {
      id: `conv-${idx + 1}-${slug}`,
      title: block.title,
      slug,
      language,
      languageCode: mapLanguageToCartesiaCode(language),
      scenario,
      tone,
      toneReason: `Heuristic tone: ${toneLabel(tone)}`,
      voices: {
        agentVoiceId: voiceDefaults.agentVoiceId,
        userVoiceId: voiceDefaults.userVoiceId,
      },
      turns,
      turnCount: turns.length,
      estimatedDurationSec: Math.round(estimatedDurationSec),
      status: parseError ? "error" : "pending",
      progress: 0,
      error: parseError,
      parseError,
      sourceStartLine: block.startLine,
      sourceEndLine: block.endLine,
      transcript,
    } satisfies Conversation;
  });

  return { conversations, warnings };
}

function extractTurns(lines: string[]): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let currentSpeaker: "agent" | "user" | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentSpeaker && currentLines.length) {
      const text = currentLines.join("\n").trim();
      if (text) {
        turns.push({
          index: turns.length,
          speaker: currentSpeaker,
          text,
        });
      }
    }
    currentLines = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      // blank line can continue multi-line speech
      if (currentSpeaker) currentLines.push("");
      continue;
    }

    if (COMMENT_RE.test(trimmed) && !SPEAKER_RE.test(trimmed)) {
      continue;
    }

    // Skip pure metadata labels
    if (
      /^(language|lang|scenario|title|notes?|metadata)\s*:/i.test(trimmed) &&
      !SPEAKER_RE.test(trimmed)
    ) {
      continue;
    }

    const speakerMatch = trimmed.match(SPEAKER_RE);
    if (speakerMatch) {
      flush();
      const speaker = normalizeSpeaker(speakerMatch[1]);
      if (!speaker) continue;
      currentSpeaker = speaker;
      const rest = speakerMatch[2] ?? "";
      currentLines = rest ? [rest] : [];
      continue;
    }

    // Continuation of previous speaker's multi-line message
    if (currentSpeaker) {
      currentLines.push(trimmed);
    }
  }

  flush();
  return turns;
}
