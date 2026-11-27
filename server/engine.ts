// Engine adapter — stub and live (ACE-Step 1.5 async REST API).
//
// Stub mode renders a seeded tone-sketch with the shared synth. It is labelled
// a sketch everywhere in the app and is never presented as a vocal render.
//
// Live mode talks to ACE-Step's async API, as documented in the engine repo
// (https://github.com/ace-step/ACE-Step-1.5):
//   POST {baseUrl}/release_task   -> { task_id }
//   POST {baseUrl}/query_result   -> { status, ... }   (poll until done)
//   GET  {baseUrl}/v1/audio?task_id=... -> the finished audio bytes
//
// Honest note: the exact request field names for /release_task vary slightly
// between ACE-Step releases. The adapter below follows the repo's documented
// async flow; the first live run against a real engine is the moment to confirm
// the field names, and the adapter is the one file to adjust. Retries are
// built into polling so a flaky GPU box does not lose a song.

import { renderSketchWav, renderStemWav, wavDurationSec } from "@shared/sketch";
import type { CreateSongInput, StemName } from "@shared/types";

export interface EngineConfig {
  mode: "stub" | "live";
  engineUrl: string;
  model: string;
  apiKey: string;
}

export interface RenderedAudio {
  bytes: Uint8Array;
  durationSec: number;
  model: string;
}

function sketchParams(input: CreateSongInput) {
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);
  return {
    seed,
    bpm: input.bpm ?? 96,
    key: input.key ?? "C",
    durationSec: input.durationSec ?? 30,
  };
}

/** Stub: render a seeded tone-sketch for a new song / variation. */
export function renderStubSong(input: CreateSongInput): RenderedAudio {
  const p = sketchParams(input);
  const bytes = renderSketchWav(p);
  return { bytes, durationSec: wavDurationSec(bytes), model: "stub-sketch" };
}

/** Stub: render the four stems of a sketch (same seed, one layer each). */
export function renderStubStems(
  input: CreateSongInput,
): { name: StemName; bytes: Uint8Array }[] {
  const p = sketchParams(input);
  const names: StemName[] = ["lead", "bass", "melody", "pulse"];
  return names.map((name) => ({ name, bytes: renderStemWav(p, name) }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export interface LiveGenerateInput {
  prompt: string;
  lyrics?: string;
  styleText?: string;
  durationSec?: number;
  /** For extend/cover/repaint: the parent audio the engine works from. */
  parentAudioPath?: string;
  taskType?: "generate" | "extend" | "cover" | "repaint" | "stems";
}

/**
 * Live: submit a job to ACE-Step and wait for the finished audio.
 * Polls with backoff and retries transient failures; throws on a hard failure
 * so the caller can mark the song failed instead of faking audio.
 */
export async function generateLive(
  cfg: EngineConfig,
  input: LiveGenerateInput,
): Promise<RenderedAudio> {
  const base = cfg.engineUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    lyrics: input.lyrics ?? "",
    style: input.styleText ?? "",
    model: cfg.model,
    audio_duration: input.durationSec ?? 120,
    format: "mp3",
  };
  if (input.taskType && input.taskType !== "generate") {
    payload.task_type = input.taskType;
  }

  const released = await fetchJson(
    `${base}/release_task`,
    { method: "POST", headers, body: JSON.stringify(payload) },
    "release_task",
  );
  const taskId = String(released.task_id ?? released.taskId ?? "");
  if (!taskId) throw new Error("release_task returned no task_id");

  // Poll until the task finishes. A 4-minute song can take a couple of minutes
  // on a small card, so be patient and retry transient poll errors.
  const deadline = Date.now() + 15 * 60 * 1000;
  let consecutiveErrors = 0;
  for (;;) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the engine");
    await sleep(5000);
    let result: Record<string, unknown>;
    try {
      result = await fetchJson(
        `${base}/query_result`,
        { method: "POST", headers, body: JSON.stringify({ task_id: taskId }) },
        "query_result",
      );
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) throw err;
      continue;
    }
    const status = String(result.status ?? result.state ?? "").toLowerCase();
    if (status === "failed" || status === "error") {
      throw new Error(`engine task failed: ${JSON.stringify(result).slice(0, 300)}`);
    }
    if (status === "done" || status === "completed" || status === "success") {
      const audioRes = await fetch(`${base}/v1/audio?task_id=${encodeURIComponent(taskId)}`, {
        headers,
      });
      if (!audioRes.ok) {
        throw new Error(`fetching audio failed (${audioRes.status})`);
      }
      const buf = new Uint8Array(await audioRes.arrayBuffer());
      const durationSec =
        typeof result.duration === "number"
          ? result.duration
          : (input.durationSec ?? 120);
      return { bytes: buf, durationSec, model: cfg.model };
    }
    // still working — keep polling
  }
}

/** Live: quick reachability check for Settings → Test connection. */
export async function testLiveConnection(cfg: EngineConfig): Promise<{ ok: boolean; detail: string }> {
  if (cfg.mode === "stub") return { ok: true, detail: "Stub mode — no engine needed." };
  try {
    const base = cfg.engineUrl.replace(/\/$/, "");
    const res = await fetch(base, { method: "GET", signal: AbortSignal.timeout(5000) });
    return {
      ok: true,
      detail: `Engine answered HTTP ${res.status} at ${base}. (Any response means the box is reachable; generation is the real test.)`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Could not reach ${cfg.engineUrl}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
