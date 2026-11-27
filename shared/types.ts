// Shared types for the music app — used by the Bun server and the React client.
export type EngineMode = "stub" | "live";
export type SongKind = "song" | "extend" | "cover" | "section-edit";
export type StemName = "lead" | "bass" | "melody" | "pulse";

export interface Settings {
  mode: EngineMode;
  engineUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface Voice {
  id: string;
  name: string;
  note: string;
  color: string;
  createdAt: string;
}

export interface GlyphArc {
  id: string;
  name: string;
  bpm: number;
  key: string;
  glyphs: string[];
  createdAt: string;
}

export interface Stem {
  id: string;
  songId: string;
  name: StemName;
  audioPath: string;
  createdAt: string;
}

export interface Song {
  id: string;
  title: string;
  kind: SongKind;
  mode: "simple" | "lyrics";
  prompt: string;
  lyrics: string;
  styleText: string;
  humWords: string[];
  glyphArcId: string | null;
  glyphArcName: string | null;
  voiceId: string | null;
  voiceName: string | null;
  model: string;
  seed: number;
  engine: EngineMode;
  status: "ready" | "generating" | "failed";
  audioPath: string | null;
  durationSec: number;
  favorite: boolean;
  parentId: string | null;
  editNote: string | null;
  createdAt: string;
  stems?: Stem[];
}

export interface CreateSongInput {
  title?: string;
  mode: "simple" | "lyrics";
  prompt: string;
  lyrics?: string;
  styleText?: string;
  humWords?: string[];
  glyphArcId?: string | null;
  voiceId?: string | null;
  seed?: number;
  bpm?: number;
  key?: string;
  durationSec?: number;
  parentId?: string | null;
  kind?: SongKind;
  editNote?: string | null;
}

export const HUM_WORDS = ["humasone", "humunity", "humgod", "humhome", "humfield"] as const;

// Glyph vocabulary — each glyph compiles into a style fragment.
export const GLYPHS: { glyph: string; name: string; fragment: string }[] = [
  { glyph: "○", name: "Open", fragment: "open and airy" },
  { glyph: "●", name: "Deep", fragment: "deep and grounded" },
  { glyph: "▲", name: "Rise", fragment: "rising, lifting" },
  { glyph: "▼", name: "Fall", fragment: "falling, settling" },
  { glyph: "◆", name: "Bright", fragment: "bright and clear" },
  { glyph: "✦", name: "Spark", fragment: "sparkling, light on top" },
  { glyph: "~", name: "Flow", fragment: "flowing, unhurried" },
  { glyph: "∿", name: "Wave", fragment: "rolling like waves" },
  { glyph: "☾", name: "Night", fragment: "night-quiet, soft" },
  { glyph: "♪", name: "Song", fragment: "melody forward" },
  { glyph: "‖", name: "Hold", fragment: "held, steady" },
  { glyph: "✚", name: "Cross", fragment: "crossing over, turning" },
];

export const SECTION_TAGS = ["[Verse]", "[Chorus]", "[Bridge]", "[Inst]"] as const;
