import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { SettingsPanel } from "@/components/SettingsPanel";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted">
          Manage your LLM API key for opt-in AI activities.
        </p>
        <div className="mt-8">
          <SettingsPanel />
        </div>
      </main>
    </div>
  );
}