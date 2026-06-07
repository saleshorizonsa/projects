import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, requireUser } from "@/lib/access";
import { AiGapDetector } from "@/components/ai-gap-detector";

export const dynamic = "force-dynamic";

export default async function DetectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "edit");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">AI gap detection</h1>
        <p className="text-sm text-muted-foreground">
          Describe the target and current state in free text. Claude proposes a
          structured list of gaps; you review and confirm before saving. The
          deterministic capability scores remain the source of truth.
        </p>
      </div>

      <AiGapDetector projectId={id} />
    </div>
  );
}
