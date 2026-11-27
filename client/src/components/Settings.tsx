import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Props {
  onModeChange: (mode: "stub" | "live") => void;
}

export default function Settings({ onModeChange }: Props) {
  const [mode, setMode] = useState<"stub" | "live">("stub");
  const [engineUrl, setEngineUrl] = useState("http://localhost:8001");
  const [model, setModel] = useState("acestep-v15-turbo");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setMode(s.mode);
        setEngineUrl(s.engineUrl);
        setModel(s.model);
        setHasApiKey(s.hasApiKey);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      await api.saveSettings({
        mode,
        engineUrl: engineUrl.trim(),
        model: model.trim(),
        apiKey: apiKey || undefined,
      });
      onModeChange(mode);
      setHasApiKey(hasApiKey || apiKey.length > 0);
      setApiKey("");
      setMsg("Settings saved. Switching modes needs no rebuild — the next generation uses the new mode.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.testConnection();
      if (res.ok) setMsg(res.detail);
      else setError(res.detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Engine settings</h2>
      <p className="sub">
        Stub mode renders seeded tone-sketches so every screen works with no engine at all.
        Live mode sends songs to your ACE-Step engine and waits for real vocals. Flipping
        between them is a setting, not a rebuild.
      </p>
      <div className="card">
        <label>Engine mode</label>
        <div className="tabs">
          <button type="button" className={mode === "stub" ? "active" : ""} onClick={() => setMode("stub")}>
            Stub — tone-sketches
          </button>
          <button type="button" className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>
            Live — ACE-Step
          </button>
        </div>
        <label>Engine address</label>
        <input
          value={engineUrl}
          onChange={(e) => setEngineUrl(e.target.value)}
          placeholder="http://localhost:8001"
          inputMode="url"
        />
        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="acestep-v15-turbo" />
        <label>API key {hasApiKey ? "(one is already saved)" : "(optional)"}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Leave blank to keep the saved key"
          autoComplete="off"
        />
        <p className="sub">
          The key is stored on the server only, and never sent back to the browser. Never paste
          it into a group chat.
        </p>
        {msg && <div className="ok">{msg}</div>}
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button type="button" className="primary" onClick={save} disabled={busy}>
            Save settings
          </button>
          <button type="button" onClick={test} disabled={busy}>
            Test connection
          </button>
        </div>
      </div>
      <div className="card">
        <h3>How to go live</h3>
        <p>
          Run ACE-Step 1.5 on a GPU box (see HOSTING.md), point the engine address at it,
          flip to Live, and generate one song. Your ear decides — if the 2B vocals are good
          enough, stay on that box.
        </p>
      </div>
    </div>
  );
}
