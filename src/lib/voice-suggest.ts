import type { CartesiaVoiceOption, Conversation } from "./types";
import { mapLanguageToCartesiaCode } from "./utils";

/** Cartesia language codes relevant to a conversation label */
export function languageCodesForConversation(
  language: string,
  languageCode?: string
): string[] {
  const codes = new Set<string>();
  const primary =
    languageCode || mapLanguageToCartesiaCode(language || "English");
  codes.add(primary);

  const n = (language || "").toLowerCase();
  if (n.includes("hinglish") || n.includes("mixed")) {
    codes.add("hi");
    codes.add("en");
  }
  if (n.includes("hindi")) codes.add("hi");
  if (n.includes("english")) codes.add("en");
  if (n.includes("telugu")) codes.add("te");
  if (n.includes("tamil")) codes.add("ta");
  if (n.includes("kannada")) codes.add("kn");
  if (n.includes("marathi")) codes.add("mr");
  if (n.includes("gujarati")) codes.add("gu");
  if (n.includes("bengali")) codes.add("bn");
  if (n.includes("malayalam")) codes.add("ml");
  if (n.includes("punjabi")) codes.add("pa");

  return [...codes];
}

function voiceLangRoot(v: CartesiaVoiceOption): string {
  return (v.language || "").toLowerCase().split(/[-_]/)[0] || "";
}

function textBlob(v: CartesiaVoiceOption): string {
  return `${v.name || ""} ${v.description || ""}`.toLowerCase();
}

/** Keyword hits for Indian / regional languages in name+description */
function keywordLangMatch(
  v: CartesiaVoiceOption,
  codes: string[]
): boolean {
  const t = textBlob(v);
  const checks: Record<string, string[]> = {
    hi: ["hindi", "hinglish", "indian", "devanagari", "bharat"],
    en: ["english", "american", "british", "indian english"],
    te: ["telugu", "andhra", "telugu"],
    ta: ["tamil", "chennai", "madurai"],
    kn: ["kannada", "bengaluru", "bangalore"],
    mr: ["marathi", "mumbai", "maharashtra"],
    gu: ["gujarati", "gujarat"],
    bn: ["bengali", "bangla"],
    ml: ["malayalam", "kerala"],
    pa: ["punjabi", "punjab"],
  };
  return codes.some((c) => (checks[c] || []).some((k) => t.includes(k)));
}

export function voiceMatchesLanguage(
  v: CartesiaVoiceOption,
  codes: string[]
): boolean {
  const root = voiceLangRoot(v);
  if (root && codes.includes(root)) return true;
  return keywordLangMatch(v, codes);
}

export function isClonedVoice(v: CartesiaVoiceOption): boolean {
  return Boolean(v.isOwner || v.isPro);
}

function genderScore(
  v: CartesiaVoiceOption,
  prefer: "feminine" | "masculine" | null
): number {
  if (!prefer || !v.gender) return 0;
  return v.gender === prefer ? 2 : v.gender === "gender_neutral" ? 1 : 0;
}

/**
 * Rank voices for Agent dropdown:
 * 1) language match  2) cloned  3) feminine bias  4) name
 */
export function rankAgentVoices(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string
): CartesiaVoiceOption[] {
  const codes = languageCodesForConversation(language, languageCode);
  return [...voices].sort((a, b) => {
    const aLang = voiceMatchesLanguage(a, codes) ? 1 : 0;
    const bLang = voiceMatchesLanguage(b, codes) ? 1 : 0;
    if (bLang !== aLang) return bLang - aLang;

    const aClone = isClonedVoice(a) ? 1 : 0;
    const bClone = isClonedVoice(b) ? 1 : 0;
    if (bClone !== aClone) return bClone - aClone;

    const aG = genderScore(a, "feminine");
    const bG = genderScore(b, "feminine");
    if (bG !== aG) return bG - aG;

    return (a.name || "").localeCompare(b.name || "");
  });
}

/**
 * Rank voices for User dropdown:
 * 1) cloned first  2) language match  3) masculine bias  4) name
 */
export function rankUserVoices(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string
): CartesiaVoiceOption[] {
  const codes = languageCodesForConversation(language, languageCode);
  return [...voices].sort((a, b) => {
    const aClone = isClonedVoice(a) ? 1 : 0;
    const bClone = isClonedVoice(b) ? 1 : 0;
    if (bClone !== aClone) return bClone - aClone;

    const aLang = voiceMatchesLanguage(a, codes) ? 1 : 0;
    const bLang = voiceMatchesLanguage(b, codes) ? 1 : 0;
    if (bLang !== aLang) return bLang - aLang;

    const aG = genderScore(a, "masculine");
    const bG = genderScore(b, "masculine");
    if (bG !== aG) return bG - aG;

    return (a.name || "").localeCompare(b.name || "");
  });
}

export interface VoiceGroups {
  suggested: CartesiaVoiceOption[];
  cloned: CartesiaVoiceOption[];
  other: CartesiaVoiceOption[];
}

/** Group for Agent select: Suggested (lang) → Cloned → Other */
export function groupAgentVoices(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string,
  currentId?: string
): VoiceGroups {
  const ranked = rankAgentVoices(ensureCurrent(voices, currentId), language, languageCode);
  const codes = languageCodesForConversation(language, languageCode);
  const suggested: CartesiaVoiceOption[] = [];
  const cloned: CartesiaVoiceOption[] = [];
  const other: CartesiaVoiceOption[] = [];
  const seen = new Set<string>();

  for (const v of ranked) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (voiceMatchesLanguage(v, codes)) suggested.push(v);
    else if (isClonedVoice(v)) cloned.push(v);
    else other.push(v);
  }
  return { suggested, cloned, other };
}

/** Group for User select: Cloned first → Suggested (lang) → Other */
export function groupUserVoices(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string,
  currentId?: string
): VoiceGroups {
  const ranked = rankUserVoices(ensureCurrent(voices, currentId), language, languageCode);
  const codes = languageCodesForConversation(language, languageCode);
  const cloned: CartesiaVoiceOption[] = [];
  const suggested: CartesiaVoiceOption[] = [];
  const other: CartesiaVoiceOption[] = [];
  const seen = new Set<string>();

  for (const v of ranked) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    // Cloned first — even if also language-matched, keep under Cloned
    if (isClonedVoice(v)) cloned.push(v);
    else if (voiceMatchesLanguage(v, codes)) suggested.push(v);
    else other.push(v);
  }
  return { suggested, cloned, other };
}

function ensureCurrent(
  voices: CartesiaVoiceOption[],
  currentId?: string
): CartesiaVoiceOption[] {
  if (!currentId || voices.some((v) => v.id === currentId)) return voices;
  return [
    {
      id: currentId,
      name: `Custom (${currentId.slice(0, 8)}…)`,
      description: "Currently selected voice",
    },
    ...voices,
  ];
}

export function suggestAgentVoiceId(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string
): string | undefined {
  const ranked = rankAgentVoices(voices, language, languageCode);
  return ranked[0]?.id;
}

export function suggestUserVoiceId(
  voices: CartesiaVoiceOption[],
  language: string,
  languageCode?: string
): string | undefined {
  const ranked = rankUserVoices(voices, language, languageCode);
  // Prefer cloned first (already ranked)
  return ranked[0]?.id;
}

export function applyLanguageVoiceDefaults(
  conversations: Conversation[],
  voices: CartesiaVoiceOption[]
): Conversation[] {
  if (!voices.length) return conversations;
  return conversations.map((c) => {
    const agent =
      suggestAgentVoiceId(voices, c.language, c.languageCode) ||
      c.voices?.agentVoiceId;
    const user =
      suggestUserVoiceId(voices, c.language, c.languageCode) ||
      c.voices?.userVoiceId;
    return {
      ...c,
      voices: {
        agentVoiceId: agent,
        userVoiceId: user,
      },
    };
  });
}

export function languageSuggestionLabel(language: string): string {
  const lang = (language || "this language").trim();
  return `Suggested for ${lang}`;
}
