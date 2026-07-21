"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Could not register");
      return;
    }
    const login = await signIn("credentials", { email, password, redirect: false });
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push("/home");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BrandLogo href="/" size="lg" />
      <h1 className="mt-4 text-2xl font-semibold">Create your account</h1>
      <form onSubmit={onSubmit} className="panel mt-6 space-y-3 p-6">
        <label className="block text-sm">
          Name
          <input
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
          Sign up
        </button>
        <button
          className="btn btn-secondary w-full"
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/home" })}
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
