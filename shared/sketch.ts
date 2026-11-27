// Seeded tone-sketch synth — pure TypeScript math, no WebAudio dependency,
// so the exact same render runs in the browser (client) and on the server (Bun).
// A sketch is honest: a seeded chord pad + pentatonic pluck melody + bass roots
// + soft pulse. It is labelled a sketch everywhere in the app, never a vocal render.

export const SKETCH_SAMPLE_RATE = 22050;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Note frequencies (equal temperament, A4 = 440).
const NOTE_FREQ: Record<string, number> = {};
{
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let midi = 21; midi <= 108; midi++) {
    const name = names[midi % 12] + (Math.floor(midi / 12) - 1);
    NOTE_FREQ[name] = 440 * Math.pow(2, (midi - 69) / 12);
  }
}

export const KEYS = ["C", "G", "D", "A", "F", "E"] as const;

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic steps

export interface SketchParams {
  seed: number;
  bpm?: number;
  key?: string;
  durationSec?: number;
  /** 0..1 brightness — brighter = more high plucks, darker = more pad */
  brightness?: number;
}

/** Pick a key from style text, falling back to the seed. */
export function keyFromStyle(styleText: string, seed: number): string {
  const m = styleText.match(/\b([A-G])\s?(major|minor)?\b/i);
  if (m) return m[1].toUpperCase();
  return KEYS[seed % KEYS.length];
}

export function bpmFromStyle(styleText: string, seed: number): number {
  const m = styleText.match(/(\d{2,3})\s*bpm/i);
  if (m) return Math.min(160, Math.max(60, parseInt(m[1], 10)));
  return 72 + ((seed * 7) % 48);
}

interface NoteEvent {
  start: number;
  dur: number;
  freq: number;
  gain: number;
  kind: "pad" | "pluck" | "bass" | "pulse";
}

function buildEvents(p: Required<SketchParams>): NoteEvent[] {
  const rnd = mulberry32(p.seed);
  const key = p.key;
  const beat = 60 / p.bpm;
  const bar = beat * 4;
  // I – vi – IV – V in the key, as scale degrees.
  const roots = [0, 5, 3, 4];
  const events: NoteEvent[] = [];
  const bars = Math.max(4, Math.round(p.durationSec / bar));
  const keyOffsets: Record<string, number> = { C: 0, G: 7, D: 2, A: 9, F: 5, E: 4 };
  const baseMidi = 48 + (keyOffsets[key] ?? 0);

  for (let b = 0; b < bars; b++) {
    const root = roots[b % roots.length];
    const rootMidi = baseMidi + [0, 2, 4, 5, 7, 9, 11][root % 7] + (root >= 7 ? 12 : 0);
    const t0 = b * bar;
    // Pad chord: root + third + fifth, whole bar.
    for (const iv of [0, 4, 7]) {
      const midi = rootMidi + 12 + iv;
      events.push({
        start: t0,
        dur: bar,
        freq: NOTE_FREQ[`${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`],
        gain: 0.05,
        kind: "pad",
      });
    }
    // Bass root, first beat of the bar.
    events.push({
      start: t0,
      dur: beat * 1.8,
      freq: 440 * Math.pow(2, (rootMidi - 12 - 69) / 12),
      gain: 0.16,
      kind: "bass",
    });
    // Pulse: soft thump on beats 1 and 3.
    for (const beatIdx of [0, 2]) {
      events.push({ start: t0 + beatIdx * beat, dur: 0.12, freq: 70, gain: 0.2, kind: "pulse" });
    }
    // Pluck melody: pentatonic walk, seeded.
    const steps = Math.floor(bar / (beat / 2));
    let deg = 2 + Math.floor(rnd() * 3);
    for (let s = 0; s < steps; s++) {
      if (rnd() < 0.35) continue; // leave air
      deg += Math.floor(rnd() * 5) - 2;
      deg = Math.max(0, Math.min(9, deg));
      const octave = deg >= 5 ? 12 : 0;
      const scaleDeg = PENTA[deg % 5] + octave;
      const midi = rootMidi + 24 + scaleDeg;
      const name = `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
      events.push({
        start: t0 + s * (beat / 2),
        dur: beat * 0.45,
        freq: NOTE_FREQ[name],
        gain: 0.09 + rnd() * 0.05,
        kind: "pluck",
      });
    }
  }
  return events;
}

function renderEvents(
  events: NoteEvent[],
  durationSec: number,
  kinds: Set<NoteEvent["kind"]> | null,
): Float32Array {
  const sr = SKETCH_SAMPLE_RATE;
  const n = Math.floor(durationSec * sr);
  const out = new Float32Array(n);
  for (const ev of events) {
    if (kinds && !kinds.has(ev.kind)) continue;
    const start = Math.floor(ev.start * sr);
    const len = Math.floor(ev.dur * sr);
    const attack = Math.floor(0.02 * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sr;
      const env =
        i < attack
          ? i / attack
          : Math.pow(1 - i / len, ev.kind === "pad" ? 0.7 : 1.6);
      let s: number;
      if (ev.kind === "pulse") {
        // soft sine thump with a quick pitch drop
        const f = ev.freq * (1 - (i / len) * 0.5);
        s = Math.sin(2 * Math.PI * f * t) * env;
      } else if (ev.kind === "pad") {
        // two detuned sines for warmth
        s =
          (Math.sin(2 * Math.PI * ev.freq * t) +
            0.6 * Math.sin(2 * Math.PI * ev.freq * 1.005 * t)) *
          env *
          0.6;
      } else {
        // pluck/bass: sine + a little harmonic
        s =
          (Math.sin(2 * Math.PI * ev.freq * t) +
            0.3 * Math.sin(2 * Math.PI * ev.freq * 2 * t)) *
          env;
      }
      out[start + i] += s * ev.gain;
    }
  }
  // gentle normalize to avoid clipping
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.9 ? 0.9 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/** Render the full sketch (all layers) as 16-bit PCM mono WAV bytes. */
export function renderSketchWav(params: SketchParams): Uint8Array {
  const p: Required<SketchParams> = {
    seed: params.seed,
    bpm: params.bpm ?? 96,
    key: params.key ?? "C",
    durationSec: params.durationSec ?? 30,
    brightness: params.brightness ?? 0.5,
  };
  const events = buildEvents(p);
  const pcm = renderEvents(events, p.durationSec, null);
  return encodeWav(pcm, SKETCH_SAMPLE_RATE);
}

/** Render one stem of the sketch. lead=plucks, bass=roots, melody=pad, pulse=thumps. */
export function renderStemWav(
  params: SketchParams,
  stem: "lead" | "bass" | "melody" | "pulse",
): Uint8Array {
  const p: Required<SketchParams> = {
    seed: params.seed,
    bpm: params.bpm ?? 96,
    key: params.key ?? "C",
    durationSec: params.durationSec ?? 30,
    brightness: params.brightness ?? 0.5,
  };
  const events = buildEvents(p);
  const kinds =
    stem === "lead"
      ? new Set<NoteEvent["kind"]>(["pluck"])
      : stem === "bass"
        ? new Set<NoteEvent["kind"]>(["bass"])
        : stem === "melody"
          ? new Set<NoteEvent["kind"]>(["pad"])
          : new Set<NoteEvent["kind"]>(["pulse"]);
  const pcm = renderEvents(events, p.durationSec, kinds);
  return encodeWav(pcm, SKETCH_SAMPLE_RATE);
}

export function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const dataLen = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Duration of a WAV byte buffer (assumes our 22050 Hz mono 16-bit format). */
export function wavDurationSec(wav: Uint8Array): number {
  if (wav.length < 44) return 0;
  const dataLen = wav.length - 44;
  return dataLen / 2 / SKETCH_SAMPLE_RATE;
}
