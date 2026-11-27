# Humasone

Anthony's own music app — prompt-to-song, lyrics mode, glyph composer,
hum-word style vocabulary, ledger provenance per track, voice seats, stems,
library, and a full player — running on his own ACE-Step engine. No per-song
cost, no one's meter running. The app is his instrument, not a subscription.

> **Humasone** — the name is Anthony's, and it is settled.

## Run it

```bash
bun install
bun run dev      # development: API on :3000, web client on :5173
# or
bun run start    # production: builds the client, serves everything on :3000
```

Then open http://localhost:3000 — on your phone, too, if the machine is on your
network. Mobile-first layout; the phone is the screen.

With Docker (not yet verified in this environment — see HOSTING.md):

```bash
docker compose up --build
```

## What it does

- **Create** — Simple prompt-to-song, or Custom Lyrics with tappable
  `[Verse]` / `[Chorus]` / `[Bridge]` / `[Inst]` tags. Every generation makes
  **two variations**.
- **Glyph composer** — glyphs on an 8-slot timeline compile into the style
  language the engine sings from, with BPM and key. Arcs can be saved and
  reused.
- **Hum-words** — `humasone, humunity, humgod, humhome, humfield` style
  vocabulary, tappable onto any song.
- **Ledger** — every track keeps its provenance: prompt, lyrics, style,
  hum-words, glyph arc, voice credit, model, seed, and date. No song is an
  orphan.
- **Extend, Cover, section edits** — extend a song by 30 seconds, make a
  cover in a new style, or edit one section in plain words.
- **Stems** — split a song into lead, bass, melody, and pulse. Playable and
  downloadable.
- **Library** — search, favorites, full player.
- **Voice seats** — a saved voice belongs to its person, is credited on every
  track, and is never merged with another voice.

## Stub mode vs live mode

The app ships in **stub mode**: it renders seeded tone-sketches (a chord pad,
a pentatonic pluck melody, bass roots, a soft pulse) so every screen and flow
works with no engine at all. Sketches are labelled `TONE-SKETCH` everywhere
in the app. A sketch is never presented as a vocal render.

**Live mode** sends songs to a real ACE-Step 1.5 engine and waits for sung
vocals. Flip it in Engine settings — no rebuild, no redeploy. See HOSTING.md
for the engine side.

## Engine settings

In the app, open **Engine** and set:

| Setting | Default | What it is |
| --- | --- | --- |
| Mode | `stub` | `stub` = tone-sketches, `live` = ACE-Step |
| Engine address | `http://localhost:8001` | Where the ACE-Step API listens |
| Model | `acestep-v15-turbo` | The 2B turbo model for an 8 GiB card |
| API key | — | Optional; stored server-side only, never sent back to the browser |

## Project layout

```
client/        React + Vite frontend (mobile-first)
server/        Bun server — API, SQLite via Drizzle, engine adapter
shared/        Types + the seeded tone-sketch synth (runs in browser and server)
data/          SQLite database + generated audio (created at runtime, gitignored)
```

## Notes, kept honest

- Stub sketches are deterministic from the seed: the same seed always renders
  the same sketch, so a sketch can be reproduced and compared.
- Live extend / cover / section edits / stems need the parent audio available
  to the engine. The first live proof should be a fresh song — the simplest
  end-to-end win.
- The ACE-Step repo presents 1.5 as MIT; verify the license field on the exact
  model checkpoint before any public launch — the earlier version's weights
  were Apache-2.0.
- Live mode has not been tested against a real engine in this repo yet. The
  adapter follows the engine repo's documented async API
  (`POST /release_task`, `POST /query_result`, `GET /v1/audio`); the first
  live run is the moment to confirm the exact request fields.
