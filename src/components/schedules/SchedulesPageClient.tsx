"use client";

import { useCallback, useEffect, useState } from "react";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { ScheduleCreateForm } from "./ScheduleCreateForm";
import { ScheduleList } from "./ScheduleList";
import type { ScheduleRecord } from "./scheduleTypes";

export function SchedulesPageClient() {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load schedules");
        return;
      }
      setSchedules(data.schedules ?? []);
    } catch {
      setError("Could not load schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onCreated(schedule: ScheduleRecord) {
    setSchedules((prev) => [schedule, ...prev.filter((s) => s.id !== schedule.id)]);
    setError(null);
  }

  async function onToggle(id: string, enabled: boolean) {
    setBusyId(id);
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
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Remove failed");
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-white p-4 shadow-soft sm:p-5">
          <ScheduleCreateForm onCreated={onCreated} />
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Calendar</h2>
              <p className="mt-0.5 text-xs text-muted">
                Enabled schedules shown by day and time
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <ScheduleCalendar schedules={schedules} />
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-white p-4 shadow-soft sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">All schedules</h2>
        <p className="mt-0.5 mb-3 text-xs text-muted">
          Pause or remove any pipeline schedule
        </p>
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        <ScheduleList
          schedules={schedules}
          showFlowName
          onToggle={onToggle}
          onDelete={onDelete}
          busyId={busyId}
        />
      </section>
    </div>
  );
}
