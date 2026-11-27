// Engine adapter — stub and live (ACE-Step 1.5 async REST API).
//
// Stub mode renders a seeded tone-sketch with the shared synth. It is labelled
// a sketch everywhere in the app and is never presented as a vocal render.
//
// Live mode talks to ACE-Step's async API, as documented in the engine repo
// (https://github.com/ace-step/ACE-Step-1.5, docs/en/API.md):
//   POST {baseUrl}/release_task   -> { data: { task_id, status, queue_position }, code: 200 }
//   POST {baseUrl}/query_result   -> { data: [{ task_id, status, result }] }  (poll until status 1)
//   GET  {baseUrl}<file from result> -> the finished audio bytes
// Status is an integer: 0 queued/running, 1 succeeded, 2 failed.
// Field names verified 2026-11-26 against docs/en/API.md (Gemini's five catches,
// all confirmed against the live doc). The first live run against a real engine
// is still the proof. Retries are built into polling so a flaky GPU box does
// not lose a song.

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
    audio_format: "mp3",
  };
  if (input.taskType && input.taskType !== "generate") {
    payload.task_type = input.taskType;
  }

  const released = await fetchJson(
    `${base}/release_task`,
    { method: "POST", headers, body: JSON.stringify(payload) },
    "release_task",
  );
  const releasedData = (released.data ?? released) as Record<string, unknown>;
  const taskId = String(releasedData.task_id ?? releasedData.taskId ?? "");
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
        { method: "POST", headers, body: JSON.stringify({ task_id_list: [taskId] }) },
        "query_result",
      );
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) throw err;
      continue;
    }
    // Response is { data: [{ task_id, status, result }] }; status is an integer
    // (0 queued/running, 1 succeeded, 2 failed). result is a JSON-encoded string.
    const data = result.data as unknown;
    const entry = Array.isArray(data)
      ? (data.find((i) => String((i as Record<string, unknown>).task_id) === taskId) ??
        data[0]) as Record<string, unknown> | undefined
      : (data as Record<string, unknown> | undefined);
    if (!entry) continue; // no entry for us yet — keep polling
    const statusNum = Number(entry.status);
    if (statusNum === 2) {
      throw new Error(`engine task failed: ${JSON.stringify(entry).slice(0, 300)}`);
    }
    if (statusNum === 1) {
      let parsed: Array<Record<string, unknown>> = [];
      try {
        parsed = JSON.parse(String(entry.result ?? "[]")) as Array<Record<string, unknown>>;
      } catch {
        parsed = [];
      }
      const first = parsed[0] ?? {};
      const file = String(first.file ?? "");
      if (!file) throw new Error("engine succeeded but returned no audio file");
      const audioRes = await fetch(`${base}${file}`, { headers });
      if (!audioRes.ok) {
        throw new Error(`fetching audio failed (${audioRes.status})`);
      }
      const buf = new Uint8Array(await audioRes.arrayBuffer());
      const metas = (first.metas ?? {}) as Record<string, unknown>;
      const durationSec =
        typeof metas.duration === "number" ? metas.duration : (input.durationSec ?? 120);
      return { bytes: buf, durationSec, model: cfg.model };
    }
    // status 0 — still working, keep polling
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
