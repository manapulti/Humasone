// Verification for the music app — API checks + a real headless-browser run.
// Usage: bun scripts/verify.ts
// Exits non-zero if any check fails. Prints PASS/FAIL per check.
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "music-app-verify-"));

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function findHeadlessShell(): string | null {
  const base = join(process.env.HOME ?? "~", ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith("chromium_headless_shell")) {
      const p = join(base, d, "chrome-linux", "headless_shell");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function waitForServer(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/settings`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  // Start the production server (built client + API) on a scratch data dir.
  const server = Bun.spawn(["bun", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    check("server starts", await waitForServer(), `port ${PORT}`);

    // ---- API checks ----
    const settings = await (await fetch(`${BASE}/api/settings`)).json();
    check("settings default to stub", settings.mode === "stub", JSON.stringify(settings));

    const created = await (
      await fetch(`${BASE}/api/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "lyrics",
          prompt: "A hopeful song about coming home",
          lyrics: "[Verse]\nWe walked the long road home\n\n[Chorus]\nAnd the hum was waiting",
          styleText: "warm, 96 BPM, key of C",
          humWords: ["humhome", "humasone"],
          bpm: 96,
          key: "C",
        }),
      })
    ).json();
    const songs = created.songs as { id: string; audioPath: string; status: string; engine: string }[];
    check("stub generation returns 2 variations", Array.isArray(songs) && songs.length === 2);
    const songA = songs?.[0];
    check(
      "variation A is a ready tone-sketch with audio",
      !!songA && songA.status === "ready" && songA.engine === "stub" && !!songA.audioPath,
      songA ? `${songA.status} / ${songA.audioPath}` : "no songs",
    );

    if (songA) {
      const audio = await fetch(`${BASE}/audio/${songA.audioPath}`);
      const audioBytes = new Uint8Array(await audio.arrayBuffer());
      check(
        "sketch audio serves as WAV",
        audio.ok && audio.headers.get("content-type")?.includes("wav") && audioBytes.length > 1000,
        `${audioBytes.length} bytes`,
      );
      // WAV header sanity: RIFF....WAVE
      const riff = String.fromCharCode(...audioBytes.slice(0, 4));
      const wave = String.fromCharCode(...audioBytes.slice(8, 12));
      check("WAV header is RIFF/WAVE", riff === "RIFF" && wave === "WAVE");

      const detail = await (await fetch(`${BASE}/api/songs/${songA.id}`)).json();
      check(
        "ledger keeps prompt, lyrics, hum-words, model, seed",
        detail.prompt?.includes("coming home") &&
          detail.lyrics?.includes("[Verse]") &&
          Array.isArray(detail.humWords) &&
          detail.humWords.includes("humhome") &&
          typeof detail.seed === "number" &&
          detail.model === "stub-sketch",
      );

      const fav = await (
        await fetch(`${BASE}/api/songs/${songA.id}/favorite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorite: true }),
        })
      ).json();
      check("favorite toggle works", fav.favorite === true);

      const search = await (await fetch(`${BASE}/api/songs?q=coming%20home`)).json();
      check("search finds the song", Array.isArray(search) && search.length >= 1);

      const stems = await (
        await fetch(`${BASE}/api/songs/${songA.id}/stems`, { method: "POST" })
      ).json();
      check(
        "stub stem split makes 4 stems",
        Array.isArray(stems.stems) && stems.stems.length === 4,
        JSON.stringify(stems).slice(0, 120),
      );
      if (Array.isArray(stems.stems) && stems.stems[0]) {
        const stemAudio = await fetch(`${BASE}/audio/${stems.stems[0].audioPath}`);
        check("stem audio serves", stemAudio.ok && stemAudio.headers.get("content-type")?.includes("wav"));
      }

      const extended = await (
        await fetch(`${BASE}/api/songs/${songA.id}/extend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraLyrics: "[Verse]\nOne more road to go" }),
        })
      ).json();
      check(
        "extend creates a longer child song",
        Array.isArray(extended.songs) &&
          extended.songs.length === 2 &&
          extended.songs[0].parentId === songA.id &&
          extended.songs[0].durationSec > songA.durationSec,
      );

      const covered = await (
        await fetch(`${BASE}/api/songs/${songA.id}/cover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ styleText: "dark, driving, 120 BPM" }),
        })
      ).json();
      check("cover creates a child song", Array.isArray(covered.songs) && covered.songs.length === 2);

      const edited = await (
        await fetch(`${BASE}/api/songs/${songA.id}/section-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "Chorus", instruction: "make it bigger" }),
        })
      ).json();
      check(
        "section edit creates a child song",
        Array.isArray(edited.songs) && edited.songs.length === 2,
      );
    }

    const voice = await (
      await fetch(`${BASE}/api/voices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Anthony", note: "warm, low", color: "#5eeaff" }),
      })
    ).json();
    check("voice seat can be saved", !!voice.id && voice.name === "Anthony");
    const voices = await (await fetch(`${BASE}/api/voices`)).json();
    check("voice seats list", Array.isArray(voices) && voices.length === 1);

    const arc = await (
      await fetch(`${BASE}/api/arcs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rise", bpm: 100, key: "G", glyphs: ["▲", "◆", "~"] }),
      })
    ).json();
    check("glyph arc can be saved", !!arc.id && arc.glyphs.length === 3);
    const arcs = await (await fetch(`${BASE}/api/arcs`)).json();
    check("glyph arcs list", Array.isArray(arcs) && arcs.length === 1);

    // ---- Browser checks (headless Chromium, 390px mobile width) ----
    const shell = findHeadlessShell();
    if (!shell) {
      console.log("SKIP  browser checks — no headless Chromium found in ~/.cache/ms-playwright");
    } else {
      const browser = await chromium.launch({ executablePath: shell });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Create a song", { timeout: 10000 });

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      check(
        "no horizontal overflow at 390px",
        overflow.scrollWidth <= overflow.innerWidth,
        `scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth}`,
      );

      // Drive the create flow end to end.
      await page.fill('[data-testid="prompt-input"]', "A hopeful song about coming home");
      await page.click('[data-testid="generate-button"]');
      await page.waitForSelector('[data-testid="variation-card"]', { timeout: 20000 });
      const cards = await page.locator('[data-testid="variation-card"]').count();
      check("browser: stub generation shows 2 variation cards", cards === 2, `${cards} cards`);

      // Play the first variation and confirm the audio element actually plays.
      await page.locator('[data-testid="variation-card"] >> text=▶ Play').first().click();
      await page.waitForSelector('[data-testid="player-bar"]', { timeout: 5000 });
      await page.waitForTimeout(2500);
      const audioState = await page.evaluate(() => {
        const el = document.querySelector<HTMLAudioElement>('[data-testid="player-audio"]');
        if (!el) return null;
        return {
          src: !!el.currentSrc,
          readyState: el.readyState,
          duration: el.duration,
          currentTime: el.currentTime,
          paused: el.paused,
        };
      });
      check(
        "browser: player plays the sketch",
        !!audioState && audioState.src && audioState.readyState >= 2 && audioState.duration > 0,
        JSON.stringify(audioState),
      );
      if (audioState) {
        check(
          "browser: playback advances (currentTime > 0)",
          audioState.currentTime > 0,
          `currentTime=${audioState.currentTime}`,
        );
      }

      // Library saves it: switch tabs and look for the song.
      await page.click("text=Library");
      await page.waitForSelector("text=coming home", { timeout: 10000 }).catch(() => {});
      const libText = await page.locator("body").innerText();
      check("browser: library shows the created song", libText.includes("coming home"));
      check("browser: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

      await browser.close();
    }
  } finally {
    server.kill();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("VERIFY CRASHED:", err);
  process.exit(2);
});
