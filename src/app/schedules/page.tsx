import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SchedulesPageClient } from "@/components/schedules/SchedulesPageClient";
import { requireActiveAccess } from "@/shared/lib/requireAccess";

export default async function SchedulesPage() {
  await requireActiveAccess();

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Schedules</h1>
            <p className="mt-1 text-muted">
              Early access: repeat runs for testing. Full value comes when pipelines can
              connect to external sources.
            </p>
          </div>
          <Link href="/home" className="btn btn-sm btn-secondary">
            Back to flows
          </Link>
        </div>
        <SchedulesPageClient />
      </main>
    </div>
  );
}
