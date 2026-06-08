import { prisma } from "@/lib/prisma";

// ------------------------------------------------- Multi-rater scoring

export type CapabilityRating = {
  capabilityId: string;
  capabilityName: string;
  canonicalCurrent: number | null;
  canonicalTarget: number | null;
  ratings: {
    id: string;
    raterId: string;
    raterName: string;
    currentScore: number;
    targetScore: number;
    note: string | null;
  }[];
  avgCurrent: number | null;
  spread: number; // max - min of rater current scores (disagreement)
};

export async function getMultiRater(
  projectId: string,
  assessmentId: string
): Promise<CapabilityRating[]> {
  const caps = await prisma.capability.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    include: {
      scores: { where: { assessmentId } },
      ratings: {
        where: { assessmentId },
        include: { rater: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return caps.map((c) => {
    const canonical = c.scores[0];
    const currents = c.ratings.map((r) => r.currentScore);
    const spread = currents.length
      ? Math.max(...currents) - Math.min(...currents)
      : 0;
    const avgCurrent = currents.length
      ? currents.reduce((a, b) => a + b, 0) / currents.length
      : null;
    return {
      capabilityId: c.id,
      capabilityName: c.name,
      canonicalCurrent: canonical?.currentScore ?? null,
      canonicalTarget: canonical?.targetScore ?? null,
      ratings: c.ratings.map((r) => ({
        id: r.id,
        raterId: r.raterId,
        raterName: r.rater.name,
        currentScore: r.currentScore,
        targetScore: r.targetScore,
        note: r.note,
      })),
      avgCurrent,
      spread,
    };
  });
}

// ------------------------------------------- Quarterly Achievement/Acquirement report

export type QuarterRollup = {
  quarter: string;
  achievements: {
    title: string;
    fromScore: number | null;
    toScore: number | null;
    targetScore: number | null;
    at: Date;
  }[];
  acquirements: { title: string; cost: number | null; at: Date }[];
  spend: number;
};

function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export async function getQuarterlyReport(
  projectId: string
): Promise<QuarterRollup[]> {
  const [achs, acqs] = await Promise.all([
    prisma.achievement.findMany({
      where: { projectId },
      orderBy: { achievedAt: "desc" },
    }),
    prisma.acquirement.findMany({
      where: { projectId },
      orderBy: { acquiredAt: "desc" },
    }),
  ]);

  const map = new Map<string, QuarterRollup>();
  const get = (q: string) => {
    let r = map.get(q);
    if (!r) {
      r = { quarter: q, achievements: [], acquirements: [], spend: 0 };
      map.set(q, r);
    }
    return r;
  };
  for (const a of achs) {
    get(quarterKey(a.achievedAt)).achievements.push({
      title: a.title,
      fromScore: a.fromScore,
      toScore: a.toScore,
      targetScore: a.targetScore,
      at: a.achievedAt,
    });
  }
  for (const a of acqs) {
    const r = get(quarterKey(a.acquiredAt));
    r.acquirements.push({ title: a.title, cost: a.cost, at: a.acquiredAt });
    r.spend += a.cost ?? 0;
  }
  // Most recent quarter first.
  return [...map.values()].sort((a, b) => (a.quarter < b.quarter ? 1 : -1));
}
