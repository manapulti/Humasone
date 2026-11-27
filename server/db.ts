import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR =
  process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const AUDIO_DIR = join(DATA_DIR, "audio");
mkdirSync(AUDIO_DIR, { recursive: true });

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const voices = sqliteTable("voices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  color: text("color").notNull().default("#5eeaff"),
  createdAt: text("created_at").notNull(),
});

export const glyphArcs = sqliteTable("glyph_arcs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bpm: integer("bpm").notNull(),
  key: text("key").notNull(),
  glyphs: text("glyphs").notNull(), // JSON array of glyph strings
  createdAt: text("created_at").notNull(),
});

export const songs = sqliteTable("songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("song"),
  mode: text("mode").notNull().default("simple"),
  prompt: text("prompt").notNull().default(""),
  lyrics: text("lyrics").notNull().default(""),
  styleText: text("style_text").notNull().default(""),
  humWords: text("hum_words").notNull().default("[]"), // JSON array
  glyphArcId: text("glyph_arc_id"),
  glyphArcName: text("glyph_arc_name"),
  voiceId: text("voice_id"),
  voiceName: text("voice_name"),
  model: text("model").notNull().default("stub-sketch"),
  seed: integer("seed").notNull(),
  engine: text("engine").notNull().default("stub"),
  status: text("status").notNull().default("ready"),
  audioPath: text("audio_path"),
  durationSec: real("duration_sec").notNull().default(0),
  favorite: integer("favorite").notNull().default(0),
  parentId: text("parent_id"),
  editNote: text("edit_note"),
  createdAt: text("created_at").notNull(),
});

export const stems = sqliteTable("stems", {
  id: text("id").primaryKey(),
  songId: text("song_id").notNull(),
  name: text("name").notNull(),
  audioPath: text("audio_path").notNull(),
  createdAt: text("created_at").notNull(),
});

const sqlite = new Database(join(DATA_DIR, "music.db"));
export const db: BunSQLiteDatabase = drizzle(sqlite);

export function initDb() {
  db.run(sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#5eeaff', created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS glyph_arcs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bpm INTEGER NOT NULL,
    key TEXT NOT NULL, glyphs TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'song',
    mode TEXT NOT NULL DEFAULT 'simple', prompt TEXT NOT NULL DEFAULT '',
    lyrics TEXT NOT NULL DEFAULT '', style_text TEXT NOT NULL DEFAULT '',
    hum_words TEXT NOT NULL DEFAULT '[]', glyph_arc_id TEXT, glyph_arc_name TEXT,
    voice_id TEXT, voice_name TEXT, model TEXT NOT NULL DEFAULT 'stub-sketch',
    seed INTEGER NOT NULL, engine TEXT NOT NULL DEFAULT 'stub',
    status TEXT NOT NULL DEFAULT 'ready', audio_path TEXT,
    duration_sec REAL NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT, edit_note TEXT, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS stems (
    id TEXT PRIMARY KEY, song_id TEXT NOT NULL, name TEXT NOT NULL,
    audio_path TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_songs_created ON songs(created_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_stems_song ON stems(song_id)`);

  // Seed default settings if absent.
  const existing = db.select().from(settings).all();
  const has = new Set(existing.map((r) => r.key));
  const defaults: Record<string, string> = {
    mode: "stub",
    engineUrl: "http://localhost:8001",
    model: "acestep-v15-turbo",
    apiKey: "",
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!has.has(k)) {
      db.insert(settings).values({ key: k, value: v }).run();
    }
  }
}

export function getSetting(key: string): string {
  const row = db.select().from(settings).where(sql`key = ${key}`).get();
  return row?.value ?? "";
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
