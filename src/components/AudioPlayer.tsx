"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { formatDuration, cn } from "@/lib/utils";

export function AudioPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      await a.play();
      setPlaying(true);
    }
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] bg-surface-2/80 px-3 py-2.5",
        className
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={() => void toggle()}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          "bg-primary text-primary-fg shadow-[var(--shadow-sm)]",
          "hover:bg-primary-hover transition-colors active:scale-95"
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={current}
          className="audio-scrub w-full"
          style={{
            background: `linear-gradient(to right, var(--primary) ${pct}%, var(--border) ${pct}%)`,
          }}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (audioRef.current) {
              audioRef.current.currentTime = t;
              setCurrent(t);
            }
          }}
        />
        <div className="flex justify-between text-[11px] tabular-nums text-muted">
          <span>{formatDuration(current)}</span>
          <span className="flex items-center gap-1">
            <Volume2 className="size-3" />
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
