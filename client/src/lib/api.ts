import type {
  CreateSongInput,
  GlyphArc,
  Settings,
  Song,
  Stem,
  Voice,
} from "@shared/types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  getSettings: () => req<Settings>("/api/settings"),
  saveSettings: (body: Partial<Settings> & { apiKey?: string }) =>
    req<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  testConnection: () => req<{ ok: boolean; detail: string }>("/api/settings/test", { method: "POST" }),

  listSongs: (q = "", favorites = false) =>
    req<Song[]>(`/api/songs?q=${encodeURIComponent(q)}&favorites=${favorites ? "1" : "0"}`),
  getSong: (id: string) => req<Song & { stems: Stem[] }>(`/api/songs/${id}`),
  createSongs: (input: CreateSongInput) =>
    req<{ songs: Song[] }>("/api/songs", { method: "POST", body: JSON.stringify(input) }),
  toggleFavorite: (id: string, favorite: boolean) =>
    req<{ ok: boolean }>(`/api/songs/${id}/favorite`, {
      method: "POST",
      body: JSON.stringify({ favorite }),
    }),
  deleteSong: (id: string) => req<{ ok: boolean }>(`/api/songs/${id}`, { method: "DELETE" }),
  extendSong: (id: string, extraLyrics = "") =>
    req<{ songs: Song[] }>(`/api/songs/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ extraLyrics }),
    }),
  coverSong: (id: string, styleText: string, voiceId?: string | null, note?: string) =>
    req<{ songs: Song[] }>(`/api/songs/${id}/cover`, {
      method: "POST",
      body: JSON.stringify({ styleText, voiceId, note }),
    }),
  sectionEdit: (id: string, section: string, instruction: string) =>
    req<{ songs: Song[] }>(`/api/songs/${id}/section-edit`, {
      method: "POST",
      body: JSON.stringify({ section, instruction }),
    }),
  makeStems: (id: string) =>
    req<{ stems: Stem[] } | { ok: boolean; error: string }>(`/api/songs/${id}/stems`, {
      method: "POST",
    }),
  getStems: (id: string) => req<Stem[]>(`/api/songs/${id}/stems`),

  listVoices: () => req<Voice[]>("/api/voices"),
  addVoice: (name: string, note: string, color: string) =>
    req<Voice>("/api/voices", { method: "POST", body: JSON.stringify({ name, note, color }) }),
  deleteVoice: (id: string) => req<{ ok: boolean }>(`/api/voices/${id}`, { method: "DELETE" }),

  listArcs: () => req<GlyphArc[]>("/api/arcs"),
  saveArc: (name: string, bpm: number, key: string, glyphs: string[]) =>
    req<GlyphArc>("/api/arcs", { method: "POST", body: JSON.stringify({ name, bpm, key, glyphs }) }),
  deleteArc: (id: string) => req<{ ok: boolean }>(`/api/arcs/${id}`, { method: "DELETE" }),
};

export function audioUrl(song: Song): string | null {
  return song.audioPath ? `/audio/${song.audioPath}` : null;
}

export function stemAudioUrl(stem: Stem): string {
  return `/audio/${stem.audioPath}`;
}
