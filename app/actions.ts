"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateCurrentAssessment,
  recomputeGaps,
  takeAssessment,
} from "@/lib/gaps";
import {
  clampScore,
  GAP_STATUSES,
  impactForSeverity,
  isWorkStatus,
  PROJECT_STATUSES,
  SEVERITIES,
  type GapStatus,
  type ProjectStatus,
  type Severity,
} from "@/lib/constants";
import { getTemplate } from "@/lib/templates";
import {
  assertProjectEdit,
  assertProjectOwner,
  getCurrentUser,
} from "@/lib/access";

function str(formData: FormData, key: string): string {
  return (formData.get(key) ?? "").toString().trim();
}

// ---------------------------------------------------------------- Projects

export async function createProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const name = str(formData, "name");
  if (!name) return;
  const description = str(formData, "description");
  const project = await prisma.project.create({
    data: { name, description: description || null, ownerId: user.id },
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id || !name) return;
  if (!(await assertProjectEdit(id))) return;
  const status = str(formData, "status");
  await prisma.project.update({
    where: { id },
    data: {
      name,
      description: str(formData, "description") || null,
      status: PROJECT_STATUSES.includes(status as ProjectStatus)
        ? status
        : undefined,
    },
  });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function deleteProject(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  if (!(await assertProjectOwner(id))) return;
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------------------------------------------------- Project sharing (Phase 5)

export async function shareProjectWithUser(formData: FormData) {
  const projectId = str(formData, "projectId");
  const email = str(formData, "email").toLowerCase();
  const role = str(formData, "role") === "editor" ? "editor" : "viewer";
  if (!projectId || !email) return;
  if (!(await assertProjectOwner(projectId))) return;

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return; // no such user — silently ignore
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (project?.ownerId === target.id) return; // already the owner

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: target.id } },
    create: { projectId, userId: target.id, role },
    update: { role },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function unshareProjectUser(formData: FormData) {
  const projectId = str(formData, "projectId");
  const userId = str(formData, "userId");
  if (!projectId || !userId) return;
  if (!(await assertProjectOwner(projectId))) return;
  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/projects/${projectId}`);
}

export async function shareProjectWithTeam(formData: FormData) {
  const projectId = str(formData, "projectId");
  const teamId = str(formData, "teamId");
  const role = str(formData, "role") === "editor" ? "editor" : "viewer";
  if (!projectId || !teamId) return;
  if (!(await assertProjectOwner(projectId))) return;
  await prisma.projectTeamShare.upsert({
    where: { projectId_teamId: { projectId, teamId } },
    create: { projectId, teamId, role },
    update: { role },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function unshareProjectTeam(formData: FormData) {
  const projectId = str(formData, "projectId");
  const teamId = str(formData, "teamId");
  if (!projectId || !teamId) return;
  if (!(await assertProjectOwner(projectId))) return;
  await prisma.projectTeamShare.deleteMany({ where: { projectId, teamId } });
  revalidatePath(`/projects/${projectId}`);
}

// ------------------------------------------------------------------- Goals

export async function addGoal(formData: FormData) {
  const projectId = str(formData, "projectId");
  const title = str(formData, "title");
  if (!projectId || !title) return;
  if (!(await assertProjectEdit(projectId))) return;
  const targetDate = str(formData, "targetDate");
  await prisma.goal.create({
    data: {
      projectId,
      title,
      description: str(formData, "description") || null,
      targetDate: targetDate ? new Date(targetDate) : null,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleGoal(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return;
  await prisma.goal.update({
    where: { id },
    data: { status: goal.status === "done" ? "open" : "done" },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteGoal(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.goal.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}

// ------------------------------------------------------------ Capabilities

export async function addCapability(formData: FormData) {
  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  if (!projectId || !name) return;
  if (!(await assertProjectEdit(projectId))) return;
  const weightRaw = Number(str(formData, "businessWeight"));
  const businessWeight = clampScore(weightRaw); // 1-5
  await prisma.capability.create({
    data: { projectId, name, businessWeight },
  });
  // A new (unscored) capability can't produce a gap yet, but keep gaps in sync.
  await recomputeGaps(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

export async function deleteCapability(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.capability.delete({ where: { id } });
  await recomputeGaps(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

// Records current/target maturity for one capability, then recomputes gaps.
export async function saveScore(formData: FormData) {
  const projectId = str(formData, "projectId");
  const capabilityId = str(formData, "capabilityId");
  if (!projectId || !capabilityId) return;
  if (!(await assertProjectEdit(projectId))) return;
  const currentScore = clampScore(Number(str(formData, "currentScore")));
  const targetScore = clampScore(Number(str(formData, "targetScore")));

  const assessment = await getOrCreateCurrentAssessment(projectId);
  await prisma.capabilityScore.upsert({
    where: {
      assessmentId_capabilityId: {
        assessmentId: assessment.id,
        capabilityId,
      },
    },
    update: { currentScore, targetScore },
    create: {
      assessmentId: assessment.id,
      capabilityId,
      currentScore,
      targetScore,
    },
  });

  // Gaps are derived from scores — recompute on every score change.
  await recomputeGaps(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

// -------------------------------------------------------------------- Gaps

// Gaps are never created by hand — this only forces a recompute from scores.
export async function recomputeGapsAction(projectId: string) {
  if (!projectId) return;
  if (!(await assertProjectEdit(projectId))) return;
  await recomputeGaps(projectId);
  revalidatePath(`/projects/${projectId}/gaps`);
}

export async function updateGapStatus(
  gapId: string,
  projectId: string,
  status: string
) {
  if (!gapId || !GAP_STATUSES.includes(status as GapStatus)) return;
  const user = await assertProjectEdit(projectId);
  if (!user) return;

  const prev = await prisma.gap.findUnique({ where: { id: gapId } });
  if (!prev || prev.projectId !== projectId) return;

  const gap = await prisma.gap.update({
    where: { id: gapId },
    data: { status },
  });

  // Audit every status change (Phase 5).
  if (prev.status !== status) {
    await prisma.gapAudit.create({
      data: {
        gapId,
        projectId,
        fromStatus: prev.status,
        toStatus: status,
        changedById: user.id,
        changedByEmail: user.email ?? null,
      },
    });
  }

  // Reaching "verified" auto-logs an Achievement (idempotent — one per gap).
  // Moving back out of "verified" removes it, keeping the record consistent.
  if (status === "verified") {
    await prisma.achievement.upsert({
      where: { gapId },
      create: {
        gapId,
        projectId: gap.projectId,
        title: gap.title.replace(/^Close gap in /, "Closed gap in ") || gap.title,
      },
      update: {},
    });
  } else {
    await prisma.achievement.deleteMany({ where: { gapId } });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
}

// -------------------------------------------------------------- Assessments

// Take a new dated assessment (snapshot) — the basis for the burndown over time.
export async function takeAssessmentAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  if (!projectId) return;
  if (!(await assertProjectEdit(projectId))) return;
  await takeAssessment(projectId, str(formData, "note") || undefined);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

// ------------------------------------------------- Gap prioritization (Phase 3)

// impact & effort (1-5) are user-owned fields that drive the impact × effort matrix.
export async function updateGapPriority(formData: FormData) {
  const gapId = str(formData, "gapId");
  const projectId = str(formData, "projectId");
  if (!gapId || !projectId) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.gap.update({
    where: { id: gapId },
    data: {
      impact: clampScore(Number(str(formData, "impact"))),
      effort: clampScore(Number(str(formData, "effort"))),
    },
  });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
  revalidatePath(`/projects/${projectId}/matrix`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

// ------------------------------------------------------------ People (global)

export async function createPerson(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const name = str(formData, "name");
  if (!name) return;
  await prisma.person.create({
    data: {
      name,
      email: str(formData, "email") || null,
      role: str(formData, "role") || null,
    },
  });
  revalidatePath("/people");
}

export async function deletePerson(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const id = str(formData, "id");
  if (!id) return;
  // Tasks keep existing (assignee set null via FK onDelete: SetNull).
  await prisma.person.delete({ where: { id } });
  revalidatePath("/people");
  revalidatePath("/teams");
}

// ------------------------------------------------------------- Teams (global)

export async function createTeam(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const name = str(formData, "name");
  if (!name) return;
  await prisma.team.create({ data: { name } });
  revalidatePath("/teams");
}

export async function deleteTeam(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const id = str(formData, "id");
  if (!id) return;
  await prisma.team.delete({ where: { id } });
  revalidatePath("/teams");
}

export async function addTeamMember(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const teamId = str(formData, "teamId");
  const personId = str(formData, "personId");
  if (!teamId || !personId) return;
  await prisma.teamMembership.upsert({
    where: { teamId_personId: { teamId, personId } },
    create: { teamId, personId },
    update: {},
  });
  revalidatePath("/teams");
}

export async function removeTeamMember(formData: FormData) {
  if (!(await getCurrentUser())) return;
  const teamId = str(formData, "teamId");
  const personId = str(formData, "personId");
  if (!teamId || !personId) return;
  await prisma.teamMembership.deleteMany({ where: { teamId, personId } });
  revalidatePath("/teams");
}

// ----------------------------------------------- Actions & Tasks (Plan/Execute)

export async function addAction(formData: FormData) {
  const gapId = str(formData, "gapId");
  const projectId = str(formData, "projectId");
  const title = str(formData, "title");
  if (!gapId || !projectId || !title) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.action.create({
    data: { gapId, title, description: str(formData, "description") || null },
  });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
}

export async function deleteAction(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  const gapId = str(formData, "gapId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.action.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
}

export async function addTask(formData: FormData) {
  const actionId = str(formData, "actionId");
  const projectId = str(formData, "projectId");
  const gapId = str(formData, "gapId");
  const title = str(formData, "title");
  if (!actionId || !title) return;
  if (!(await assertProjectEdit(projectId))) return;
  const dueDate = str(formData, "dueDate");
  await prisma.task.create({
    data: {
      actionId,
      title,
      assigneeId: str(formData, "assigneeId") || null,
      teamId: str(formData, "teamId") || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
  revalidatePath("/people");
}

export async function deleteTask(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  const gapId = str(formData, "gapId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.task.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
  revalidatePath("/people");
}

// Reassign an existing task to a person and/or team, with a due date.
export async function updateTaskAssignment(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  const gapId = str(formData, "gapId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  const dueDate = str(formData, "dueDate");
  await prisma.task.update({
    where: { id },
    data: {
      assigneeId: str(formData, "assigneeId") || null,
      teamId: str(formData, "teamId") || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
  revalidatePath("/people");
}

// ----------------------------------------------- Templates (Phase 4)

// Seed a project's capabilities from a domain template (skips existing names).
export async function applyTemplate(formData: FormData) {
  const projectId = str(formData, "projectId");
  const templateId = str(formData, "templateId");
  const template = getTemplate(templateId);
  if (!projectId || !template) return;
  if (!(await assertProjectEdit(projectId))) return;

  const existing = await prisma.capability.findMany({
    where: { projectId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

  const toCreate = template.capabilities.filter(
    (c) => !existingNames.has(c.name.toLowerCase())
  );
  if (toCreate.length > 0) {
    await prisma.capability.createMany({
      data: toCreate.map((c) => ({
        projectId,
        name: c.name,
        businessWeight: c.businessWeight,
      })),
    });
  }
  await recomputeGaps(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

// ------------------------------------------- AI-assisted gaps (Phase 4)

export type AiGapInput = {
  title: string;
  description: string;
  severity: string;
  capability: string;
};

// Persist the human-confirmed AI gaps. AI proposes, the user confirms here.
export async function saveAiGaps(projectId: string, gaps: AiGapInput[]) {
  if (!projectId || !Array.isArray(gaps) || gaps.length === 0) return;
  if (!(await assertProjectEdit(projectId))) return;
  const rows = gaps
    .filter((g) => g.title?.trim())
    .map((g) => {
      const severity = SEVERITIES.includes(g.severity as Severity)
        ? g.severity
        : "medium";
      return {
        projectId,
        source: "ai",
        capabilityId: null,
        suggestedCapability: g.capability?.trim() || null,
        title: g.title.trim(),
        description: g.description?.trim() || null,
        severity,
        impact: impactForSeverity(severity),
        effort: 3,
        status: "identified",
      };
    });
  if (rows.length > 0) {
    await prisma.gap.createMany({ data: rows });
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gaps`);
}

export async function deleteAiGap(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id) return;
  if (!(await assertProjectEdit(projectId))) return;
  await prisma.gap.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}/gaps`);
}

// Shared status control for Actions and Tasks (kind disambiguates the table).
export async function updateWorkStatus(
  kind: "action" | "task",
  id: string,
  projectId: string,
  gapId: string,
  status: string
) {
  if (!id || !isWorkStatus(status)) return;
  if (!(await assertProjectEdit(projectId))) return;
  if (kind === "action") {
    await prisma.action.update({ where: { id }, data: { status } });
  } else {
    await prisma.task.update({ where: { id }, data: { status } });
  }
  revalidatePath(`/projects/${projectId}/gaps/${gapId}`);
  revalidatePath("/people");
}
