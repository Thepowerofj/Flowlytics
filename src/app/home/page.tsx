import Link from "next/link";
import { listFlows } from "@/modules/flows";
import { AppHeader } from "@/components/AppHeader";
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
            <h1 className="text-3xl font-semibold tracking-tight">Analyse a spreadsheet</h1>
            <p className="mt-1 text-muted">
              Start in Guided Ask for upload, profiling, questions, run progress, and decision-ready results. Open Builder when you want to inspect or tune the pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/ask" className="btn btn-primary">
              Analyse a spreadsheet
            </Link>
            <Link
              href="/schedules"
              className="btn btn-sm btn-ghost"
              title="Schedules can refresh URL ingest sources on each run"
            >
              Schedules
              <span className="schedule-early-pill">Early</span>
            </Link>
            <CreateFlowButton
              label="Advanced Builder"
              className="btn btn-secondary"
            />
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
      </main>
    </div>
  );
}
