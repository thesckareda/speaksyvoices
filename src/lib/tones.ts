/** Cartesia Sonic emotion values used for conversation tone */
export const CONVERSATION_TONES = [
  { id: "calm", label: "Calm", description: "Steady, professional phone manner" },
  { id: "neutral", label: "Neutral", description: "Balanced, everyday delivery" },
  { id: "content", label: "Content", description: "Warm, satisfied, reassuring" },
  { id: "confident", label: "Confident", description: "Assured, authoritative" },
  { id: "curious", label: "Curious", description: "Inquisitive, questioning" },
  { id: "sympathetic", label: "Sympathetic", description: "Empathetic support" },
  { id: "grateful", label: "Grateful", description: "Thankful, appreciative" },
  { id: "apologetic", label: "Apologetic", description: "Sorry, conciliatory" },
  { id: "enthusiastic", label: "Enthusiastic", description: "Upbeat, energetic" },
  { id: "happy", label: "Happy", description: "Cheerful, positive" },
  { id: "anxious", label: "Anxious", description: "Urgent, concerned" },
  { id: "frustrated", label: "Frustrated", description: "Irritated, impatient" },
  { id: "sad", label: "Sad", description: "Somber, disappointed" },
  { id: "determined", label: "Determined", description: "Firm, goal-focused" },
  { id: "peaceful", label: "Peaceful", description: "Soft, relaxed" },
] as const;

export type ConversationToneId = (typeof CONVERSATION_TONES)[number]["id"];

const TONE_SET = new Set<string>(CONVERSATION_TONES.map((t) => t.id));

export function normalizeTone(raw?: string | null): ConversationToneId {
  if (!raw) return "calm";
  const key = raw.toLowerCase().trim().replace(/\s+/g, "_");
  // Common synonyms from LLM free text
  const aliases: Record<string, ConversationToneId> = {
    professional: "calm",
    polite: "calm",
    friendly: "content",
    warm: "content",
    supportive: "sympathetic",
    empathetic: "sympathetic",
    urgent: "anxious",
    stressed: "anxious",
    angry: "frustrated",
    upset: "frustrated",
    cheerful: "happy",
    positive: "happy",
    excited: "enthusiastic",
    firm: "determined",
    assertive: "confident",
    formal: "calm",
    casual: "neutral",
    informative: "neutral",
    helpful: "calm",
  };
  if (TONE_SET.has(key)) return key as ConversationToneId;
  if (aliases[key]) return aliases[key];
  return "calm";
}

export function toneLabel(id: string): string {
  return CONVERSATION_TONES.find((t) => t.id === id)?.label ?? id;
}

/** Heuristic tone when DeepSeek is unavailable */
export function inferConversationTone(transcript: string): ConversationToneId {
  const t = transcript.toLowerCase();
  if (/sorry|apolog|maaf|क्षमा|regret/.test(t)) return "apologetic";
  if (/urgent|asap|immediately|जरूरी|overdue|late fee/.test(t)) return "anxious";
  if (/thank|धन्यवाद|grateful|appreciate/.test(t)) return "grateful";
  if (/angry|frustrated|complaint|नाराज/.test(t)) return "frustrated";
  if (/emi|payment|loan|reminder|due|balance|account/.test(t)) return "calm";
  if (/congrat|wonderful|great news|बधाई/.test(t)) return "happy";
  if (/\?/.test(t) && (t.match(/\?/g) || []).length >= 3) return "curious";
  return "calm";
}

