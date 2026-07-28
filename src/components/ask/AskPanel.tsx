"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AskMessageExtras, type AskMessageMeta } from "./AskMessageExtras";
import { AskPipelineProgress } from "./AskPipelineProgress";

type Thread = { id: string; title: string; flowId: string | null };
type Message = {
  id: string;
  role: string;
  content: string;
  runId: string | null;
  metaJson?: AskMessageMeta | null;
};

type AttachedFile = {
  fileId: string;
  fileName: string;
  table: unknown;
  rowCount: number;
  sheetNames: string[];
  sheet: string | null;
  range: string | null;
  piiFindings: unknown[];
  piiAcknowledged: boolean;
  disclaimer?: string;
};

export function AskPanel() {
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState<string | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [currentStepType, setCurrentStepType] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<AttachedFile | null>(null);
  const [aiOptIn, setAiOptIn] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [awaitingClarify, setAwaitingClarify] = useState(false);
  const pollSeqRef = useRef(0);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/ask/threads");
    const json = await res.json();
    if (res.ok) setThreads(json.threads ?? []);
  }, []);

  async function loadThread(id: string, opts?: { preservePoll?: boolean }) {
    if (!opts?.preservePoll) pollSeqRef.current += 1;
    const res = await fetch(`/api/ask/threads/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load chat");
      return;
    }
    setThreadId(json.id);
    setFlowId(json.flowId ?? json.flow?.id ?? null);
    setFlowName(json.flow?.name ?? null);
    setPipelineSteps(
      Array.isArray(json.pipelineSteps) ? json.pipelineSteps : [],
    );
    setMessages(json.messages ?? []);

    const msgs = (json.messages ?? []) as Message[];
    const last = msgs[msgs.length - 1];
    setAwaitingClarify(last?.metaJson?.kind === "clarify");
    const lastWithStatus = [...msgs].reverse().find((m) => m.metaJson?.status);
    setRunStatus(lastWithStatus?.metaJson?.status ?? null);
    setCurrentStepType(lastWithStatus?.metaJson?.currentStepType ?? null);
    const pendingRun = [...msgs].reverse().find((m) => {
      const status = m.metaJson?.status;
      return (
        m.runId &&
        typeof status === "string" &&
        ["QUEUED", "RUNNING"].includes(status)
      );
    });
    if (pendingRun?.runId && !opts?.preservePoll) {
      setActiveRunId(pendingRun.runId);
      void pollRun(id, pendingRun.runId);
    } else if (!pendingRun) {
      setActiveRunId(null);
    }
    const lastSteps = [...msgs].reverse().find((m) => {
      const steps = m.metaJson?.steps;
      const planSteps = m.metaJson?.plan?.steps;
      return (
        (Array.isArray(steps) && steps.length > 0) ||
        (Array.isArray(planSteps) && planSteps.length > 0)
      );
    });
    const fromMeta = lastSteps?.metaJson?.steps;
    const fromPlan = lastSteps?.metaJson?.plan?.steps;
    if (Array.isArray(fromMeta) && fromMeta.length) {
      setPipelineSteps(
        fromMeta.filter((t): t is string => typeof t === "string"),
      );
    } else if (Array.isArray(fromPlan) && fromPlan.length) {
      setPipelineSteps(
        fromPlan.filter((t): t is string => typeof t === "string"),
      );
    }
    if (lastSteps?.metaJson?.flowName) {
      setFlowName(lastSteps.metaJson.flowName);
    }
  }

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, currentStepType, runStatus]);

  async function ensureThread(): Promise<string> {
    if (threadId) return threadId;
    const res = await fetch("/api/ask/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not start chat");
    setThreadId(json.id);
    await loadThreads();
    return json.id as string;
  }

  async function pollRun(tid: string, runId: string) {
    const pollSeq = (pollSeqRef.current += 1);
    let watching = runId;
    setActiveRunId(watching);
    for (let i = 0; i < 160; i++) {
      await new Promise((r) => setTimeout(r, 900));
      if (pollSeq !== pollSeqRef.current) return;
      const res = await fetch(`/api/ask/threads/${tid}/runs/${watching}`);
      const json = await res.json();
      if (!res.ok) break;
      if (json.status) setRunStatus(json.status);
      if (json.flowName) setFlowName(json.flowName);
      if (Array.isArray(json.steps) && json.steps.length) {
        setPipelineSteps(json.steps);
      }
      if (typeof json.currentStepType === "string" || json.currentStepType === null) {
        setCurrentStepType(json.currentStepType ?? null);
      }
      // Backend auto-healed a failed run → follow the new runId quietly
      if (
        json.healed &&
        typeof json.runId === "string" &&
        json.runId &&
        json.runId !== watching
      ) {
        watching = json.runId as string;
        setActiveRunId(watching);
        setRunStatus("QUEUED");
        await loadThread(tid, { preservePoll: true });
        continue;
      }
      if (!json.pending) {
        setActiveRunId(null);
        setCurrentStepType(null);
        await loadThread(tid, { preservePoll: true });
        return;
      }
    }
    setActiveRunId(null);
    await loadThread(tid, { preservePoll: true });
  }

  async function parseUpload(form: FormData) {
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      const rows = Array.isArray(json.table?.rows) ? json.table.rows.length : 0;
      setAttached({
        fileId: json.fileId,
        fileName: json.fileName,
        table: json.table,
        rowCount: rows,
        sheetNames: Array.isArray(json.sheetNames) ? json.sheetNames : [],
        sheet: json.sheet ?? null,
        range: json.range ?? null,
        piiFindings: Array.isArray(json.piiFindings) ? json.piiFindings : [],
        piiAcknowledged: false,
        disclaimer: typeof json.disclaimer === "string" ? json.disclaimer : undefined,
      });
    } catch (e) {
      setAttached(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await parseUpload(form);
  }

  async function reparseAttached(patch: { sheet?: string | null; range?: string | null }) {
    if (!attached) return;
    const nextSheet = patch.sheet !== undefined ? patch.sheet : attached.sheet;
    const nextRange = patch.range !== undefined ? patch.range : attached.range;
    const form = new FormData();
    form.append("fileId", attached.fileId);
    if (nextSheet) form.append("sheet", nextSheet);
    if (nextRange) form.append("range", nextRange);
    await parseUpload(form);
  }

  async function sendMessage(
    text: string,
    opts?: { forceBuild?: boolean; keepAttached?: boolean },
  ) {
    const trimmed = text.trim();
    if (!trimmed || busy || uploading) return;
    if (attached?.piiFindings.length && !attached.piiAcknowledged) {
      setError("Acknowledge the personal-data warning before building the pipeline.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const tid = await ensureThread();
      setInput("");
      const payload: Record<string, unknown> = {
        message: trimmed,
        enableAi: aiOptIn,
        forceBuild: Boolean(opts?.forceBuild),
      };
      if (attached) {
        payload.fileId = attached.fileId;
        payload.fileName = attached.fileName;
        payload.excelSheet = attached.sheet;
        payload.excelRange = attached.range;
        payload.piiFindings = attached.piiFindings;
        payload.piiAcknowledged = attached.piiAcknowledged;
        const t = attached.table as {
          columns?: string[];
          rows?: unknown[];
        } | null;
        if (t?.columns?.length && Array.isArray(t.rows)) {
          payload.table = {
            columns: t.columns,
            rows: t.rows.slice(0, 40),
          };
        }
      }
      const res = await fetch(`/api/ask/threads/${tid}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");

      if (json.phase === "clarify") {
        setAwaitingClarify(true);
        setRunStatus(null);
        setCurrentStepType(null);
        await loadThread(tid);
        return;
      }

      setAwaitingClarify(false);
      if (!opts?.keepAttached) setAttached(null);
      if (json.flowId) setFlowId(json.flowId);
      if (json.flowName) setFlowName(json.flowName);
      if (Array.isArray(json.steps)) setPipelineSteps(json.steps);
      await loadThread(tid);
      if (json.runId) {
        setRunStatus("QUEUED");
        setCurrentStepType(
          Array.isArray(json.steps) && json.steps[0]
            ? String(json.steps[0])
            : null,
        );
        await pollRun(tid, json.runId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setRunStatus(null);
      setCurrentStepType(null);
      setActiveRunId(null);
    } finally {
      setBusy(false);
    }
  }

  function resetChat() {
    pollSeqRef.current += 1;
    setThreadId(null);
    setMessages([]);
    setFlowId(null);
    setFlowName(null);
    setPipelineSteps([]);
    setRunStatus(null);
    setCurrentStepType(null);
    setActiveRunId(null);
    setAttached(null);
    setAwaitingClarify(false);
    void ensureThread();
  }

  const liveRunning =
    Boolean(activeRunId) &&
    Boolean(runStatus) &&
    ["QUEUED", "RUNNING"].includes(runStatus!);

  return (
    <div className="ask-shell grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-none">
      <aside className="panel ask-sidebar flex max-h-40 min-h-0 flex-col p-3 lg:max-h-none">
        <button
          type="button"
          className="btn btn-sm btn-primary w-full shrink-0"
          onClick={resetChat}
        >
          New chat
        </button>
        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`ask-thread-btn w-full truncate rounded-lg px-2 py-1.5 text-left ${
                  t.id === threadId ? "ask-thread-btn--active" : ""
                }`}
                onClick={() => void loadThread(t.id)}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="panel ask-main flex min-h-0 flex-col gap-3 p-4">
        <div
          ref={scrollerRef}
          className="ask-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
        >
          {!messages.length ? (
            <div className="ask-empty space-y-2 text-sm">
              <p className="ask-empty__title">Start with a file + a goal</p>
              <p className="text-muted">
                Attach CSV/Excel, tell us what you want to learn, and we’ll scan
                the data, ask a few sharp questions, then build and run the
                pipeline.
              </p>
            </div>
          ) : null}
          {messages.map((m) => {
            const isLiveMsg =
              liveRunning && activeRunId && m.runId === activeRunId;
            return (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ask-bubble ask-bubble--user"
                    : m.metaJson?.kind === "clarify"
                      ? "ask-bubble ask-bubble--clarify"
                      : m.metaJson?.kind === "run_progress"
                        ? "ask-bubble ask-bubble--assistant ask-bubble--pipe"
                        : "ask-bubble ask-bubble--assistant"
                }
              >
                <AskMessageExtras
                  role={m.role}
                  content={m.content}
                  runId={m.runId}
                  meta={m.metaJson}
                  onGoAhead={(text, opts) => void sendMessage(text, opts)}
                  liveStatus={isLiveMsg ? runStatus : null}
                  liveStepType={isLiveMsg ? currentStepType : null}
                />
              </div>
            );
          })}

          {liveRunning &&
          !messages.some((m) => m.runId === activeRunId) &&
          pipelineSteps.length ? (
            <div className="ask-bubble ask-bubble--assistant ask-bubble--pipe">
              <AskPipelineProgress
                flowId={flowId}
                flowName={flowName}
                steps={pipelineSteps}
                runStatus={runStatus}
                currentStepType={currentStepType}
              />
            </div>
          ) : null}

          {awaitingClarify && !busy ? (
            <p className="ask-status-line">
              Fill each answer box above, then click Go ahead — the pipeline
              won’t start until then.
            </p>
          ) : null}
        </div>

        {error ? <p className="shrink-0 text-sm text-danger">{error}</p> : null}

        <div
          className={`ask-dropzone shrink-0 space-y-2 ${dragActive ? "ask-dropzone--active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy && !uploading) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (busy || uploading) return;
            void onPickFile(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            id={fileInputId}
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            disabled={busy || uploading}
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          {attached ? (
            <div className="space-y-2">
              <div className="ask-attach-ready">
                <span className="min-w-0 flex-1 truncate">
                  Ready: <span className="font-medium">{attached.fileName}</span>
                  {attached.rowCount ? (
                    <span className="text-muted"> · {attached.rowCount} rows</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy || uploading}
                  onClick={() => setAttached(null)}
                >
                  Remove
                </button>
              </div>

              {attached.sheetNames.length ? (
                <div className="ask-upload-options">
                  <label className="text-xs font-medium text-muted">
                    Excel sheet
                    <select
                      className="input mt-1 text-sm"
                      value={attached.sheet ?? ""}
                      disabled={busy || uploading}
                      onChange={(e) =>
                        void reparseAttached({ sheet: e.target.value || null })
                      }
                    >
                      {attached.sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Optional range
                    <input
                      className="input mt-1 text-sm"
                      placeholder="A1:F200"
                      defaultValue={attached.range ?? ""}
                      disabled={busy || uploading}
                      onBlur={(e) =>
                        void reparseAttached({
                          range: e.target.value.trim() || null,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

              {attached.piiFindings.length ? (
                <label className="ask-pii">
                  <input
                    type="checkbox"
                    checked={attached.piiAcknowledged}
                    disabled={busy || uploading}
                    onChange={(e) =>
                      setAttached((prev) =>
                        prev
                          ? { ...prev, piiAcknowledged: e.target.checked }
                          : prev,
                      )
                    }
                  />
                  <span>
                    This file appears to contain personal data. I confirm I’m allowed
                    to analyse it and understand AI will only be used if I opt in.
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
          {!attached ? (
            <p className="ask-dropzone__hint">
              Drag a CSV or Excel file here, or attach one below. We’ll profile it
              first and ask only the questions needed to build a useful pipeline.
            </p>
          ) : null}
          <label className="ask-ai-optin">
            <input
              type="checkbox"
              checked={aiOptIn}
              disabled={busy || uploading}
              onChange={(e) => setAiOptIn(e.target.checked)}
            />
            <span>Use my saved AI key to explain results after deterministic checks.</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              disabled={busy || uploading}
              onClick={() => fileRef.current?.click()}
              title="Attach CSV or Excel"
            >
              {uploading ? "Uploading…" : attached ? "Change file" : "Attach file"}
            </button>
            <input
              className="input flex-1"
              value={input}
              placeholder={
                awaitingClarify
                  ? "Use the answer boxes above, then Go ahead"
                  : attached
                    ? "What should we analyse in this file?"
                    : "Ask about your data… or attach a file first"
              }
              disabled={busy || uploading || awaitingClarify}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !awaitingClarify) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                busy ||
                uploading ||
                awaitingClarify ||
                !input.trim() ||
                Boolean(attached?.piiFindings.length && !attached.piiAcknowledged)
              }
              onClick={() => void sendMessage(input)}
              title={
                awaitingClarify
                  ? "Use Go ahead on the questions above"
                  : undefined
              }
            >
              {busy ? "Working…" : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
