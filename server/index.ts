import { eq, desc, sql, and, like, or } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  db,
  initDb,
  getSetting,
  setSetting,
  newId,
  nowIso,
  settings,
  voices,
  glyphArcs,
  songs,
  stems,
  AUDIO_DIR,
  DATA_DIR,
} from "./db";
import {
  renderStubSong,
  renderStubStems,
  generateLive,
  testLiveConnection,
  type EngineConfig,
} from "./engine";
import { bpmFromStyle, keyFromStyle } from "@shared/sketch";
import type { CreateSongInput, StemName } from "@shared/types";

initDb();

const PORT = Number(process.env.PORT ?? 3000);
const DIST_DIR = join(fileURLToPath(import.meta.url), "..", "..", "client", "dist");

function engineConfig(): EngineConfig {
  return {
    mode: getSetting("mode") === "live" ? "live" : "stub",
    engineUrl: getSetting("engineUrl") || "http://localhost:8001",
    model: getSetting("model") || "acestep-v15-turbo",
    apiKey: getSetting("apiKey") || "",
  };
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function saveAudio(id: string, bytes: Uint8Array, ext: string): Promise<string> {
  const filename = `${id}.${ext}`;
  await Bun.write(join(AUDIO_DIR, filename), bytes);
  return filename;
}

function rowToSong(row: typeof songs.$inferSelect) {
  return {
    ...row,
    humWords: JSON.parse(row.humWords || "[]") as string[],
    favorite: row.favorite === 1,
  };
}

async function createSongRows(
  input: CreateSongInput,
  cfg: EngineConfig,
): Promise<ReturnType<typeof rowToSong>[]> {
  const seedBase = input.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const bpm = input.bpm ?? bpmFromStyle(input.styleText ?? "", seedBase);
  const key = input.key ?? keyFromStyle(input.styleText ?? "", seedBase);
  const voice = input.voiceId
    ? db.select().from(voices).where(eq(voices.id, input.voiceId)).get()
    : undefined;
  const arc = input.glyphArcId
    ? db.select().from(glyphArcs).where(eq(glyphArcs.id, input.glyphArcId)).get()
    : undefined;
  const titleBase =
    input.title?.trim() ||
    (input.prompt || input.lyrics || "Untitled song").split("\n")[0].slice(0, 60) ||
    "Untitled song";
  const kind = input.kind ?? "song";
  const durationSec = input.durationSec ?? 30;

  const created: ReturnType<typeof rowToSong>[] = [];
  for (let v = 0; v < 2; v++) {
    const id = newId();
    const seed = seedBase + v * 101;
    const row = {
      id,
      title: `${titleBase} (${v === 0 ? "A" : "B"})`,
      kind,
      mode: input.mode,
      prompt: input.prompt,
      lyrics: input.lyrics ?? "",
      styleText: input.styleText ?? "",
      humWords: JSON.stringify(input.humWords ?? []),
      glyphArcId: arc?.id ?? null,
      glyphArcName: arc?.name ?? null,
      voiceId: voice?.id ?? null,
      voiceName: voice?.name ?? null,
      model: cfg.mode === "stub" ? "stub-sketch" : cfg.model,
      seed,
      engine: cfg.mode,
      status: cfg.mode === "stub" ? "ready" : "generating",
      audioPath: null as string | null,
      durationSec,
      favorite: 0,
      parentId: input.parentId ?? null,
      editNote: input.editNote ?? null,
      createdAt: nowIso(),
    };
    db.insert(songs).values(row).run();

    if (cfg.mode === "stub") {
      const rendered = renderStubSong({
        ...input,
        seed,
        bpm,
        key,
        durationSec,
      });
      const filename = await saveAudio(id, rendered.bytes, "wav");
      db.update(songs)
        .set({ audioPath: filename, durationSec: rendered.durationSec, status: "ready" })
        .where(eq(songs.id, id))
        .run();
      created.push(rowToSong({ ...row, audioPath: filename, durationSec: rendered.durationSec, status: "ready" }));
    } else {
      created.push(rowToSong(row));
      // Live: render in the background; the client polls for status.
      void (async () => {
        try {
          const rendered = await generateLive(cfg, {
            prompt: input.prompt,
            lyrics: input.lyrics,
            styleText: input.styleText,
            durationSec,
          });
          const filename = await saveAudio(id, rendered.bytes, "mp3");
          db.update(songs)
            .set({ audioPath: filename, durationSec: rendered.durationSec, status: "ready" })
            .where(eq(songs.id, id))
            .run();
        } catch (err) {
          db.update(songs)
            .set({ status: "failed" })
            .where(eq(songs.id, id))
            .run();
          console.error(`live generate failed for ${id}:`, err);
        }
      })();
    }
  }
  return created;
}

async function handleApi(req: Request, url: URL): Promise<Response | null> {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  // ---- settings ----
  if (parts[1] === "settings" && parts.length === 2) {
    if (method === "GET") {
      const cfg = engineConfig();
      return json({ mode: cfg.mode, engineUrl: cfg.engineUrl, model: cfg.model, hasApiKey: !!cfg.apiKey });
    }
    if (method === "PUT") {
      const body = await readJson(req);
      if (typeof body.mode === "string" && (body.mode === "stub" || body.mode === "live")) {
        setSetting("mode", body.mode);
      }
      if (typeof body.engineUrl === "string") setSetting("engineUrl", body.engineUrl);
      if (typeof body.model === "string") setSetting("model", body.model);
      if (typeof body.apiKey === "string") setSetting("apiKey", body.apiKey);
      return json({ ok: true });
    }
  }
  if (parts[1] === "settings" && parts[2] === "test" && method === "POST") {
    return json(await testLiveConnection(engineConfig()));
  }

  // ---- voices ----
  if (parts[1] === "voices" && parts.length === 2) {
    if (method === "GET") {
      return json(db.select().from(voices).orderBy(desc(voices.createdAt)).all());
    }
    if (method === "POST") {
      const body = await readJson(req);
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "A voice seat needs a name." }, 400);
      const row = {
        id: newId(),
        name,
        note: String(body.note ?? ""),
        color: String(body.color ?? "#5eeaff"),
        createdAt: nowIso(),
      };
      db.insert(voices).values(row).run();
      return json(row, 201);
    }
  }
  if (parts[1] === "voices" && parts.length === 3 && method === "DELETE") {
    db.delete(voices).where(eq(voices.id, parts[2])).run();
    return json({ ok: true });
  }

  // ---- glyph arcs ----
  if (parts[1] === "arcs" && parts.length === 2) {
    if (method === "GET") {
      return json(
        db
          .select()
          .from(glyphArcs)
          .orderBy(desc(glyphArcs.createdAt))
          .all()
          .map((r) => ({ ...r, glyphs: JSON.parse(r.glyphs) as string[] })),
      );
    }
    if (method === "POST") {
      const body = await readJson(req);
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "An arc needs a name." }, 400);
      const row = {
        id: newId(),
        name,
        bpm: Number(body.bpm ?? 96),
        key: String(body.key ?? "C"),
        glyphs: JSON.stringify(Array.isArray(body.glyphs) ? body.glyphs : []),
        createdAt: nowIso(),
      };
      db.insert(glyphArcs).values(row).run();
      return json({ ...row, glyphs: JSON.parse(row.glyphs) }, 201);
    }
  }
  if (parts[1] === "arcs" && parts.length === 3 && method === "DELETE") {
    db.delete(glyphArcs).where(eq(glyphArcs.id, parts[2])).run();
    return json({ ok: true });
  }

  // ---- songs ----
  if (parts[1] === "songs" && parts.length === 2) {
    if (method === "GET") {
      const q = url.searchParams.get("q")?.trim() ?? "";
      const favOnly = url.searchParams.get("favorites") === "1";
      let where = undefined;
      if (q) {
        const likeQ = `%${q}%`;
        where = or(
          like(songs.title, likeQ),
          like(songs.prompt, likeQ),
          like(songs.lyrics, likeQ),
          like(songs.styleText, likeQ),
        );
      }
      if (favOnly) {
        where = where ? and(where, eq(songs.favorite, 1)) : eq(songs.favorite, 1);
      }
      const rows = db
        .select()
        .from(songs)
        .where(where)
        .orderBy(desc(songs.createdAt))
        .all();
      return json(rows.map(rowToSong));
    }
    if (method === "POST") {
      const body = await readJson(req);
      const input: CreateSongInput = {
        title: typeof body.title === "string" ? body.title : undefined,
        mode: body.mode === "lyrics" ? "lyrics" : "simple",
        prompt: String(body.prompt ?? ""),
        lyrics: typeof body.lyrics === "string" ? body.lyrics : "",
        styleText: typeof body.styleText === "string" ? body.styleText : "",
        humWords: Array.isArray(body.humWords) ? body.humWords.map(String) : [],
        glyphArcId: typeof body.glyphArcId === "string" ? body.glyphArcId : null,
        voiceId: typeof body.voiceId === "string" ? body.voiceId : null,
        seed: typeof body.seed === "number" ? body.seed : undefined,
        bpm: typeof body.bpm === "number" ? body.bpm : undefined,
        key: typeof body.key === "string" ? body.key : undefined,
        durationSec: typeof body.durationSec === "number" ? body.durationSec : undefined,
      };
      if (!input.prompt && !input.lyrics) {
        return json({ error: "Give the song a prompt or some lyrics first." }, 400);
      }
      const created = await createSongRows(input, engineConfig());
      return json({ songs: created }, 201);
    }
  }

  if (parts[1] === "songs" && parts.length >= 3) {
    const songId = parts[2];
    const song = db.select().from(songs).where(eq(songs.id, songId)).get();
    if (!song) return json({ error: "Song not found." }, 404);

    if (parts.length === 3 && method === "GET") {
      const stemRows = db.select().from(stems).where(eq(stems.songId, songId)).all();
      return json({ ...rowToSong(song), stems: stemRows });
    }
    if (parts.length === 3 && method === "DELETE") {
      for (const s of db.select().from(stems).where(eq(stems.songId, songId)).all()) {
        try {
          await Bun.file(join(AUDIO_DIR, s.audioPath)).delete();
        } catch {}
      }
      if (song.audioPath) {
        try {
          await Bun.file(join(AUDIO_DIR, song.audioPath)).delete();
        } catch {}
      }
      db.delete(stems).where(eq(stems.songId, songId)).run();
      db.delete(songs).where(eq(songs.id, songId)).run();
      return json({ ok: true });
    }
    if (parts[3] === "favorite" && method === "POST") {
      const body = await readJson(req);
      const fav = body.favorite === true ? 1 : 0;
      db.update(songs).set({ favorite: fav }).where(eq(songs.id, songId)).run();
      return json({ ok: true, favorite: fav === 1 });
    }
    if (parts[3] === "extend" && method === "POST") {
      const body = await readJson(req);
      const created = await createSongRows(
        {
          title: `${song.title.replace(/ \([AB]\)$/, "")} (extended)`,
          mode: song.mode as "simple" | "lyrics",
          prompt: song.prompt,
          lyrics: `${song.lyrics}\n${String(body.extraLyrics ?? "")}`.trim(),
          styleText: song.styleText,
          humWords: JSON.parse(song.humWords || "[]"),
          glyphArcId: song.glyphArcId,
          voiceId: song.voiceId,
          seed: song.seed,
          durationSec: Math.min(120, song.durationSec + 30),
          parentId: song.id,
          kind: "extend",
          editNote: "Extended by 30 seconds.",
        },
        engineConfig(),
      );
      return json({ songs: created }, 201);
    }
    if (parts[3] === "cover" && method === "POST") {
      const body = await readJson(req);
      const created = await createSongRows(
        {
          title: `${song.title.replace(/ \([AB]\)$/, "")} (cover)`,
          mode: song.mode as "simple" | "lyrics",
          prompt: song.prompt,
          lyrics: song.lyrics,
          styleText: String(body.styleText ?? song.styleText),
          humWords: JSON.parse(song.humWords || "[]"),
          glyphArcId: song.glyphArcId,
          voiceId: typeof body.voiceId === "string" ? body.voiceId : song.voiceId,
          seed: song.seed + 7,
          durationSec: song.durationSec,
          parentId: song.id,
          kind: "cover",
          editNote: String(body.note ?? "Cover / remix."),
        },
        engineConfig(),
      );
      return json({ songs: created }, 201);
    }
    if (parts[3] === "section-edit" && method === "POST") {
      const body = await readJson(req);
      const section = String(body.section ?? "");
      const instruction = String(body.instruction ?? "");
      if (!instruction) return json({ error: "Say what should change, in plain words." }, 400);
      const lyrics = song.lyrics
        ? `${song.lyrics}\n[${section || "Edit"}: ${instruction}]`
        : song.lyrics;
      const created = await createSongRows(
        {
          title: `${song.title.replace(/ \([AB]\)$/, "")} (edited)`,
          mode: song.mode as "simple" | "lyrics",
          prompt: song.prompt,
          lyrics,
          styleText: song.styleText,
          humWords: JSON.parse(song.humWords || "[]"),
          glyphArcId: song.glyphArcId,
          voiceId: song.voiceId,
          seed: song.seed,
          durationSec: song.durationSec,
          parentId: song.id,
          kind: "section-edit",
          editNote: `${section || "Section"}: ${instruction}`,
        },
        engineConfig(),
      );
      return json({ songs: created }, 201);
    }
    if (parts[3] === "stems" && method === "POST") {
      const cfg = engineConfig();
      if (cfg.mode === "live") {
        // Live stem splitting needs the engine's multi-track response shape,
        // which is not yet confirmed against a real engine. Say so plainly
        // instead of faking stems.
        return json({
          ok: false,
          error:
            "Live stem splitting is not wired yet — the engine's stem response shape has not been confirmed against a real box. The first live stem run will wire it.",
        });
      }
      const rendered = renderStubStems({
        mode: song.mode as "simple" | "lyrics",
        prompt: song.prompt,
        lyrics: song.lyrics,
        seed: song.seed,
        durationSec: song.durationSec,
      });
      const out = [];
      for (const stem of rendered) {
        const id = newId();
        const filename = await saveAudio(`${songId}-${stem.name}`, stem.bytes, "wav");
        const row = {
          id,
          songId: song.id,
          name: stem.name as StemName,
          audioPath: filename,
          createdAt: nowIso(),
        };
        db.insert(stems).values(row).run();
        out.push(row);
      }
      return json({ stems: out }, 201);
    }
    if (parts[3] === "stems" && method === "GET") {
      return json(db.select().from(stems).where(eq(stems.songId, songId)).all());
    }
  }

  return null;
}

function contentTypeFor(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // Audio files
    if (url.pathname.startsWith("/audio/")) {
      const file = decodeURIComponent(url.pathname.slice("/audio/".length));
      if (file.includes("..") || file.includes("/")) return new Response("Not found", { status: 404 });
      const path = join(AUDIO_DIR, file);
      if (!existsSync(path)) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(path), {
        headers: { "Content-Type": contentTypeFor(file) },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const res = await handleApi(req, url).catch((err) => {
        console.error("API error:", err);
        return json({ error: "Something went wrong on the server." }, 500);
      });
      return res ?? json({ error: "Unknown API route." }, 404);
    }

    // Static client (production build)
    if (existsSync(DIST_DIR)) {
      let path = join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      if (!existsSync(path) || !Bun.file(path).size) path = join(DIST_DIR, "index.html");
      const file = Bun.file(path);
      const type = file.type || "application/octet-stream";
      return new Response(file, { headers: { "Content-Type": type } });
    }
    return new Response(
      "Client not built yet — run `bun run build` first, or `bun run dev` for development.",
      { status: 200, headers: { "Content-Type": "text/plain" } },
    );
  },
});

console.log(`Humasone listening on http://localhost:${server.port}`);
console.log(`Data directory: ${DATA_DIR}`);
