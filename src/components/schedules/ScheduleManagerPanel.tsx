"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScheduleEarlyAccessNotice } from "./ScheduleEarlyAccessNotice";
import { ScheduleList } from "./ScheduleList";
import type { ScheduleRecord } from "./scheduleTypes";

type Props = {
  flowId: string;
  open: boolean;
  onClose: () => void;
  refreshToken?: number;
};

export function ScheduleManagerPanel({
  flowId,
  open,
  onClose,
  refreshToken = 0,
}: Props) {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/schedules?flowId=${encodeURIComponent(flowId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load schedules");
        return;
      }
      setSchedules(data.schedules ?? []);
    } catch {
      setError("Could not load schedules");
    }
  }, [flowId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshToken]);

  async function onToggle(id: string, enabled: boolean) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Remove failed");
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="schedule-manager settle" role="dialog" aria-label="Manage schedules">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            This pipeline
          </p>
          <h3 className="text-sm font-semibold">Manage schedules</h3>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mb-2">
        <ScheduleEarlyAccessNotice compact />
      </div>
      <p className="mb-3 text-xs text-muted">
        Pause or remove repeating runs. See all pipelines on the{" "}
        <Link href="/schedules" className="font-medium text-accent-deep underline">
          schedule calendar
        </Link>
        .
      </p>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <ScheduleList
        schedules={schedules}
        onToggle={onToggle}
        onDelete={onDelete}
        busyId={busyId}
      />
    </div>
  );
}
