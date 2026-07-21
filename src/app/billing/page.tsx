import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { BillingPanel } from "@/components/BillingPanel";

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted">
          Pay by EFT to unlock Flowlytics for a fixed access window. AI uses your own API key in
          Settings — not wallet credits.
        </p>
        <div className="mt-8">
          <BillingPanel />
        </div>
      </main>
    </div>
  );
}
