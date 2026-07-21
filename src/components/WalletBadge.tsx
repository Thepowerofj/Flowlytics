"use client";

import { useEffect, useState } from "react";

export function WalletBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => setBalance(null));
  }, []);

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-sm shadow-soft"
      title="PAYG AI wallet — credits used for opt-in AI blocks"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="text-muted">Wallet</span>
      <strong className="tabular-nums text-accent-deep">{balance ?? "…"}</strong>
    </div>
  );
}
