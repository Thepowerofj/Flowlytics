import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/home");

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-16">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-1 text-muted">
          Activate users after EFT for a fixed access window, disable accounts, and monitor
          capacity. AI uses each user’s own API key; wallet credits are optional/legacy.
        </p>
        <div className="mt-6">
          <AdminPanel />
        </div>
      </main>
    </div>
  );
}
