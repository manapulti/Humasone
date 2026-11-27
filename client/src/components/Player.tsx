import { useEffect, useRef, useState } from "react";
import { audioUrl } from "../lib/api";
import type { Song } from "@shared/types";

interface Props {
  song: Song | null;
  onClose: () => void;
}

export default function Player({ song, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    const el = audioRef.current;
    if (el && song?.audioPath) {
      el.load();
      el.play().catch(() => {});
    }
  }, [song]);

  if (!song) return null;
  const src = audioUrl(song);
  const isSketch = song.engine === "stub";

  return (
    <div className="player" data-testid="player-bar">
      <audio
        ref={audioRef}
        src={src ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || song.durationSec)}
        data-testid="player-audio"
      />
      <div className="player-inner">
        <button
          type="button"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <div className="meta">
          <div className="t">
            {song.title} {isSketch && <span className="badge stub">TONE-SKETCH</span>}
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => {
              const el = audioRef.current;
              if (el) el.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }}
            aria-label="Seek"
          />
          <div className="sub" style={{ fontSize: 12 }}>
            {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, "0")} /{" "}
            {Math.floor((duration || song.durationSec) / 60)}:
            {String(Math.floor((duration || song.durationSec) % 60)).padStart(2, "0")}
            {song.voiceName ? ` · ${song.voiceName}` : ""}
          </div>
        </div>
        <button type="button" className="small" onClick={onClose} aria-label="Close player">
          ✕
        </button>
      </div>
    </div>
  );
}
