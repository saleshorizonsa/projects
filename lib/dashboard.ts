import { prisma } from "@/lib/prisma";
import { CLOSED_GAP_STATUSES } from "@/lib/constants";
import { rollupCosts, type CostRollup } from "@/lib/requirements";

// "all" (admin) or an explicit list of accessible project ids.
export type Scope = string[] | "all";

function projectWhere(scope: Scope) {
  return scope === "all" ? {} : { id: { in: scope } };
}
function byProjectId(scope: Scope) {
  return scope === "all" ? {} : { projectId: { in: scope } };
}

export type PortfolioStats = {
  projects: number;
  openGaps: number;
  closedGaps: number;
  achievements: number;
};

export async function getPortfolioStats(scope: Scope): Promise<PortfolioStats> {
  const [projects, openGaps, closedGaps, achievements] = await Promise.all([
    prisma.project.count({ where: projectWhere(scope) }),
    prisma.gap.count({
      where: { ...byProjectId(scope), status: { notIn: CLOSED_GAP_STATUSES } },
    }),
    prisma.gap.count({
      where: { ...byProjectId(scope), status: { in: CLOSED_GAP_STATUSES } },
    }),
    prisma.achievement.count({ where: byProjectId(scope) }),
  ]);
  return { projects, openGaps, closedGaps, achievements };
}

export type Breakdown = { name: string; open: number; closed: number };

// Open vs closed gaps per accessible project.
export async function getGapsByProject(scope: Scope): Promise<Breakdown[]> {
  const projects = await prisma.project.findMany({
    where: projectWhere(scope),
    orderBy: { createdAt: "desc" },
    include: { gaps: { select: { status: true } } },
  });
  return projects.map((p) => {
    const closed = p.gaps.filter((g) =>
      (CLOSED_GAP_STATUSES as string[]).includes(g.status)
    ).length;
    return { name: p.name, open: p.gaps.length - closed, closed };
  });
}

// Open vs done tasks per team, scoped to tasks inside accessible projects.
export async function getTasksByTeam(scope: Scope): Promise<Breakdown[]> {
  const taskScope =
    scope === "all" ? {} : { action: { gap: { projectId: { in: scope } } } };
  const tasks = await prisma.task.findMany({
    where: taskScope,
    select: { status: true, team: { select: { name: true } } },
  });

  const map = new Map<string, Breakdown>();
  for (const t of tasks) {
    const name = t.team?.name ?? "No team";
    const row = map.get(name) ?? { name, open: 0, closed: 0 };
    if (t.status === "done") row.closed += 1;
    else row.open += 1;
    map.set(name, row);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Planned spend (cost-to-close, recurring kept separate) vs budget per project.
export type SpendVsBudget = {
  planned: CostRollup;
  totalBudget: number;
  byProject: {
    name: string;
    oneTime: number;
    monthly: number;
    annual: number;
    budget: number | null;
  }[];
};

export async function getSpendVsBudget(scope: Scope): Promise<SpendVsBudget> {
  const [projects, requirements] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere(scope),
      orderBy: { name: "asc" },
      select: { id: true, name: true, budget: true },
    }),
    prisma.requirement.findMany({
      where: scope === "all" ? {} : { gap: { projectId: { in: scope } } },
      select: {
        cost: true,
        costCadence: true,
        status: true,
        gap: { select: { projectId: true } },
      },
    }),
  ]);
  const byProject = projects.map((p) => {
    const r = rollupCosts(requirements.filter((x) => x.gap.projectId === p.id));
    return {
      name: p.name,
      oneTime: r.oneTime,
      monthly: r.monthly,
      annual: r.annual,
      budget: p.budget,
    };
  });
  return {
    planned: rollupCosts(requirements),
    totalBudget: projects.reduce((a, p) => a + (p.budget ?? 0), 0),
    byProject,
  };
}
