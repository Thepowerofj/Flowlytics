import Link from "next/link";
import { listFlows } from "@/modules/flows";
import { AppHeader } from "@/components/AppHeader";
import { AutoPipelineStarter } from "@/components/AutoPipelineStarter";
import { CreateFlowButton } from "@/components/CreateFlowButton";
import { FlowList } from "@/components/FlowList";
import { requireActiveAccess } from "@/shared/lib/requireAccess";

export default async function HomeDashboard() {
  const session = await requireActiveAccess();
  const flows = await listFlows(session.user!.id);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your flows</h1>
            <p className="mt-1 text-muted">
              Open a saved pipeline to edit and Run — work continues in the background if you leave.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/ask" className="btn btn-sm btn-secondary">
              Ask
            </Link>
            <Link
              href="/schedules"
              className="btn btn-sm btn-ghost"
              title="Schedules can refresh URL ingest sources on each run"
            >
              Schedules
              <span className="schedule-early-pill">Early</span>
            </Link>
            <CreateFlowButton />
          </div>
        </div>

        <div className="mt-6">
          <FlowList
            flows={flows.map((f) => ({
              id: f.id,
              name: f.name,
              updatedAt: f.updatedAt.toISOString(),
              lastRun: f.lastRun
                ? {
                    id: f.lastRun.id,
                    status: f.lastRun.status,
                    queuePosition: f.lastRun.queuePosition,
                    etaSeconds: f.lastRun.etaSeconds,
                    createdAt: f.lastRun.createdAt.toISOString(),
                    finishedAt: f.lastRun.finishedAt?.toISOString() ?? null,
                    errorMessage: f.lastRun.errorMessage,
                  }
                : null,
            }))}
          />
        </div>

        <div className="mt-8">
          <AutoPipelineStarter />
        </div>
      </main>
    </div>
  );
}
