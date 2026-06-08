import { prisma } from "@/lib/prisma";

export type CostRollup = { oneTime: number; monthly: number; annual: number };

// Sum requirement costs by cadence, keeping one-time and recurring SEPARATE —
// a monthly subscription must never be folded into a one-time number. Rejected
// requirements are excluded; null costs count as zero.
export function rollupCosts(
  reqs: { cost: number | null; costCadence: string; status: string }[]
): CostRollup {
  const r: CostRollup = { oneTime: 0, monthly: 0, annual: 0 };
  for (const x of reqs) {
    if (x.status === "rejected" || x.cost == null) continue;
    if (x.costCadence === "monthly") r.monthly += x.cost;
    else if (x.costCadence === "annual") r.annual += x.cost;
    else r.oneTime += x.cost;
  }
  return r;
}

export type ProcurementRow = {
  id: string;
  gapId: string;
  gapTitle: string;
  actionTitle: string | null;
  type: string;
  name: string;
  description: string | null;
  cost: number | null;
  costCadence: string;
  status: string;
  vendor: string | null;
  url: string | null;
};

// All requirements across a project's gaps (the procurement/subscription list).
export async function getProjectRequirements(
  projectId: string
): Promise<ProcurementRow[]> {
  const reqs = await prisma.requirement.findMany({
    where: { gap: { projectId } },
    orderBy: { createdAt: "desc" },
    include: {
      gap: { select: { id: true, title: true } },
      action: { select: { title: true } },
    },
  });
  return reqs.map((r) => ({
    id: r.id,
    gapId: r.gapId,
    gapTitle: r.gap.title,
    actionTitle: r.action?.title ?? null,
    type: r.type,
    name: r.name,
    description: r.description,
    cost: r.cost,
    costCadence: r.costCadence,
    status: r.status,
    vendor: r.vendor,
    url: r.url,
  }));
}
