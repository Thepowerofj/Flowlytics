"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function SettingsPanel() {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/llm-key");
    const json = await res.json();
    if (res.ok) {
      setHasKey(Boolean(json.hasKey));
      setMasked(json.masked ?? null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/settings/llm-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Could not save key");
      return;
    }
    setApiKey("");
    setHasKey(true);
    setMasked(json.masked ?? null);
    setMessage("API key saved (encrypted). AI blocks will use this key when you Run.");
  }

  async function clear() {
    setBusy(true);
    const res = await fetch("/api/settings/llm-key", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      setMessage(json.error ?? "Could not clear key");
      return;
    }
    setHasKey(false);
    setMasked(null);
    setMessage("API key removed.");
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="font-semibold">LLM API key (bring your own)</h2>
        <p className="mt-1 text-sm text-muted">
          AI structure, explain, analyse, and chart-suggest call an OpenAI-compatible API using
          your key. We store it encrypted; it is never shown in full again.
          Set <code className="text-xs">LLM_BASE_URL</code> / model on the server if you use a
          non-OpenAI endpoint.
        </p>
        {hasKey ? (
          <p className="mt-3 text-sm">
            Current key: <span className="font-mono">{masked}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">No key saved yet — AI steps will fail until you add one.</p>
        )}
        <label className="mt-4 block text-sm">
          {hasKey ? "Replace API key" : "API key"}
          <input
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || apiKey.trim().length < 8}
            onClick={() => void save()}
          >
            Save key
          </button>
          {hasKey ? (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => void clear()}
            >
              Remove key
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </section>

      <p className="text-sm text-muted">
        Need access first? Complete EFT on{" "}
        <Link className="underline" href="/billing">
          Billing
        </Link>
        .
      </p>
    </div>
  );
}
