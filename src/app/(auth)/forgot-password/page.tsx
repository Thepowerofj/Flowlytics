"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(
      data.message ??
        "If that email is registered with a password, you’ll receive a reset link shortly.",
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BrandLogo href="/" size="lg" />
      <h1 className="mt-4 text-2xl font-semibold">Forgot password</h1>
      <p className="mt-1 text-sm text-muted">
        We’ll email a short-lived link to reset your password.
      </p>
      <form onSubmit={onSubmit} className="panel mt-6 space-y-3 p-6">
        <label className="block text-sm">
          Email
          <input
            className="input mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email reset link"}
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
