import { useEffect, useState } from "react";
import Create from "./components/Create";
import Library from "./components/Library";
import Player from "./components/Player";
import Settings from "./components/Settings";
import Voices from "./components/Voices";
import { api } from "./lib/api";
import type { Song } from "@shared/types";

type Tab = "create" | "library" | "voices" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("create");
  const [nowPlaying, setNowPlaying] = useState<Song | null>(null);
  const [mode, setMode] = useState<"stub" | "live">("stub");

  useEffect(() => {
    api.getSettings().then((s) => setMode(s.mode)).catch(() => {});
  }, []);

  function play(song: Song) {
    setNowPlaying(song);
  }

  return (
    <div className="app">
      <h1>Humasone</h1>
      <p className="sub">
        Your own music — prompt to song, lyrics, glyphs, hum-words, ledger, voice seats, stems.
        {mode === "stub" ? (
          <>
            {" "}Running in <strong>stub mode</strong>: songs are seeded tone-sketches, labelled as
            sketches, never presented as vocal renders.
          </>
        ) : (
          <>
            {" "}Running in <strong>live mode</strong>: songs go to your ACE-Step engine.
          </>
        )}
      </p>
      <nav className="tabs" aria-label="Sections">
        <button type="button" className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
          Create
        </button>
        <button type="button" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          Library
        </button>
        <button type="button" className={tab === "voices" ? "active" : ""} onClick={() => setTab("voices")}>
          Voices
        </button>
        <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Engine
        </button>
      </nav>
      {tab === "create" && <Create onPlay={play} settingsMode={mode} />}
      {tab === "library" && <Library onPlay={play} />}
      {tab === "voices" && <Voices />}
      {tab === "settings" && <Settings onModeChange={setMode} />}
      <Player song={nowPlaying} onClose={() => setNowPlaying(null)} />
    </div>
  );
}
