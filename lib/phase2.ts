import { prisma } from "@/lib/prisma";

// ----------------------------------------------------- Regression detection

export type Regressions = {
  dropped: { name: string; from: number; to: number }[]; // capability score fell
  reopened: { id: string; title: string; status: string }[]; // verified gap reopened
};

export async function getRegressions(projectId: string): Promise<Regressions> {
  // Capabilities whose latest current score is below an earlier assessment's.
  const caps = await prisma.capability.findMany({
    where: { projectId },
    include: {
      scores: { include: { assessment: { select: { takenAt: true } } } },
    },
  });
  const dropped: Regressions["dropped"] = [];
  for (const c of caps) {
    const series = c.scores
      .map((s) => ({ current: s.currentScore, at: s.assessment.takenAt }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (series.length < 2) continue;
    const latest = series[series.length - 1].current;
    const maxEarlier = Math.max(...series.slice(0, -1).map((s) => s.current));
    if (latest < maxEarlier) {
      dropped.push({ name: c.name, from: maxEarlier, to: latest });
    }
  }

  // Gaps that were verified at some point (per the audit trail) but are open now.
  const verifiedAudits = await prisma.gapAudit.findMany({
    where: { projectId, toStatus: "verified" },
    select: { gapId: true },
  });
  const verifiedGapIds = [...new Set(verifiedAudits.map((a) => a.gapId))];
  const reopened =
    verifiedGapIds.length > 0
      ? await prisma.gap.findMany({
          where: { id: { in: verifiedGapIds }, status: { not: "verified" } },
          select: { id: true, title: true, status: true },
        })
      : [];

  return { dropped, reopened };
}

// --------------------------------------------------- Goals with computed progress

export type GoalWithProgress = {
  id: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: string;
  metricType: string;
  metricTargetValue: number | null;
  metricUnit: string | null;
  linkedGaps: { id: string; title: string; status: string }[];
  total: number;
  verified: number;
  progress: number; // % of linked gaps verified
};

export async function getGoalsWithProgress(
  projectId: string
): Promise<GoalWithProgress[]> {
  const goals = await prisma.goal.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { title: "asc" }],
    include: {
      gaps: {
        include: { gap: { select: { id: true, title: true, status: true } } },
      },
    },
  });
  return goals.map((g) => {
    const linkedGaps = g.gaps.map((gg) => gg.gap);
    const total = linkedGaps.length;
    const verified = linkedGaps.filter((x) => x.status === "verified").length;
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      targetDate: g.targetDate,
      status: g.status,
      metricType: g.metricType,
      metricTargetValue: g.metricTargetValue,
      metricUnit: g.metricUnit,
      linkedGaps,
      total,
      verified,
      progress: total > 0 ? Math.round((verified / total) * 100) : 0,
    };
  });
}
