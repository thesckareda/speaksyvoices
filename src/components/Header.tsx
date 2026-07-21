"use client";

import { Moon, Sun, AudioLines } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/60",
        "glass-strong",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[12px] bg-primary text-primary-fg shadow-[var(--shadow-glow)]">
            <AudioLines className="size-5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight text-ink">
              Speaksy Voices
            </p>
            <p className="text-[11px] text-muted hidden sm:block">
              Markdown → phone-call audio
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-full size-10 p-0"
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
