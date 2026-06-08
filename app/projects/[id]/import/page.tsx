import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, requireUser } from "@/lib/access";
import { importScores } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "edit");

  const project = await prisma.project.findUnique({
    where: { id },
    include: { capabilities: { orderBy: { name: "asc" } } },
  });
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
        <h1 className="mt-1 text-2xl font-semibold">Import metrics → scores</h1>
        <p className="text-sm text-muted-foreground">
          Paste a CSV of <code>Capability name, value</code>. Each value is mapped
          linearly from your metric range onto the 1–5 maturity scale and written
          as the current score on the latest assessment (matched by capability
          name). Gaps recompute automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV import</CardTitle>
          <CardDescription>
            One row per capability. A header row or unmatched names are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={importScores} className="flex flex-col gap-4">
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="csv">Rows (Capability, value)</Label>
              <Textarea
                id="csv"
                name="csv"
                required
                rows={8}
                className="font-mono text-sm"
                placeholder={"Lead capture, 42\nPipeline management, 78\nReporting, 15"}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-32 flex-col gap-1.5">
                <Label htmlFor="metricMin">Metric min → 1</Label>
                <Input id="metricMin" name="metricMin" type="number" step="any" required placeholder="0" />
              </div>
              <div className="flex w-32 flex-col gap-1.5">
                <Label htmlFor="metricMax">Metric max → 5</Label>
                <Input id="metricMax" name="metricMax" type="number" step="any" required placeholder="100" />
              </div>
              <SubmitButton pendingText="Importing…">
                Map &amp; import
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capability names to match</CardTitle>
          <CardDescription>
            The first column must match one of these (case-insensitive).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {project.capabilities.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 text-sm">
              {project.capabilities.map((c) => (
                <li key={c.id} className="rounded border px-2 py-0.5">
                  {c.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No capabilities yet — add some on the project page first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
