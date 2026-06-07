import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccessibleProjectIds, requireUser } from "@/lib/access";
import { NewProjectDialog } from "@/components/new-project-dialog";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const accessible = await getAccessibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: accessible === "all" ? undefined : { id: { in: accessible } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { capabilities: true, gaps: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Define where you want to be, assess where you are, let GapFlow surface the gaps.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Create your first project to start the gap-analysis loop.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/20">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{project.name}</CardTitle>
                    <Badge variant="outline">{project.status}</Badge>
                  </div>
                  {project.description && (
                    <CardDescription>{project.description}</CardDescription>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {project._count.capabilities} capabilities ·{" "}
                    {project._count.gaps} open gaps
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
