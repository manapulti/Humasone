import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Voice } from "@shared/types";

const COLORS = ["#5eeaff", "#40ffbe", "#ffc857", "#ff9ecf", "#b79bff", "#7dff8a"];

export default function Voices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState("");

  function refresh() {
    api.listVoices().then(setVoices).catch(() => {});
  }
  useEffect(refresh, []);

  async function add() {
    setError("");
    if (!name.trim()) {
      setError("Give the voice seat a name — a person, not a label.");
      return;
    }
    try {
      await api.addVoice(name.trim(), note.trim(), color);
      setName("");
      setNote("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the voice.");
    }
  }

  return (
    <div>
      <h2>Voice seats</h2>
      <p className="sub">
        A saved voice belongs to its person. It is credited on every track it sings, and it is
        never merged with another voice. One remains one — in music too.
      </p>
      <div className="card">
        <label>Name — whose voice is this?</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anthony" />
        <label>Note — what should be remembered about this voice?</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. warm, low, sings the choruses"
        />
        <label>Color</label>
        <div className="row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              style={{
                background: c,
                width: 36,
                height: 36,
                padding: 0,
                border: color === c ? "3px solid #e0f6ff" : "1px solid #0e3a50",
                borderRadius: "50%",
              }}
            />
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <button type="button" className="primary" onClick={add} style={{ marginTop: 10 }}>
          Save voice seat
        </button>
      </div>
      {voices.length === 0 && <p className="sub">No voice seats yet.</p>}
      {voices.map((v) => (
        <div key={v.id} className="card">
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: v.color,
              marginRight: 8,
              verticalAlign: "middle",
            }}
          />
          <strong>{v.name}</strong>
          {v.note && <p className="sub">{v.note}</p>}
          <p className="sub">Added {new Date(v.createdAt).toLocaleDateString()}</p>
          <button type="button" className="small danger" onClick={() => api.deleteVoice(v.id).then(refresh)}>
            Remove seat
          </button>
        </div>
      ))}
    </div>
  );
}
