import { prisma } from "@/lib/prisma";
import { isClosedStatus, severityForGapSize } from "@/lib/constants";

// Returns the project's latest assessment (the editable "current" snapshot),
// creating a first one if none exists so scores always have somewhere to live.
export async function getOrCreateCurrentAssessment(projectId: string) {
  const existing = await prisma.assessment.findFirst({
    where: { projectId },
    orderBy: { takenAt: "desc" },
  });
  if (existing) return existing;

  // The very first assessment of a project is the baseline by default.
  return prisma.assessment.create({
    data: {
      projectId,
      source: "manual",
      narrative: "Current state",
      isBaseline: true,
    },
  });
}

/**
 * Phase 2 — take a new dated assessment (a fresh snapshot of current state).
 * Copies the latest assessment's scores forward as a starting point so the new
 * snapshot is complete; the user then edits current scores to record progress.
 */
export async function takeAssessment(projectId: string, narrative?: string) {
  const latest = await prisma.assessment.findFirst({
    where: { projectId },
    orderBy: { takenAt: "desc" },
    include: { scores: true },
  });

  const created = await prisma.assessment.create({
    data: { projectId, source: "manual", narrative: narrative?.trim() || null },
  });

  if (latest && latest.scores.length > 0) {
    await prisma.capabilityScore.createMany({
      data: latest.scores.map((s) => ({
        assessmentId: created.id,
        capabilityId: s.capabilityId,
        currentScore: s.currentScore,
        targetScore: s.targetScore,
        evidence: s.evidence,
        confidence: s.confidence,
      })),
    });
  }

  await recomputeGaps(projectId);
  return created;
}

/**
 * Gaps are COMPUTED from the latest assessment's capability scores, never typed.
 *
 * Phase 2 lifecycle-aware behaviour (vs Phase 1's "always delete when closed"):
 *  - Capability still has a positive gap → upsert its Gap, preserving status.
 *  - Capability's gap has closed (target met) and the gap is still untouched
 *    ("identified") → delete it (keeps the board clutter-free).
 *  - Capability's gap has closed but the gap was engaged (prioritized…in_progress)
 *    → auto-advance to "resolved" so the user can verify it. This is the spec's
 *    "a gap is only closed once a new assessment confirms it shrank."
 *  - Already resolved/verified gaps are left as-is (verification is the human step).
 */
export async function recomputeGaps(projectId: string): Promise<void> {
  const assessment = await getOrCreateCurrentAssessment(projectId);

  const scores = await prisma.capabilityScore.findMany({
    where: { assessmentId: assessment.id },
    include: { capability: true },
  });

  const positive = scores.filter((s) => s.targetScore - s.currentScore > 0);
  const positiveIds = new Set(positive.map((s) => s.capabilityId));

  // Only the deterministic, score-derived gaps are reconciled here. AI-proposed
  // gaps (source = "ai") are managed by the human-confirmed AI flow, untouched.
  const existing = await prisma.gap.findMany({
    where: { projectId, source: "score" },
  });

  // 1. Reconcile gaps whose capability no longer shows a positive gap.
  for (const gap of existing) {
    if (gap.capabilityId && positiveIds.has(gap.capabilityId)) continue;

    if (gap.capabilityId == null || gap.status === "identified") {
      // Capability-less legacy row, or an untouched auto-gap that closed.
      await prisma.gap.delete({ where: { id: gap.id } });
    } else if (!isClosedStatus(gap.status)) {
      // Engaged gap re-measured as closed → resolved, awaiting verification.
      await prisma.gap.update({
        where: { id: gap.id },
        data: { status: "resolved" },
      });
    }
    // resolved / verified gaps are intentionally left untouched.
  }

  // 2. Upsert one gap per capability that has a positive gap (preserve status).
  for (const score of positive) {
    const gapSize = score.targetScore - score.currentScore;
    await prisma.gap.upsert({
      where: {
        projectId_capabilityId_source: {
          projectId,
          capabilityId: score.capabilityId,
          source: "score",
        },
      },
      update: {
        // Recomputed fields only. impact/effort are user-owned (Phase 3
        // prioritization), so they are intentionally NOT overwritten here.
        title: `Close gap in ${score.capability.name}`,
        severity: severityForGapSize(gapSize),
        sourceAssessmentId: assessment.id,
      },
      create: {
        projectId,
        capabilityId: score.capabilityId,
        sourceAssessmentId: assessment.id,
        title: `Close gap in ${score.capability.name}`,
        description: `Current maturity ${score.currentScore}/5, target ${score.targetScore}/5.`,
        severity: severityForGapSize(gapSize),
        impact: Math.min(gapSize + 2, 5),
        effort: 3,
        status: "identified",
      },
    });
  }
}

export type RankedGap = {
  id: string;
  capabilityId: string | null;
  capabilityName: string;
  title: string;
  currentScore: number;
  targetScore: number;
  gapSize: number;
  businessWeight: number;
  rank: number; // gapSize * businessWeight
  severity: string;
  impact: number;
  effort: number;
  status: string;
  achievedAt: Date | null;
};

/**
 * Ranked gap list for a project. Recomputes from the latest scores first so the
 * view is always in sync. Open gaps rank by gapSize × businessWeight (desc).
 */
export async function getRankedGaps(projectId: string): Promise<RankedGap[]> {
  await recomputeGaps(projectId);

  const assessment = await getOrCreateCurrentAssessment(projectId);
  const gaps = await prisma.gap.findMany({
    // Deterministic, score-derived gaps only — the source of truth.
    where: { projectId, source: "score" },
    include: {
      achievement: true,
      capability: {
        include: { scores: { where: { assessmentId: assessment.id } } },
      },
    },
  });

  const ranked: RankedGap[] = gaps.map((gap) => {
    const cap = gap.capability;
    const score = cap?.scores[0];
    const currentScore = score?.currentScore ?? 0;
    const targetScore = score?.targetScore ?? 0;
    const gapSize = Math.max(targetScore - currentScore, 0);
    const businessWeight = cap?.businessWeight ?? 1;
    return {
      id: gap.id,
      capabilityId: gap.capabilityId,
      capabilityName: cap?.name ?? "(unknown)",
      title: gap.title,
      currentScore,
      targetScore,
      gapSize,
      businessWeight,
      rank: gapSize * businessWeight,
      severity: gap.severity,
      impact: gap.impact,
      effort: gap.effort,
      status: gap.status,
      achievedAt: gap.achievement?.achievedAt ?? null,
    };
  });

  ranked.sort((a, b) => b.rank - a.rank);
  return ranked;
}

// ----------------------------------------------------------- Assessments

export type AssessmentSummary = {
  id: string;
  takenAt: Date;
  narrative: string | null;
  isBaseline: boolean;
  source: string;
  open: number;
  closed: number;
  isLatest: boolean;
};

export async function getAssessmentSummaries(
  projectId: string
): Promise<AssessmentSummary[]> {
  const assessments = await prisma.assessment.findMany({
    where: { projectId },
    orderBy: { takenAt: "desc" },
    include: { scores: true },
  });
  return assessments.map((a, idx) => ({
    id: a.id,
    takenAt: a.takenAt,
    narrative: a.narrative,
    isBaseline: a.isBaseline,
    source: a.source,
    open: a.scores.filter((s) => s.targetScore > s.currentScore).length,
    closed: a.scores.filter((s) => s.targetScore <= s.currentScore).length,
    isLatest: idx === 0,
  }));
}

// before/after span for a capability across the project's assessments —
// baseline (or earliest) current score → latest current score, plus target.
// Used to stamp Achievements with proof of movement when a gap is verified.
export async function getCapabilityScoreSpan(
  projectId: string,
  capabilityId: string
): Promise<{ from: number | null; to: number | null; target: number | null }> {
  const assessments = await prisma.assessment.findMany({
    where: { projectId, scores: { some: { capabilityId } } },
    orderBy: { takenAt: "asc" },
    include: { scores: { where: { capabilityId } } },
  });
  if (assessments.length === 0) return { from: null, to: null, target: null };
  const baseline = assessments.find((a) => a.isBaseline) ?? assessments[0];
  const latest = assessments[assessments.length - 1];
  return {
    from: baseline.scores[0]?.currentScore ?? null,
    to: latest.scores[0]?.currentScore ?? null,
    target: latest.scores[0]?.targetScore ?? null,
  };
}

// ------------------------------------------------------------- Burndown

export type BurndownPoint = {
  label: string; // short date/time for the x-axis
  open: number; // capabilities still below target at this snapshot
  closed: number; // capabilities meeting target at this snapshot
};

/**
 * Burndown series, derived from the dated assessment snapshots (SPEC note: keep
 * assessments dated so you can chart a burndown). One point per assessment in
 * chronological order — open gaps should trend down as the loop runs.
 */
export async function getBurndownData(
  projectId: string
): Promise<BurndownPoint[]> {
  const assessments = await prisma.assessment.findMany({
    where: { projectId },
    orderBy: { takenAt: "asc" },
    include: { scores: true },
  });

  return assessments.map((a) => {
    const iso = a.takenAt.toISOString();
    return {
      label: iso.slice(5, 16).replace("T", " "), // "MM-DD HH:MM"
      open: a.scores.filter((s) => s.targetScore > s.currentScore).length,
      closed: a.scores.filter((s) => s.targetScore <= s.currentScore).length,
    };
  });
}

// ------------------------------------------------------------- AI gaps

export type AiGap = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  suggestedCapability: string | null;
  impact: number;
  status: string;
};

// AI-proposed gaps (human-confirmed) for a project, newest first.
export async function getAiGaps(projectId: string): Promise<AiGap[]> {
  const gaps = await prisma.gap.findMany({
    where: { projectId, source: "ai" },
    orderBy: { id: "desc" },
  });
  return gaps.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    severity: g.severity,
    suggestedCapability: g.suggestedCapability,
    impact: g.impact,
    status: g.status,
  }));
}

// --------------------------------------------------- Portfolio burndown

/**
 * Aggregate burndown across ALL projects for the manager dashboard. For each
 * distinct assessment date, sum each project's open/closed counts using that
 * project's latest assessment at-or-before the date (carry-forward), so the
 * series is a true portfolio-wide trend rather than per-project snapshots.
 */
export async function getPortfolioBurndown(
  scope: string[] | "all"
): Promise<BurndownPoint[]> {
  const assessments = await prisma.assessment.findMany({
    where: scope === "all" ? undefined : { projectId: { in: scope } },
    orderBy: { takenAt: "asc" },
    include: { scores: true },
  });
  if (assessments.length === 0) return [];

  // Group assessments by project, each already ascending by takenAt.
  const byProject = new Map<string, typeof assessments>();
  for (const a of assessments) {
    const arr = byProject.get(a.projectId) ?? [];
    arr.push(a);
    byProject.set(a.projectId, arr);
  }

  const counts = (a: (typeof assessments)[number]) => ({
    open: a.scores.filter((s) => s.targetScore > s.currentScore).length,
    closed: a.scores.filter((s) => s.targetScore <= s.currentScore).length,
  });

  const dates = Array.from(new Set(assessments.map((a) => a.takenAt.getTime()))).sort(
    (x, y) => x - y
  );

  return dates.map((t) => {
    let open = 0;
    let closed = 0;
    for (const list of byProject.values()) {
      // latest assessment for this project with takenAt <= t
      let latest: (typeof assessments)[number] | undefined;
      for (const a of list) {
        if (a.takenAt.getTime() <= t) latest = a;
        else break;
      }
      if (latest) {
        const c = counts(latest);
        open += c.open;
        closed += c.closed;
      }
    }
    const iso = new Date(t).toISOString();
    return { label: iso.slice(5, 10), open, closed };
  });
}
