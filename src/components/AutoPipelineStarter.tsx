"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type PendingUpload = {
  fileId: string;
  fileName: string;
  table: unknown;
  sheetNames?: string[];
  sheet?: string | null;
  range?: string;
  piiFindings?: unknown[];
  disclaimer?: string;
};

/**
 * Compact home CTA: opens a modal so users can set a goal before building.
 * Existing saved pipelines stay the primary home focus.
 */
export function AutoPipelineStarter() {
  const router = useRouter();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [enableAi, setEnableAi] = useState(true);
  const [goal, setGoal] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<PendingUpload | null>(null);

  const resetModal = useCallback(() => {
    setError(null);
    setNotes("");
    setGoal("");
    setEnableAi(true);
    setPendingFile(null);
    setUploaded(null);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    resetModal();
  }, [busy, resetModal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, close]);

  const stageFile = useCallback((file: File) => {
    setPendingFile(file);
    setUploaded(null);
    setError(null);
    setOpen(true);
  }, []);

  const build = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let payload: Record<string, unknown> = {
        enableAi,
        goal: goal.trim() || undefined,
      };

      if (notes.trim() && !pendingFile && !uploaded) {
        payload = {
          ...payload,
          enableAi: true,
          rawText: notes.trim(),
          name: "Notes · auto analysis",
        };
      } else {
        let up = uploaded;
        if (!up) {
          if (!pendingFile) {
            throw new Error("Choose a CSV/Excel file or paste notes first.");
          }
          const form = new FormData();
          form.append("file", pendingFile);
          const upRes = await fetch("/api/upload", {
            method: "POST",
            body: form,
          });
          const upData = await upRes.json().catch(() => ({}));
          if (!upRes.ok) {
            throw new Error(
              (upData.error as string) || "Could not read that file.",
            );
          }
          up = {
            fileId: upData.fileId,
            fileName: upData.fileName,
            table: upData.table,
            sheetNames: upData.sheetNames,
            sheet: upData.sheet,
            range: upData.range ?? "",
            piiFindings: upData.piiFindings ?? [],
            disclaimer: upData.disclaimer,
          };
          setUploaded(up);
        }

        payload = {
          ...payload,
          fileId: up.fileId,
          fileName: up.fileName,
          table: up.table,
          sheetNames: up.sheetNames,
          excelSheet: up.sheet,
          excelRange: up.range ?? "",
          piiFindings: up.piiFindings ?? [],
          ...(notes.trim() ? { rawText: notes.trim() } : {}),
        };
      }

      const res = await fetch("/api/flows/auto-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data.error as string) || "Could not build pipeline.");
      }
      try {
        sessionStorage.setItem(
          "flowlytics.autoPipeline",
          JSON.stringify({
            rationale: data.plan?.rationale,
            title: data.plan?.title,
            archetype: data.plan?.archetype,
            steps: data.plan?.steps,
            goal: goal.trim() || undefined,
          }),
        );
      } catch {
        /* ignore */
      }
      const q = new URLSearchParams({
        built: "1",
        archetype: String(data.plan?.archetype ?? ""),
      });
      router.push(`/flows/${data.id}?${q.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }, [enableAi, goal, notes, pendingFile, router, uploaded]);

  const canBuild = Boolean(pendingFile || uploaded || notes.trim());

  return (
    <>
      <div className="auto-pipeline-strip">
        <div className="auto-pipeline-strip__copy">
          <span className="auto-pipeline-strip__label">Auto analysis</span>
          <span className="auto-pipeline-strip__hint">
            Drop a file or describe a goal — we wire the pipeline for you.
          </span>
        </div>
        <div className="auto-pipeline-strip__actions">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) stageFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              setOpen(true);
              setError(null);
            }}
          >
            Build pipeline…
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="auto-pipeline-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="auto-pipeline-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="auto-pipeline-modal__head">
              <h2 id={titleId} className="auto-pipeline-modal__title">
                Build analysis pipeline
              </h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <p className="auto-pipeline-modal__lead">
              Tell us what you want to learn, then confirm the file or notes.
              Nothing is built until you click Build.
            </p>

            <label className="auto-pipeline-modal__field">
              Analysis goal
              <textarea
                className="input mt-1 min-h-[72px] resize-y text-sm"
                placeholder="e.g. forecast next 3 months of sales, break down revenue by region…"
                value={goal}
                disabled={busy}
                autoFocus
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>

            <div className="auto-pipeline-modal__file">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted">Data source</p>
                <p className="mt-0.5 truncate text-sm text-ink">
                  {pendingFile?.name ||
                    uploaded?.fileName ||
                    (notes.trim()
                      ? "Using pasted notes"
                      : "No file selected yet")}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {pendingFile || uploaded ? "Change file" : "Choose file"}
              </button>
            </div>

            <label className="auto-pipeline-modal__field">
              Or paste unstructured notes
              <textarea
                className="input mt-1 min-h-[64px] resize-y text-sm"
                placeholder="Receipts, meeting notes, messy lists…"
                value={notes}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <label className="auto-pipeline-modal__check">
              <input
                type="checkbox"
                checked={enableAi}
                disabled={busy}
                onChange={(e) => setEnableAi(e.target.checked)}
              />
              Include AI Analyse (uses your API key when you Run)
            </label>

            {error ? (
              <p className="auto-pipeline-modal__error" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="auto-pipeline-modal__foot">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || !canBuild}
                onClick={() => void build()}
              >
                {busy ? "Building…" : "Build pipeline"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
