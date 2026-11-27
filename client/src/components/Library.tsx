import { useEffect, useState } from "react";
import { api, audioUrl, stemAudioUrl } from "../lib/api";
import type { Song, Stem } from "@shared/types";

interface Props {
  onPlay: (song: Song) => void;
}

const STEM_LABELS: Record<string, string> = {
  lead: "Lead",
  bass: "Bass",
  melody: "Melody",
  pulse: "Pulse",
};

export default function Library({ onPlay }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(Song & { stems: Stem[] }) | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [extraLyrics, setExtraLyrics] = useState("");
  const [coverStyle, setCoverStyle] = useState("");
  const [editSection, setEditSection] = useState("Chorus");
  const [editInstruction, setEditInstruction] = useState("");

  async function refresh() {
    try {
      setSongs(await api.listSongs(q, favOnly));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the library.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, favOnly]);

  async function open(song: Song) {
    if (openId === song.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(song.id);
    try {
      const d = await api.getSong(song.id);
      setDetail(d);
      setCoverStyle(d.styleText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the song.");
    }
  }

  async function toggleFav(song: Song) {
    await api.toggleFavorite(song.id, !song.favorite);
    refresh();
    if (detail?.id === song.id) setDetail({ ...detail, favorite: !song.favorite });
  }

  async function remove(song: Song) {
    if (!window.confirm(`Delete "${song.title}"? The audio file goes with it.`)) return;
    await api.deleteSong(song.id);
    setOpenId(null);
    setDetail(null);
    refresh();
  }

  async function doStems(song: Song) {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await api.makeStems(song.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        setMsg(`Split into ${res.stems.length} stems.`);
        const d = await api.getSong(song.id);
        setDetail(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stem split failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doExtend(song: Song) {
    setBusy(true);
    try {
      await api.extendSong(song.id, extraLyrics);
      setMsg("Extended version added to the library.");
      setExtraLyrics("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extend failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doCover(song: Song) {
    setBusy(true);
    try {
      await api.coverSong(song.id, coverStyle);
      setMsg("Cover added to the library.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cover failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doEdit(song: Song) {
    if (!editInstruction.trim()) return;
    setBusy(true);
    try {
      await api.sectionEdit(song.id, editSection, editInstruction.trim());
      setMsg("Edited version added to the library.");
      setEditInstruction("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Section edit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Library</h2>
      <div className="row">
        <input
          placeholder="Search title, prompt, lyrics, style…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 200px", margin: 0 }}
        />
        <button type="button" className={favOnly ? "primary" : ""} onClick={() => setFavOnly(!favOnly)}>
          ★ Favorites
        </button>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
      {songs.length === 0 && <p className="sub">Nothing here yet — go create a song.</p>}
      {songs.map((s) => (
        <div key={s.id} className="card">
          <span className={`badge ${s.engine === "live" ? "live" : "stub"}`}>
            {s.engine === "live" ? "LIVE" : "TONE-SKETCH"}
          </span>
          {s.favorite && <span className="badge fav">★ FAVORITE</span>}
          <strong>{s.title}</strong>
          <p className="sub">
            {new Date(s.createdAt).toLocaleString()} · {Math.round(s.durationSec)}s · seed {s.seed}
            {s.voiceName ? ` · voice: ${s.voiceName}` : ""}
            {s.parentId ? ` · from an earlier song` : ""}
          </p>
          <div className="row">
            <button type="button" disabled={!s.audioPath} onClick={() => onPlay(s)}>
              ▶ Play
            </button>
            <button type="button" onClick={() => open(s)}>
              {openId === s.id ? "Close" : "Details"}
            </button>
            <button type="button" onClick={() => toggleFav(s)}>
              {s.favorite ? "★ Unfavorite" : "☆ Favorite"}
            </button>
            <button type="button" className="danger" onClick={() => remove(s)}>
              Delete
            </button>
          </div>

          {openId === s.id && detail && (
            <div style={{ marginTop: 10 }}>
              <h3>Ledger — provenance for this track</h3>
              <dl className="kv">
                <dt>Prompt</dt>
                <dd>{detail.prompt || "—"}</dd>
                <dt>Lyrics</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{detail.lyrics || "—"}</dd>
                <dt>Style</dt>
                <dd>{detail.styleText || "—"}</dd>
                <dt>Hum-words</dt>
                <dd>{detail.humWords.join(", ") || "—"}</dd>
                <dt>Glyph arc</dt>
                <dd>{detail.glyphArcName || "—"}</dd>
                <dt>Voice credit</dt>
                <dd>{detail.voiceName || "No voice seat"}</dd>
                <dt>Model</dt>
                <dd>{detail.model}</dd>
                <dt>Seed</dt>
                <dd>{detail.seed}</dd>
                <dt>Engine</dt>
                <dd>{detail.engine === "live" ? "Live — ACE-Step" : "Stub — tone-sketch"}</dd>
                <dt>Created</dt>
                <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                {detail.editNote && (
                  <>
                    <dt>Note</dt>
                    <dd>{detail.editNote}</dd>
                  </>
                )}
              </dl>

              <h3>Stems</h3>
              {detail.stems.length === 0 ? (
                <p className="sub">
                  No stems yet. Splitting makes four playable, downloadable tracks — lead, bass,
                  melody, pulse. In stub mode they are split from the sketch; in live mode they
                  come from the engine.
                </p>
              ) : (
                detail.stems.map((st) => (
                  <div key={st.id} className="stemrow">
                    <span className="nm">{STEM_LABELS[st.name] ?? st.name}</span>
                    <button type="button" className="small" onClick={() => onPlay({ ...detail, audioPath: st.audioPath, title: `${detail.title} — ${st.name}` })}>
                      ▶ Play
                    </button>
                    <a href={stemAudioUrl(st)} download>
                      <button type="button" className="small">
                        Download
                      </button>
                    </a>
                  </div>
                ))
              )}
              <button type="button" onClick={() => doStems(detail)} disabled={busy}>
                {detail.stems.length ? "Re-split stems" : "Split stems"}
              </button>

              <h3>Extend</h3>
              <textarea
                placeholder="Extra lyrics for the extension (optional)"
                value={extraLyrics}
                onChange={(e) => setExtraLyrics(e.target.value)}
                style={{ minHeight: 60 }}
              />
              <button type="button" onClick={() => doExtend(detail)} disabled={busy}>
                Extend by 30 seconds
              </button>

              <h3>Cover / remix</h3>
              <label>New style for the cover</label>
              <input value={coverStyle} onChange={(e) => setCoverStyle(e.target.value)} />
              <button type="button" onClick={() => doCover(detail)} disabled={busy}>
                Make a cover
              </button>

              <h3>Edit a section — plain words</h3>
              <div className="row">
                <select value={editSection} onChange={(e) => setEditSection(e.target.value)} style={{ flex: 1 }}>
                  {["Verse", "Chorus", "Bridge", "Intro", "Outro"].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <input
                placeholder="e.g. make the chorus bigger and slower"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
              />
              <button type="button" onClick={() => doEdit(detail)} disabled={busy || !editInstruction.trim()}>
                Apply edit
              </button>

              {detail.audioPath && (
                <p style={{ marginTop: 10 }}>
                  <a href={audioUrl(detail) ?? undefined} download>
                    Download the full song
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
