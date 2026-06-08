import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, requireUser } from "@/lib/access";
import { getOrCreateCurrentAssessment } from "@/lib/gaps";
import { getMultiRater } from "@/lib/phase4";
import { addRating, adoptAverageRating, deleteRating } from "@/app/actions";
import { SCORE_MAX, SCORE_MIN } from "@/lib/constants";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function RatingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const assessment = await getOrCreateCurrentAssessment(id);
  const [caps, people] = await Promise.all([
    getMultiRater(id, assessment.id),
    prisma.person.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Multi-rater scoring</h1>
        <p className="text-sm text-muted-foreground">
          Several people can score the same capability on the current assessment.
          A spread of 2+ flags disagreement; adopt the average as the consensus
          that drives gaps.
        </p>
      </div>

      {people.length === 0 && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Add people first on the{" "}
            <Link href="/people" className="underline">
              People
            </Link>{" "}
            page — they are the raters.
          </CardContent>
        </Card>
      )}

      {caps.length === 0 ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            No capabilities yet. Add them on the project page.
          </CardContent>
        </Card>
      ) : (
        caps.map((c) => (
          <Card key={c.capabilityId}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{c.capabilityName}</CardTitle>
                  {c.spread >= 2 && (
                    <Badge variant="destructive">
                      disagreement (spread {c.spread})
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    consensus:{" "}
                    {c.canonicalCurrent != null
                      ? `${c.canonicalCurrent} → ${c.canonicalTarget}`
                      : "—"}
                  </span>
                  {c.avgCurrent != null && (
                    <span>· avg current {c.avgCurrent.toFixed(1)}</span>
                  )}
                  {c.ratings.length > 0 && (
                    <form action={adoptAverageRating}>
                      <input type="hidden" name="projectId" value={id} />
                      <input
                        type="hidden"
                        name="capabilityId"
                        value={c.capabilityId}
                      />
                      <SubmitButton variant="outline" size="xs">
                        Adopt average
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {c.ratings.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {c.ratings.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      <span>
                        <span className="font-medium">{r.raterName}</span>:{" "}
                        {r.currentScore} → {r.targetScore}
                        {r.note && (
                          <span className="text-muted-foreground"> · {r.note}</span>
                        )}
                      </span>
                      <form action={deleteRating}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="projectId" value={id} />
                        <SubmitButton variant="ghost" size="xs">
                          ✕
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No ratings yet.</p>
              )}

              {people.length > 0 && (
                <form
                  action={addRating}
                  className="flex flex-wrap items-end gap-2 border-t pt-3"
                >
                  <input type="hidden" name="projectId" value={id} />
                  <input
                    type="hidden"
                    name="capabilityId"
                    value={c.capabilityId}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Rater</label>
                    <NativeSelect name="raterId" defaultValue="" required>
                      <option value="" disabled>
                        Choose…
                      </option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex w-16 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Cur</label>
                    <Input
                      name="currentScore"
                      type="number"
                      min={SCORE_MIN}
                      max={SCORE_MAX}
                      required
                    />
                  </div>
                  <div className="flex w-16 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Tgt</label>
                    <Input
                      name="targetScore"
                      type="number"
                      min={SCORE_MIN}
                      max={SCORE_MAX}
                      required
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Note</label>
                    <Input name="note" placeholder="optional" />
                  </div>
                  <SubmitButton variant="outline" size="sm">
                    Add / update rating
                  </SubmitButton>
                </form>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
