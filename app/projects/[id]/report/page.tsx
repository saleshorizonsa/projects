import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, requireUser } from "@/lib/access";
import { getQuarterlyReport } from "@/lib/phase4";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const quarters = await getQuarterlyReport(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Quarterly report</h1>
        <p className="text-sm text-muted-foreground">
          Achievements (gaps closed, with before → after scores) and acquirements
          (resources gained, with spend), rolled up by quarter — the case that the
          loop worked and the investment paid off.
        </p>
      </div>

      {quarters.length === 0 ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Nothing to report yet. Verify a gap to log an achievement, or set a
            requirement to “acquired” to log an acquirement.
          </CardContent>
        </Card>
      ) : (
        quarters.map((q) => (
          <Card key={q.quarter}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{q.quarter}</CardTitle>
                <CardDescription>
                  {q.achievements.length} achievement
                  {q.achievements.length === 1 ? "" : "s"} ·{" "}
                  {q.acquirements.length} acquired · ${fmt(q.spend)} spend
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-medium">🏆 Achievements</div>
                {q.achievements.length > 0 ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {q.achievements.map((a, i) => (
                      <li key={i} className="rounded-md border px-3 py-1.5">
                        {a.title}
                        {a.fromScore != null && a.toScore != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {a.fromScore} → {a.toScore}
                            {a.targetScore != null
                              ? ` (target ${a.targetScore})`
                              : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None.</p>
                )}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">🎁 Acquirements</div>
                {q.acquirements.length > 0 ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {q.acquirements.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"
                      >
                        <span>{a.title}</span>
                        <span className="text-muted-foreground">
                          {a.cost != null ? `$${fmt(a.cost)}` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
