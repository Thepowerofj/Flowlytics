"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/shared/lib/formatUi";

type Billing = {
  status: "active" | "pending_payment" | "expired" | "disabled";
  hasAccess: boolean;
  eftDeclaredAt: string | null;
  eftNote: string | null;
  eftReference: string | null;
  accessExpiresAt: string | null;
  accessPeriodDays: number;
  payfast?: {
    configured: boolean;
    sandbox: boolean;
    amountZar: number;
  };
  bank: {
    name: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
    referenceHint: string;
  };
};

export function BillingPanel() {
  const [data, setData] = useState<Billing | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/billing");
    const json = await res.json();
    if (res.ok) setData(json);
    else setMessage(json.error ?? "Failed to load billing");
  }

  useEffect(() => {
    void load();
  }, []);

  async function copyRef() {
    if (!data?.eftReference) return;
    try {
      await navigator.clipboard.writeText(data.eftReference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy — select the reference and copy manually.");
    }
  }

  async function payWithPayfast() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/billing/payfast/checkout", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      setMessage(json.error ?? "Could not start PayFast checkout");
      return;
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = json.actionUrl as string;
    for (const [k, v] of Object.entries(json.fields as Record<string, string>)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = String(v);
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  async function declarePaid() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Could not record payment");
      return;
    }
    setMessage(
      "Thanks — we’ve recorded your payment declaration. An admin will activate your access.",
    );
    await load();
  }

  if (!data) {
    return <p className="text-sm text-muted">{message || "Loading…"}</p>;
  }

  const ref = data.eftReference;

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="font-semibold">Access status</h2>
        <p className="mt-2 text-sm">
          {data.hasAccess ? (
            <>
              Active until{" "}
              <strong>
                {data.accessExpiresAt
                  ? formatDateTime(data.accessExpiresAt, { withYear: true })
                  : "—"}
              </strong>
              . After that you’ll need to pay again and wait for reactivation.
            </>
          ) : data.status === "expired" ? (
            <>Your {data.accessPeriodDays}-day access window ended. Pay by EFT below to renew.</>
          ) : data.status === "disabled" ? (
            <>Your account is disabled. Contact the operator if you believe this is a mistake.</>
          ) : (
            <>
              Pay online with PayFast for instant {data.accessPeriodDays}-day access, or use
              manual EFT below (admin activation).
            </>
          )}
        </p>
        {data.eftDeclaredAt && !data.hasAccess ? (
          <p className="mt-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
            Payment declared {formatDateTime(data.eftDeclaredAt, { withYear: true })}
            {data.eftNote ? ` — “${data.eftNote}”` : ""}. Waiting for admin activation.
          </p>
        ) : null}
        {data.hasAccess ? (
          <p className="mt-4">
            <Link className="btn btn-primary" href="/home">
              Go to your flows
            </Link>
          </p>
        ) : null}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Your payment reference</h2>
        <p className="mt-1 text-sm text-muted">
          Use this short code as the bank beneficiary / payment reference — not your email
          (emails are too long for most banks and easy to mistype).
        </p>
        {ref ? (
          <div className="payment-ref mt-4">
            <code className="payment-ref__code" aria-label="Payment reference">
              {ref}
            </code>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void copyRef()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-danger">Reference unavailable — refresh the page.</p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Tip: say the letters and numbers aloud — there are no 0/O or 1/I lookalikes.
        </p>
      </section>

      {!data.hasAccess && data.status !== "disabled" && data.payfast?.configured ? (
        <section className="panel p-5">
          <h2 className="font-semibold">Pay with PayFast</h2>
          <p className="mt-1 text-sm text-muted">
            Card / Instant EFT via PayFast
            {data.payfast.sandbox ? " (sandbox)" : ""}. Access activates automatically when
            payment completes (ITN).
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            R{Number(data.payfast.amountZar).toFixed(2)}
            <span className="ml-2 text-sm font-normal text-muted">
              / {data.accessPeriodDays} days
            </span>
          </p>
          <button
            className="btn btn-primary mt-4"
            type="button"
            disabled={busy}
            onClick={() => void payWithPayfast()}
          >
            {busy ? "Redirecting…" : "Continue to PayFast"}
          </button>
          {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
        </section>
      ) : null}

      <section className="panel p-5">
        <h2 className="font-semibold">EFT payment details (fallback)</h2>
        <p className="mt-1 text-sm text-muted">
          Offline bank transfer. After you declare payment, an admin confirms and activates
          your account.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Bank</dt>
            <dd className="font-medium">{data.bank.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Account name</dt>
            <dd className="font-medium">{data.bank.accountName}</dd>
          </div>
          <div>
            <dt className="text-muted">Account number</dt>
            <dd className="font-medium tabular-nums">{data.bank.accountNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Branch code</dt>
            <dd className="font-medium tabular-nums">{data.bank.branchCode}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Payment reference</dt>
            <dd className="font-medium tabular-nums tracking-wide">
              {ref ?? data.bank.referenceHint}
            </dd>
          </div>
        </dl>
      </section>

      {!data.hasAccess && data.status !== "disabled" ? (
        <section className="panel p-5">
          <h2 className="font-semibold">I’ve paid</h2>
          <p className="mt-1 text-sm text-muted">
            Optional note (amount or date) helps the admin. Your reference{" "}
            <strong className="text-ink">{ref}</strong> is already on file for matching.
          </p>
          <label className="mt-3 block text-sm">
            Note
            <input
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={ref ? `e.g. R499 paid today, ref ${ref}` : "e.g. R499 paid today"}
            />
          </label>
          <button
            className="btn btn-primary mt-4"
            type="button"
            disabled={busy}
            onClick={() => void declarePaid()}
          >
            {busy ? "Saving…" : "I’ve completed the EFT"}
          </button>
          {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
        </section>
      ) : null}

      <p className="text-sm text-muted">
        AI features use your own API key — add it in{" "}
        <Link className="underline" href="/settings">
          Settings
        </Link>
        . The credit wallet is reserved for a future pay-as-you-go option and is not required now.
      </p>
    </div>
  );
}
