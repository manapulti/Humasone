# Hosting — the engine side

The app is light: it needs no GPU. The engine is the piece that sings, and it
runs on a GPU box. This note is the whole hosting shape.

## The two pieces

1. **The app** (this repo) — Bun server + React client. Runs anywhere Bun runs.
2. **The engine** — ACE-Step 1.5, by ACE Studio and StepFun:
   https://github.com/ace-step/ACE-Step-1.5

The app talks to the engine over one address, the engine's async REST API
(port 8001 by default). Going live is a settings flip in the app, not a rebuild.

## Engine setup (on the GPU box)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync
uv run acestep-api
```

That serves the API at `http://<box>:8001`. The repo's `./start_api_server.sh`
does the same thing, and Docker / compose from the repo is an equally valid
route. The optional Gradio UI on port 7860 is handy for a quick "does the
engine sing at all?" check before the app is connected.

First run downloads the models automatically — multi-GB, one-time.

## Model choice for an 8 GiB card

Use **ACE-Step 1.5, 2B turbo, with the small 0.6B language model** — the
combination the engine's own table assigns to 6–8 GiB of VRAM, using INT8 and
CPU offload where needed. About 10 GB of weights to download; roughly 4 GiB of
VRAM at render time.

Do **not** use the XL 4B model on an 8 GiB card — it needs 12 GiB of VRAM or
more. If a bigger box arrives later, XL is a one-line model swap.

## The real constraint: a GPU window

On a shared machine, the question is free VRAM at render time, not the card
itself. A song needs the card mostly to itself for roughly 30 seconds while it
renders. The hosting agreement is a GPU window: whatever else uses the card
pauses briefly for a render. No hardware change is needed for the trial.

## Connecting the app

1. Make the box reachable from where the app runs. Simplest is **Tailscale**:
   join the box to the same private tailnet and share its Tailscale address.
   A public address works too, but Tailscale avoids opening the engine to the
   internet.
2. In the app, open Engine settings, flip **stub → live**, set the engine
   address to `http://<box>:8001` (or its Tailscale address on the same port).
3. If the engine was started with an `ACESTEP_API_KEY`, put that same key in
   Engine settings. If no key was set, leave it blank. Share keys through a
   secure channel, never in a group chat.
4. Generate one test song and play it on Anthony's phone. His ear decides.

## Storage

- Engine, one-time: the repo plus a multi-GB model download.
- App data, growing slowly: each finished song and its stems as audio files,
  plus a small database row for its ledger entry. A personal library grows
  song by song; it is not a bulk archive.
- Working space: room for the engine to hold a song's parent audio while an
  extend, cover, or stem job runs.

## What the app does with audio

| Question | Answer |
| --- | --- |
| Generates audio? | Yes — the main job. Lyrics + prompt go to ACE-Step, which returns a finished song with sung vocals. |
| Stores audio? | Yes. Finished songs and stems are stored as audio files alongside their ledger entry. |
| Streams audio? | Playback only. The player plays stored songs back to the phone. Not a live-streaming or broadcast service. |
| Transcribes audio? | No. There is no speech-to-text transcription. |

## Docker

`docker-compose.yml` runs the app (not the engine) in a container:

```bash
docker compose up --build
```

The engine is expected to run on its own host (or its own container from the
ACE-Step repo) and be reachable at the address in Engine settings. Set
`ENGINE_URL`, `ENGINE_MODEL`, and `ENGINE_MODE` in the environment or in the
app's Engine settings page.

> Docker has not been verified in the environment where this repo was built
> (no Docker binary there). The compose file is provided from the standard
> Bun image layout; run it once on a machine with Docker and report back.
