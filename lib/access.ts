import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  role: string;
  email?: string | null;
  name?: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Team ids the user belongs to (via their linked directory Person).
export async function getUserTeamIds(userId: string): Promise<string[]> {
  const person = await prisma.person.findUnique({
    where: { userId },
    include: { memberships: { select: { teamId: true } } },
  });
  return person ? person.memberships.map((m) => m.teamId) : [];
}

export type ProjectRole = "owner" | "editor" | "viewer";

export function canEdit(role: ProjectRole | null): boolean {
  return role === "owner" || role === "editor";
}

// Effective role on a project (owner > editor > viewer), or null if no access.
export async function getProjectRole(
  projectId: string,
  user: SessionUser
): Promise<ProjectRole | null> {
  if (user.role === "admin") return "owner";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: { where: { userId: user.id }, select: { role: true } },
    },
  });
  if (!project) return null;
  if (project.ownerId === user.id) return "owner";

  let role: ProjectRole | null = null;
  const member = project.members[0];
  if (member) role = member.role === "editor" ? "editor" : "viewer";

  const teamIds = await getUserTeamIds(user.id);
  if (teamIds.length > 0) {
    const shares = await prisma.projectTeamShare.findMany({
      where: { projectId, teamId: { in: teamIds } },
      select: { role: true },
    });
    for (const s of shares) {
      const r: ProjectRole = s.role === "editor" ? "editor" : "viewer";
      if (role === null) role = r;
      else if (r === "editor") role = "editor";
    }
  }
  return role;
}

// For pages: resolve the role or 404 (also 404 on insufficient role for edit).
export async function requireProjectRole(
  projectId: string,
  user: SessionUser,
  need: "view" | "edit"
): Promise<ProjectRole> {
  const role = await getProjectRole(projectId, user);
  if (!role) notFound();
  if (need === "edit" && !canEdit(role)) notFound();
  return role;
}

// For mutations: returns the user only if they can edit the project, else null.
export async function assertProjectEdit(
  projectId: string
): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getProjectRole(projectId, user);
  return canEdit(role) ? user : null;
}

// For owner-only mutations (delete, sharing): returns the user or null.
export async function assertProjectOwner(
  projectId: string
): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getProjectRole(projectId, user);
  return role === "owner" ? user : null;
}

// Project ids the user can see ("all" for admin).
export async function getAccessibleProjectIds(
  user: SessionUser
): Promise<string[] | "all"> {
  if (user.role === "admin") return "all";
  const teamIds = await getUserTeamIds(user.id);
  const or: Array<Record<string, unknown>> = [
    { ownerId: user.id },
    { members: { some: { userId: user.id } } },
  ];
  if (teamIds.length > 0) {
    or.push({ teamShares: { some: { teamId: { in: teamIds } } } });
  }
  const projects = await prisma.project.findMany({
    where: { OR: or },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}
