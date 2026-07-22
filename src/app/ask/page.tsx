import { AppHeader } from "@/components/AppHeader";
import { AskPanel } from "@/components/ask/AskPanel";
import { requireActiveAccess } from "@/shared/lib/requireAccess";

export default async function AskPage() {
  await requireActiveAccess();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ask</h1>
            <p className="mt-0.5 text-sm text-muted">
              Attach CSV/Excel in the chat, ask a question — same pipeline engine. Open
              Builder anytime for full control.
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <AskPanel />
        </div>
      </main>
    </div>
  );
}
