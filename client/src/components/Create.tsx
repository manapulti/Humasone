import { useEffect, useState } from "react";
import { api, audioUrl } from "../lib/api";
import { HUM_WORDS, SECTION_TAGS, type Song, type Voice } from "@shared/types";
import GlyphComposer, { compileGlyphs } from "./GlyphComposer";

interface Props {
  onPlay: (song: Song) => void;
  settingsMode: "stub" | "live";
}

export default function Create({ onPlay, settingsMode }: Props) {
  const [mode, setMode] = useState<"simple" | "lyrics">("simple");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [humWords, setHumWords] = useState<string[]>([]);
  const [glyphs, setGlyphs] = useState<string[]>([]);
  const [bpm, setBpm] = useState(96);
  const [keyName, setKeyName] = useState("C");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.listVoices().then(setVoices).catch(() => {});
  }, []);

  function toggleHum(w: string) {
    setHumWords((h) => (h.includes(w) ? h.filter((x) => x !== w) : [...h, w]));
  }
  function insertTag(tag: string) {
    setLyrics((l) => (l ? `${l}\n${tag} ` : `${tag} `));
  }

  const glyphStyle = compileGlyphs(glyphs);
  const styleText = [glyphStyle, humWords.join(" "), bpm ? `${bpm} BPM` : "", keyName ? `key of ${keyName}` : ""]
    .filter(Boolean)
    .join(", ");

  async function generate() {
    setError("");
    setResults([]);
    if (!prompt.trim() && !lyrics.trim()) {
      setError("Give the song a prompt or some lyrics first.");
      return;
    }
    setBusy(true);
    setGenerating(settingsMode === "live");
    try {
      const { songs } = await api.createSongs({
        mode,
        prompt: prompt.trim(),
        lyrics: lyrics.trim(),
        styleText,
        humWords,
        voiceId: voiceId || null,
        bpm,
        key: keyName,
      });
      setResults(songs);
      if (settingsMode === "live") {
        // Live renders in the background — poll until both variations are ready.
        const ids = songs.map((s) => s.id);
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const fresh = await Promise.all(ids.map((id) => api.getSong(id).catch(() => null)));
          const done = fresh.filter((s): s is Song & { stems: [] } => !!s && s.status !== "generating");
          if (done.length === ids.length) {
            setResults(done as Song[]);
            break;
          }
        }
        setGenerating(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setGenerating(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Create a song</h2>
      <p className="sub">
        {settingsMode === "stub"
          ? "Stub mode: this makes a seeded tone-sketch so you can test every flow. It is a sketch, not a vocal render."
          : "Live mode: this sends the song to your ACE-Step engine and waits for real vocals."}
      </p>
      <div className="tabs">
        <button type="button" className={mode === "simple" ? "active" : ""} onClick={() => setMode("simple")}>
          Simple
        </button>
        <button type="button" className={mode === "lyrics" ? "active" : ""} onClick={() => setMode("lyrics")}>
          Custom Lyrics
        </button>
      </div>

      <label>Prompt — what should the song be about, and how should it sound?</label>
      <textarea
        data-testid="prompt-input"
        placeholder="e.g. A hopeful song about coming home, warm acoustic guitar, gentle and steady"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      {mode === "lyrics" && (
        <div>
          <label>Lyrics — tap a tag, then write that section</label>
          <div className="row" style={{ marginBottom: 4 }}>
            {SECTION_TAGS.map((t) => (
              <button key={t} type="button" className="tagbtn" onClick={() => insertTag(t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            data-testid="lyrics-input"
            placeholder={"[Verse]\nWe walked the long road home...\n\n[Chorus]\nAnd the hum was waiting..."}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            style={{ minHeight: 160 }}
          />
        </div>
      )}

      <GlyphComposer
        glyphs={glyphs}
        onGlyphs={setGlyphs}
        bpm={bpm}
        onBpm={setBpm}
        keyName={keyName}
        onKey={setKeyName}
      />

      <div className="card">
        <h3>Hum-words</h3>
        <p className="sub">Style words from the hum dictionary — tap to add them to the style.</p>
        <div>
          {HUM_WORDS.map((w) => (
            <button
              key={w}
              type="button"
              className={`chip${humWords.includes(w) ? " on" : ""}`}
              onClick={() => toggleHum(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <label>
          Voice seat — whose voice sings this? (A voice belongs to its person, credited on every track.)
        </label>
        <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
          <option value="">No voice seat — instrumental / default</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}
      <button
        type="button"
        className="primary"
        data-testid="generate-button"
        onClick={generate}
        disabled={busy}
        style={{ width: "100%" }}
      >
        {busy ? (generating ? "Singing on the engine — waiting…" : "Making your sketch…") : "Generate — 2 variations"}
      </button>

      {results.length > 0 && (
        <div>
          <h3>Your variations</h3>
          {results.map((s) => (
            <div key={s.id} className="card" data-testid="variation-card">
              <span className={`badge ${s.engine === "live" ? "live" : "stub"}`}>
                {s.engine === "live" ? "LIVE" : "TONE-SKETCH"}
              </span>
              <strong>{s.title}</strong>
              <p className="sub">
                {s.status === "generating"
                  ? "Still singing on the engine…"
                  : s.status === "failed"
                    ? "The engine failed this one — try again."
                    : `${Math.round(s.durationSec)}s · seed ${s.seed} · ${s.model}`}
                {s.voiceName ? ` · voice: ${s.voiceName}` : ""}
              </p>
              <div className="row">
                <button type="button" disabled={!s.audioPath} onClick={() => onPlay(s)}>
                  ▶ Play
                </button>
                {s.audioPath && (
                  <a href={audioUrl(s) ?? undefined} download>
                    <button type="button">Download</button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
