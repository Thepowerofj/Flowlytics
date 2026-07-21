"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Missing reset token. Request a new link from Forgot password.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not reset password");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="panel mt-6 space-y-3 p-6">
      <label className="block text-sm">
        New password
        <input
          className="input mt-1"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label className="block text-sm">
        Confirm password
        <input
          className="input mt-1"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button className="btn btn-primary w-full" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BrandLogo href="/" size="lg" />
      <h1 className="mt-4 text-2xl font-semibold">Choose a new password</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
        <ResetForm />
      </Suspense>
      <p className="mt-4 text-sm text-muted">
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
