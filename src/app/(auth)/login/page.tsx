"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BrandLogo } from "@/components/BrandLogo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const resetOk = params.get("reset") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BrandLogo href="/" size="lg" />
      <h1 className="mt-4 text-2xl font-semibold">Sign in</h1>
      {resetOk ? (
        <p className="mt-2 rounded-xl border border-border bg-accent-soft/40 px-3 py-2 text-sm text-ink">
          Password updated — you can sign in with your new password.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="panel mt-6 space-y-3 p-6">
        <label className="block text-sm">
          Email
          <input
            className="input mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="input mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" type="submit">
          Sign in
        </button>
        <button
          className="btn btn-secondary w-full"
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/home" })}
        >
          Continue with Google
        </button>
      </form>
      <p className="mt-3 text-sm text-muted">
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        No account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
          <BrandLogo href="/" size="lg" />
          <p className="mt-6 text-sm text-muted">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}