"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  endOfMonth,
  occurrencesInRange,
  startOfMonth,
} from "@/modules/jobs/domain/scheduleTiming";
import {
  formatMonthYear,
  formatTime,
  formatWeekdayDate,
} from "@/shared/lib/formatUi";
import type { ScheduleRecord } from "./scheduleTypes";

type CalEvent = {
  at: Date;
  scheduleId: string;
  flowId: string;
  flowName: string;
  label: string;
};

type Props = {
  schedules: ScheduleRecord[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function buildMonthCells(month: Date): Date[] {
  const start = startOfMonth(month);
  // Monday-first grid
  const weekday = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - weekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function ScheduleCalendar({ schedules }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Avoid SSR/client “today” mismatch across timezones
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    setTodayKey(dayKey(new Date()));
  }, []);

  const enabled = useMemo(
    () => schedules.filter((s) => s.enabled),
    [schedules],
  );

  const eventsByDay = useMemo(() => {
    const rangeStart = startOfMonth(cursor);
    const rangeEnd = endOfMonth(cursor);
    const map = new Map<string, CalEvent[]>();

    for (const s of enabled) {
      const times = occurrencesInRange(
        s.cronKind,
        s.nextRunAt,
        rangeStart,
        rangeEnd,
      );
      for (const at of times) {
        const key = dayKey(at);
        const list = map.get(key) ?? [];
        list.push({
          at,
          scheduleId: s.id,
          flowId: s.flowId,
          flowName: s.flow?.name ?? "Flow",
          label: s.label,
        });
        map.set(key, list);
      }
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.at.getTime() - b.at.getTime());
    }
    return map;
  }, [enabled, cursor]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const monthLabel = formatMonthYear(cursor);
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="schedule-cal">
      <div className="schedule-cal__toolbar">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() =>
            setCursor(
              new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
            )
          }
          aria-label="Previous month"
        >
          ←
        </button>
        <h2 className="schedule-cal__title">{monthLabel}</h2>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() =>
            setCursor(
              new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
            )
          }
          aria-label="Next month"
        >
          →
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            const now = startOfMonth(new Date());
            setCursor(now);
            setSelectedDay(dayKey(new Date()));
          }}
        >
          Today
        </button>
      </div>

      <div className="schedule-cal__weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="schedule-cal__grid">
        {cells.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const events = eventsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={key}
              type="button"
              className={[
                "schedule-cal__cell",
                inMonth ? "" : "is-outside",
                isToday ? "is-today" : "",
                isSelected ? "is-selected" : "",
                events.length ? "has-events" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedDay(key)}
            >
              <span className="schedule-cal__date">{day.getDate()}</span>
              <div className="schedule-cal__dots">
                {events.slice(0, 3).map((ev) => (
                  <span
                    key={`${ev.scheduleId}-${ev.at.toISOString()}`}
                    className="schedule-cal__dot"
                    title={`${ev.flowName} · ${ev.label}`}
                  />
                ))}
                {events.length > 3 ? (
                  <span className="schedule-cal__more">+{events.length - 3}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="schedule-cal__detail">
        <h3 className="text-sm font-semibold">
          {selectedDay
            ? (() => {
                const [y, m, d] = selectedDay.split("-").map(Number);
                return formatWeekdayDate(new Date(y!, m!, d!));
              })()
            : "Select a day"}
        </h3>
        {!selectedDay ? (
          <p className="mt-1 text-xs text-muted">
            Click a day to see which pipelines are scheduled. Use Schedule a pipeline
            above to add Daily, Weekly, or Custom runs.
          </p>
        ) : selectedEvents.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            No pipelines scheduled this day. Add one with Schedule a pipeline above —
            it will appear on matching days once enabled.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {selectedEvents.map((ev) => (
              <li key={`${ev.scheduleId}-${ev.at.toISOString()}`}>
                <Link href={`/flows/${ev.flowId}`} className="schedule-cal__event">
                  <span className="tabular-nums text-[11px] font-semibold text-accent-deep">
                    {formatTime(ev.at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {ev.flowName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{ev.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
