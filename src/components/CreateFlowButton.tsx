"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateFlowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untitled flow" }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/flows/${data.id}`);
  }

  return (
    <button className="btn btn-primary" disabled={busy} onClick={create} type="button">
      {busy ? "Creating…" : "New flow"}
    </button>
  );
}
