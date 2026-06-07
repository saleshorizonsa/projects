import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRankedGaps } from "@/lib/gaps";
import { isClosedStatus } from "@/lib/constants";
import { requireProjectRole, requireUser } from "@/lib/access";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const LEVELS = [1, 2, 3, 4, 5];

// Quadrant tint: high impact + low effort = quick win (do first).
function cellTint(impact: number, effort: number): string {
  const highImpact = impact >= 4;
  const lowEffort = effort <= 2;
  if (highImpact && lowEffort) return "bg-emerald-500/10"; // quick wins
  if (highImpact && !lowEffort) return "bg-amber-500/10"; // major projects
  if (!highImpact && lowEffort) return "bg-sky-500/10"; // fill-ins
  return "bg-muted/40"; // low impact + high effort = thankless
}

export default async function MatrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  // Open gaps only — this view is about what to attack next.
  const gaps = (await getRankedGaps(id)).filter((g) => !isClosedStatus(g.status));

  // Bucket gaps by (impact, effort).
  const byCell = new Map<string, typeof gaps>();
  for (const g of gaps) {
    const key = `${g.impact}-${g.effort}`;
    const arr = byCell.get(key) ?? [];
    arr.push(g);
    byCell.set(key, arr);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}/gaps`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name} · Gaps
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Impact × effort matrix</h1>
        <p className="text-sm text-muted-foreground">
          Attack the top-left first: high impact, low effort. Set each gap’s
          impact and effort on its detail page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open gaps ({gaps.length})</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-emerald-500/40" />
              Quick wins
            </span>
            <span className="ml-3 inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-amber-500/40" />
              Major projects
            </span>
            <span className="ml-3 inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-sky-500/40" />
              Fill-ins
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open gaps to prioritize.
            </p>
          ) : (
            <div className="flex gap-2">
              {/* Y axis label */}
              <div className="flex items-center">
                <span className="-rotate-180 text-xs font-medium tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
                  Impact →
                </span>
              </div>
              <div className="flex-1">
                {/* Grid: rows = impact 5..1 (high at top), cols = effort 1..5 */}
                <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
                  {[...LEVELS].reverse().map((impact) => (
                    <div key={impact} className="contents">
                      <div className="flex w-6 items-center justify-center text-xs text-muted-foreground">
                        {impact}
                      </div>
                      {LEVELS.map((effort) => {
                        const cellGaps = byCell.get(`${impact}-${effort}`) ?? [];
                        return (
                          <div
                            key={effort}
                            className={`min-h-20 rounded-md border p-1 ${cellTint(
                              impact,
                              effort
                            )}`}
                          >
                            <div className="flex flex-col gap-1">
                              {cellGaps.map((g) => (
                                <Link
                                  key={g.id}
                                  href={`/projects/${id}/gaps/${g.id}`}
                                  title={`${g.capabilityName} — rank ${g.rank}`}
                                  className="truncate rounded bg-background/80 px-1.5 py-0.5 text-xs hover:bg-background"
                                >
                                  {g.capabilityName}
                                </Link>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* X axis ticks */}
                  <div />
                  {LEVELS.map((effort) => (
                    <div
                      key={effort}
                      className="text-center text-xs text-muted-foreground"
                    >
                      {effort}
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-center text-xs font-medium tracking-wide text-muted-foreground">
                  Effort →
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
