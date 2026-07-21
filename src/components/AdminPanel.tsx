"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/shared/lib/formatUi";

type UserRow = {
  id: string;
  email: string;
  role: string;
  isPaid: boolean;
  eftReference: string | null;
  eftDeclaredAt: string | null;
  eftNote: string | null;
  accessExpiresAt: string | null;
  disabled: boolean;
  walletBalance: number;
  hasLlmKey: boolean;
  status: "active" | "pending_payment" | "expired" | "disabled";
};

type Ops = {
  queueDepth: number;
  activeRuns: number;
  totalSucceeded: number;
  totalFailed: number;
  totalUsers: number;
  worker: { busy: boolean; online: boolean; lastSeen: string | null };
  perUser: {
    email: string;
    isPaid: boolean;
    runCount: number;
    storageBytes: number;
    aiCallCount: number;
  }[];
};

function statusLabel(s: UserRow["status"]) {
  if (s === "active") return "Active";
  if (s === "pending_payment") return "Awaiting EFT";
  if (s === "expired") return "Expired";
  return "Disabled";
}

function statusRank(s: UserRow["status"]): number {
  if (s === "pending_payment") return 0;
  if (s === "expired") return 1;
  if (s === "active") return 2;
  return 3;
}

export function AdminPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [gateway, setGateway] = useState("");
  const [accessDays, setAccessDays] = useState(30);
  const [ops, setOps] = useState<Ops | null>(null);
  const [message, setMessage] = useState("");
  const [refQuery, setRefQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  async function load(q?: string) {
    const query = (q ?? "").trim();
    const url = query
      ? `/api/admin/users?q=${encodeURIComponent(query)}`
      : "/api/admin/users";
    const [u, o] = await Promise.all([
      fetch(url).then((r) => r.json()),
      fetch("/api/admin/ops").then((r) => r.json()),
    ]);
    setUsers(u.users ?? []);
    setGateway(u.gateway ?? "");
    if (u.accessPeriodDays) setAccessDays(Number(u.accessPeriodDays));
    setOps(o);
    setSearchActive(Boolean(query));
    if (query && u.query) {
      setMessage(
        (u.users?.length ?? 0)
          ? `Matched ${u.users.length} for ${u.query}`
          : `No users for reference ${u.query}`,
      );
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!searchActive) void load();
    }, 5000);
    return () => clearInterval(t);
  }, [searchActive]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMessage(res.ok ? "Updated" : data.error ?? "Failed");
    await load(searchActive ? refQuery : undefined);
  }

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const sr = statusRank(a.status) - statusRank(b.status);
      if (sr !== 0) return sr;
      const ad = a.eftDeclaredAt ? new Date(a.eftDeclaredAt).getTime() : 0;
      const bd = b.eftDeclaredAt ? new Date(b.eftDeclaredAt).getTime() : 0;
      return bd - ad;
    });
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Queue depth" value={ops?.queueDepth} />
        <Metric label="Active runs" value={ops?.activeRuns} />
        <Metric
          label="Worker"
          value={ops?.worker.online ? (ops.worker.busy ? "busy" : "idle") : "offline"}
        />
        <Metric label="Users" value={ops?.totalUsers} />
        <Metric label="Succeeded runs" value={ops?.totalSucceeded} />
        <Metric label="Failed runs" value={ops?.totalFailed} />
        <Metric label="Gateway stub" value={gateway || "—"} />
        <Metric label="Access window" value={`${accessDays} days`} />
      </div>

      <section className="panel p-4">
        <h2 className="font-semibold">User management</h2>
        <p className="mt-1 text-sm text-muted">
          Look up the short payment reference from the bank statement (e.g.{" "}
          <code className="text-ink">FL-K7M3PQ</code>), then activate for {accessDays} days.
        </p>

        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(refQuery);
          }}
        >
          <label className="min-w-[200px] flex-1 text-sm">
            Find by payment reference
            <input
              className="input mt-1 font-mono uppercase tracking-wide"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value.toUpperCase())}
              placeholder="FL-K7M3PQ"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="btn btn-sm btn-primary" type="submit">
            Look up
          </button>
          {searchActive ? (
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => {
                setRefQuery("");
                setSearchActive(false);
                setMessage("");
                void load();
              }}
            >
              Clear
            </button>
          ) : null}
        </form>

        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2">Email</th>
                <th>Status</th>
                <th>Payment ref</th>
                <th>EFT</th>
                <th>Expires</th>
                <th>AI key</th>
                <th>Wallet</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => (
                <tr key={u.id} className="border-t border-border align-top">
                  <td className="py-2">
                    <div className="font-medium">{u.email}</div>
                    {u.role === "ADMIN" ? (
                      <div className="text-[11px] text-muted">Admin</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`flow-run-chip flow-run-chip--${u.status}`}>
                      {statusLabel(u.status)}
                    </span>
                  </td>
                  <td className="py-2">
                    {u.eftReference ? (
                      <code className="payment-ref__admin">{u.eftReference}</code>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="max-w-[140px]">
                    <div className="truncate text-xs">
                      {u.eftDeclaredAt ? "Declared" : "—"}
                    </div>
                    <div className="truncate text-[11px] text-muted">{u.eftNote ?? ""}</div>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {u.accessExpiresAt ? formatDate(u.accessExpiresAt) : "—"}
                  </td>
                  <td>{u.hasLlmKey ? "yes" : "—"}</td>
                  <td>{u.walletBalance}</td>
                  <td className="space-x-1 space-y-1 py-2">
                    {u.role !== "ADMIN" ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          type="button"
                          onClick={() =>
                            patch({
                              userId: u.id,
                              activateDays: accessDays,
                              ...(u.eftReference
                                ? { eftReference: u.eftReference }
                                : {}),
                            })
                          }
                        >
                          Activate {accessDays}d
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          type="button"
                          onClick={() => patch({ userId: u.id, revoke: true })}
                        >
                          Disable
                        </button>
                      </>
                    ) : null}
                    <button
                      className="btn btn-sm btn-ghost"
                      type="button"
                      title="Optional wallet credit (not used for AI)"
                      onClick={() =>
                        patch({
                          userId: u.id,
                          creditAmount: 100,
                          creditNote: "manual_eft_topup",
                        })
                      }
                    >
                      +100 wallet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="font-semibold">Per-user usage</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2">Email</th>
                <th>Paid</th>
                <th>Runs</th>
                <th>Storage</th>
                <th>AI calls</th>
              </tr>
            </thead>
            <tbody>
              {(ops?.perUser ?? []).map((u) => (
                <tr key={u.email} className="border-t border-border">
                  <td className="py-2">{u.email}</td>
                  <td>{u.isPaid ? "yes" : "no"}</td>
                  <td>{u.runCount}</td>
                  <td>{Math.round(u.storageBytes / 1024)} KB</td>
                  <td>{u.aiCallCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-soft">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value ?? "—"}</div>
    </div>
  );
}
