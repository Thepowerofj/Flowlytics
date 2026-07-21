import { notFound } from "next/navigation";
import { getFlowForUser } from "@/modules/flows";
import type { FlowGraph } from "@/modules/blocks";
import { AppHeader } from "@/components/AppHeader";
import { FlowCanvas } from "@/components/FlowCanvas";
import { requireActiveAccess } from "@/shared/lib/requireAccess";

export default async function FlowPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const session = await requireActiveAccess();
  const { flowId } = await params;
  try {
    const flow = await getFlowForUser(flowId, session.user!.id);
    const graph = flow.graphJson as unknown as FlowGraph;
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <FlowCanvas flowId={flow.id} initialName={flow.name} initialGraph={graph} />
      </div>
    );
  } catch {
    notFound();
  }
}
