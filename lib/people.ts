import { prisma } from "@/lib/prisma";

// A task enriched with the gap/project it ultimately belongs to, for the
// per-person workload view (tasks live under Action → Gap → Project).
export type PersonTask = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  overdue: boolean;
  teamName: string | null;
  actionTitle: string;
  gapId: string;
  gapTitle: string;
  projectId: string;
  projectName: string;
};

function enrichTask(task: {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  team: { name: string } | null;
  action: {
    title: string;
    gap: { id: string; title: string; projectId: string; project: { name: string } };
  };
}): PersonTask {
  const overdue =
    task.dueDate !== null && task.status !== "done" && task.dueDate < new Date();
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate,
    overdue,
    teamName: task.team?.name ?? null,
    actionTitle: task.action.title,
    gapId: task.action.gap.id,
    gapTitle: task.action.gap.title,
    projectId: task.action.gap.projectId,
    projectName: task.action.gap.project.name,
  };
}

const taskInclude = {
  team: true,
  action: { include: { gap: { include: { project: true } } } },
} as const;

// "all" (admin) or accessible project ids — task lists/counts are scoped to it.
export type Scope = string[] | "all";

function taskScope(scope: Scope) {
  return scope === "all" ? {} : { action: { gap: { projectId: { in: scope } } } };
}

export async function getPersonWithTasks(personId: string, scope: Scope) {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      memberships: { include: { team: true } },
      tasks: {
        where: taskScope(scope),
        include: taskInclude,
        orderBy: [{ dueDate: "asc" }],
      },
    },
  });
  if (!person) return null;
  return {
    person,
    tasks: person.tasks.map(enrichTask),
  };
}

export type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  openTasks: number;
  overdueTasks: number;
};

// People with their open/overdue task counts, sorted by load (busiest first)
// so an overloaded person is easy to spot.
export async function getPeopleWithLoad(scope: Scope): Promise<PersonRow[]> {
  const people = await prisma.person.findMany({
    include: {
      tasks: { where: taskScope(scope), select: { status: true, dueDate: true } },
    },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  const rows = people.map((p) => {
    const open = p.tasks.filter((t) => t.status !== "done");
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      openTasks: open.length,
      overdueTasks: open.filter((t) => t.dueDate !== null && t.dueDate < now).length,
    };
  });
  rows.sort((a, b) => b.openTasks - a.openTasks);
  return rows;
}
