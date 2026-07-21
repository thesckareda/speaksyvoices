"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants = {
    primary:
      "bg-primary text-primary-fg hover:bg-primary-hover shadow-[var(--shadow-sm)]",
    secondary:
      "bg-surface text-ink border border-border hover:bg-surface-2 shadow-[var(--shadow-sm)]",
    ghost: "bg-transparent text-ink-secondary hover:bg-surface hover:text-ink",
    danger: "bg-danger-soft text-danger hover:opacity-90",
    soft: "bg-primary-soft text-primary hover:opacity-90",
  };
  const sizes = {
    sm: "h-9 px-3.5 text-sm rounded-[var(--radius-sm)] gap-1.5",
    md: "h-11 px-5 text-[15px] rounded-[var(--radius-md)] gap-2",
    lg: "h-[52px] px-7 text-base rounded-[var(--radius-md)] gap-2.5",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200",
        "disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const tones = {
    default: "bg-surface-2 text-ink-secondary",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  glass = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-6",
        glass ? "glass" : "bg-surface border border-border shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export const ProgressBar = forwardRef<
  HTMLDivElement,
  { value: number; className?: string; shimmer?: boolean }
>(function ProgressBar({ value, className, shimmer }, ref) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      ref={ref}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-border/80",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          shimmer ? "progress-shimmer" : "bg-primary"
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
});

export function StepPill({
  steps,
  current,
}: {
  steps: { id: string; label: string }[];
  current: string;
}) {
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <nav
      aria-label="Progress"
      className="flex items-center gap-1 sm:gap-2 overflow-x-auto"
    >
      {steps.map((step, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={step.id} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-4 sm:w-8",
                  done || active ? "bg-primary/50" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-sm transition-colors",
                active && "bg-primary-soft text-primary font-medium",
                done && !active && "text-ink-secondary",
                !done && !active && "text-muted"
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  active && "bg-primary text-primary-fg",
                  done && !active && "bg-success/20 text-success",
                  !done && !active && "bg-surface-2 text-muted"
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
