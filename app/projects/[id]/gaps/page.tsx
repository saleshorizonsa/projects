import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getAiGaps,
  getBurndownData,
  getRankedGaps,
  type RankedGap,
} from "@/lib/gaps";
import { deleteAiGap, recomputeGapsAction } from "@/app/actions";
import { isClosedStatus } from "@/lib/constants";
import { requireProjectRole, requireUser } from "@/lib/access";
import { BurndownChart } from "@/components/burndown-chart";
import { GapStatusSelect } from "@/components/gap-status-select";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const severityVariant: Record<string, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function GapRow({
  gap,
  index,
  projectId,
  closed,
}: {
  gap: RankedGap;
  index: number;
  projectId: string;
  closed: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/projects/${projectId}/gaps/${gap.id}`}
          className="hover:underline"
        >
          {gap.capabilityName}
        </Link>
      </TableCell>
      <TableCell>{gap.currentScore}</TableCell>
      <TableCell>{gap.targetScore}</TableCell>
      <TableCell>
        {gap.gapSize > 0 ? (
          <Badge variant="destructive">+{gap.gapSize}</Badge>
        ) : (
          <Badge variant="secondary">met</Badge>
        )}
      </TableCell>
      <TableCell>{gap.businessWeight}</TableCell>
      <TableCell className="font-semibold">{gap.rank}</TableCell>
      <TableCell>
        <Badge variant={severityVariant[gap.severity] ?? "default"}>
          {gap.severity}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <GapStatusSelect
            gapId={gap.id}
            projectId={projectId}
            status={gap.status}
          />
          {closed && gap.achievedAt && <span title="Achievement logged">🏆</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function GapTableHead() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-12">#</TableHead>
        <TableHead>Capability</TableHead>
        <TableHead className="w-24">Current</TableHead>
        <TableHead className="w-24">Target</TableHead>
        <TableHead className="w-20">Gap</TableHead>
        <TableHead className="w-20">Weight</TableHead>
        <TableHead className="w-20">Rank</TableHead>
        <TableHead className="w-24">Severity</TableHead>
        <TableHead className="w-52">Status</TableHead>
      </TableRow>
    </TableHeader>
  );
}

export default async function GapsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  // getRankedGaps recomputes from the latest scores before reading.
  const gaps = await getRankedGaps(id);
  const burndown = await getBurndownData(id);
  const aiGaps = await getAiGaps(id);

  const openGaps = gaps.filter((g) => !isClosedStatus(g.status));
  const closedGaps = gaps.filter((g) => isClosedStatus(g.status));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/projects/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← {project.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Gaps</h1>
          <p className="text-sm text-muted-foreground">
            Auto-computed from capability scores, ranked by gap size × business
            weight. Highest-priority gaps first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" render={<Link href={`/projects/${id}/matrix`} />}>
            Impact × effort
          </Button>
          <form action={recomputeGapsAction.bind(null, id)}>
            <SubmitButton variant="outline" pendingText="Recomputing…">
              Recompute
            </SubmitButton>
          </form>
        </div>
      </div>

      {/* Burndown — open vs closed gaps over the dated assessments */}
      <Card>
        <CardHeader>
          <CardTitle>Gap burndown</CardTitle>
          <CardDescription>
            Open gaps vs targets-met across each dated assessment. Take a new
            assessment on the project page to add points over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {burndown.length >= 2 ? (
            <BurndownChart data={burndown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only one assessment so far. Take another assessment (after updating
              scores) to chart the burndown.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Open gaps */}
      <Card>
        <CardHeader>
          <CardTitle>Open gaps ({openGaps.length})</CardTitle>
          <CardDescription>
            Work these down. Re-assess to confirm they shrank, then verify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openGaps.length > 0 ? (
            <Table>
              <GapTableHead />
              <TableBody>
                {openGaps.map((gap, index) => (
                  <GapRow
                    key={gap.id}
                    gap={gap}
                    index={index}
                    projectId={id}
                    closed={false}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No open gaps. Either nothing is below target, or every gap has been
              resolved/verified.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Closed gaps (resolved / verified) */}
      {closedGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed gaps ({closedGaps.length})</CardTitle>
            <CardDescription>
              Resolved by re-measurement; “verified” gaps auto-log an
              achievement (🏆).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <GapTableHead />
              <TableBody>
                {closedGaps.map((gap, index) => (
                  <GapRow
                    key={gap.id}
                    gap={gap}
                    index={index}
                    projectId={id}
                    closed
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI-detected gaps — proposed by Claude, confirmed by a human */}
      {aiGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI-detected gaps ({aiGaps.length})</CardTitle>
            <CardDescription>
              Proposed by Claude from free-text state and confirmed by you. The
              deterministic score-based gaps above remain the source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gap</TableHead>
                  <TableHead className="w-40">Capability</TableHead>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-52">Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiGaps.map((gap) => (
                  <TableRow key={gap.id}>
                    <TableCell className="font-medium">
                      {gap.title}
                      {gap.description && (
                        <div className="text-xs text-muted-foreground">
                          {gap.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {gap.suggestedCapability ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant[gap.severity] ?? "default"}>
                        {gap.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <GapStatusSelect
                        gapId={gap.id}
                        projectId={id}
                        status={gap.status}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deleteAiGap}>
                        <input type="hidden" name="id" value={gap.id} />
                        <input type="hidden" name="projectId" value={id} />
                        <SubmitButton variant="ghost" size="xs">
                          ✕
                        </SubmitButton>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Score-based gaps cannot be created or edited by hand — they are derived
        from the scores. A gap is only truly closed once a new assessment
        confirms it shrank and you verify it.
      </p>
    </div>
  );
}
