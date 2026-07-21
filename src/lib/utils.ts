import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80) || "conversation";
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function estimateSpeechDuration(text: string, wpm = 145): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const base = (words / wpm) * 60;
  // Pause overhead for phone-style pacing
  return Math.max(1.2, base * 1.15 + 0.35);
}

export function mapLanguageToCartesiaCode(language: string): string {
  const normalized = language.toLowerCase().trim();
  const map: Record<string, string> = {
    english: "en",
    en: "en",
    hindi: "hi",
    hi: "hi",
    hinglish: "hi",
    telugu: "te",
    te: "te",
    tamil: "ta",
    ta: "ta",
    kannada: "kn",
    kn: "kn",
    marathi: "mr",
    mr: "mr",
    gujarati: "gu",
    gu: "gu",
    bengali: "bn",
    bn: "bn",
    malayalam: "ml",
    ml: "ml",
    punjabi: "pa",
    pa: "pa",
    mixed: "en",
    "mixed-language": "en",
  };
  return map[normalized] ?? "en";
}

export function uniqueSlug(base: string, used: Set<string>): string {
  let slug = slugify(base);
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i += 1;
  const next = `${slug}-${i}`;
  used.add(next);
  return next;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
