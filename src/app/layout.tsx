import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Speaksy Voices — Markdown to AI Phone Calls",
  description:
    "Convert conversational Markdown into realistic AI phone-call audio with DeepSeek V4 Flash and Cartesia voice cloning.",
  keywords: [
    "Cartesia",
    "DeepSeek",
    "TTS",
    "phone call",
    "voice cloning",
    "Markdown",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
