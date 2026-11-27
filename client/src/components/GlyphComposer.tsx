import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { GLYPHS, type GlyphArc } from "@shared/types";
import { KEYS } from "@shared/sketch";

interface Props {
  glyphs: string[];
  onGlyphs: (g: string[]) => void;
  bpm: number;
  onBpm: (n: number) => void;
  keyName: string;
  onKey: (k: string) => void;
}

export function compileGlyphs(glyphs: string[]): string {
  const frags = glyphs
    .map((g) => GLYPHS.find((x) => x.glyph === g)?.fragment)
    .filter((f): f is string => !!f);
  return frags.join(", ");
}

export default function GlyphComposer({ glyphs, onGlyphs, bpm, onBpm, keyName, onKey }: Props) {
  const [arcs, setArcs] = useState<GlyphArc[]>([]);
  const [arcName, setArcName] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.listArcs().then(setArcs).catch(() => {});
  }, []);

  const compiled = compileGlyphs(glyphs);

  function place(g: string) {
    if (glyphs.length >= 8) return;
    onGlyphs([...glyphs, g]);
  }
  function clearSlot(i: number) {
    onGlyphs(glyphs.filter((_, idx) => idx !== i));
  }
  async function saveArc() {
    if (!arcName.trim()) return;
    try {
      const saved = await api.saveArc(arcName.trim(), bpm, keyName, glyphs);
      setArcs((a) => [saved, ...a]);
      setMsg(`Saved arc "${saved.name}".`);
      setArcName("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save the arc.");
    }
  }
  function loadArc(a: GlyphArc) {
    onGlyphs(a.glyphs);
    onBpm(a.bpm);
    onKey(a.key);
    setMsg(`Loaded arc "${a.name}".`);
  }

  return (
    <div className="card">
      <h3>Glyph composer</h3>
      <p className="sub">
        Tap a glyph to place it on the timeline. The timeline compiles into the style
        language the engine sings from.
      </p>
      <div className="glyphgrid">
        {GLYPHS.map((g) => (
          <button key={g.glyph} className="glyphbtn" type="button" title={g.name} onClick={() => place(g.glyph)}>
            {g.glyph}
          </button>
        ))}
      </div>
      <div className="timeline" data-testid="glyph-timeline">
        {Array.from({ length: 8 }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={`slot${glyphs[i] ? " filled" : ""}`}
            title={glyphs[i] ? "Tap to remove" : "Empty slot"}
            onClick={() => glyphs[i] && clearSlot(i)}
          >
            {glyphs[i] ?? "·"}
          </button>
        ))}
      </div>
      <div className="row">
        <label style={{ flex: 1 }}>
          BPM
          <input
            type="number"
            min={60}
            max={160}
            value={bpm}
            onChange={(e) => onBpm(Number(e.target.value) || 96)}
          />
        </label>
        <label style={{ flex: 1 }}>
          Key
          <select value={keyName} onChange={(e) => onKey(e.target.value)}>
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      {compiled && (
        <p>
          <strong>Compiled style:</strong> {compiled}, {bpm} BPM, key of {keyName}
        </p>
      )}
      <div className="row">
        <input
          placeholder="Name this arc to save it"
          value={arcName}
          onChange={(e) => setArcName(e.target.value)}
          style={{ flex: "1 1 160px", margin: 0 }}
        />
        <button type="button" onClick={saveArc} disabled={!arcName.trim() || glyphs.length === 0}>
          Save arc
        </button>
      </div>
      {arcs.length > 0 && (
        <details>
          <summary>Saved arcs ({arcs.length})</summary>
          {arcs.map((a) => (
            <div key={a.id} className="row" style={{ marginTop: 6 }}>
              <span style={{ flex: 1 }}>
                {a.name} — {a.glyphs.join(" ")} · {a.bpm} BPM · {a.key}
              </span>
              <button type="button" className="small" onClick={() => loadArc(a)}>
                Load
              </button>
              <button
                type="button"
                className="small danger"
                onClick={() => {
                  api.deleteArc(a.id).then(() => setArcs((x) => x.filter((y) => y.id !== a.id)));
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </details>
      )}
      {msg && <p className="sub">{msg}</p>}
    </div>
  );
}
