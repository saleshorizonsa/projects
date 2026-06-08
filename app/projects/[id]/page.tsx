import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEdit, getProjectRole, requireUser } from "@/lib/access";
import {
  getAssessmentSummaries,
  getOrCreateCurrentAssessment,
} from "@/lib/gaps";
import { getGoalsWithProgress, getRegressions } from "@/lib/phase2";
import {
  addCapability,
  addGoal,
  applyTemplate,
  deleteCapability,
  deleteGoal,
  linkGoalGap,
  saveScore,
  setBaselineAssessment,
  shareProjectWithTeam,
  shareProjectWithUser,
  takeAssessmentAction,
  unlinkGoalGap,
  unshareProjectTeam,
  unshareProjectUser,
} from "@/app/actions";
import {
  CLOSED_GAP_STATUSES,
  CONFIDENCE_LEVELS,
  isPast,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  nextDueDate,
  SCORE_MAX,
  SCORE_MIN,
} from "@/lib/constants";
import { TEMPLATES } from "@/lib/templates";
import { NativeSelect } from "@/components/ui/native-select";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireUser();
  const role = await getProjectRole(id, user);
  if (!role) notFound();
  const editable = canEdit(role);
  const isOwner = role === "owner";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      goals: { orderBy: { status: "asc" } },
      capabilities: { orderBy: { name: "asc" } },
    },
  });
  if (!project) notFound();

  // Pull the latest assessment's scores into a lookup for the scoring table.
  const assessment = await getOrCreateCurrentAssessment(id);
  const scores = await prisma.capabilityScore.findMany({
    where: { assessmentId: assessment.id },
  });
  const scoreByCapability = new Map(scores.map((s) => [s.capabilityId, s]));

  const assessments = await getAssessmentSummaries(id);
  const achievements = await prisma.achievement.findMany({
    where: { projectId: id },
    orderBy: { achievedAt: "desc" },
  });
  const goals = await getGoalsWithProgress(id);
  const regressions = await getRegressions(id);
  // All gaps for this project (for linking to goals).
  const projectGaps = await prisma.gap.findMany({
    where: { projectId: id },
    select: { id: true, title: true, status: true },
    orderBy: { title: "asc" },
  });

  // "Next assessment due" from review cadence + the latest assessment.
  const lastTakenAt = assessments[0]?.takenAt ?? null;
  const dueDate =
    project.reviewCadence && lastTakenAt
      ? nextDueDate(lastTakenAt, project.reviewCadence)
      : null;
  const overdue = isPast(dueDate);

  const openGapCount = await prisma.gap.count({
    where: { projectId: id, status: { notIn: CLOSED_GAP_STATUSES } },
  });

  // Sharing data (owner only).
  const [members, teamShares, allTeams] = isOwner
    ? await Promise.all([
        prisma.projectMember.findMany({
          where: { projectId: id },
          include: { user: { select: { email: true, name: true } } },
        }),
        prisma.projectTeamShare.findMany({
          where: { projectId: id },
          include: { team: { select: { name: true } } },
        }),
        prisma.team.findMany({ orderBy: { name: "asc" } }),
      ])
    : [[], [], []];
  const sharedTeamIds = new Set(teamShares.map((s) => s.teamId));

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/projects"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Projects
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <Badge variant="outline">{project.status}</Badge>
            <Badge variant="secondary">{role}</Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <EditProjectDialog project={project} />}
          <Button variant="outline" render={<a href={`/api/projects/${id}/export?format=csv`} />}>
            Export CSV
          </Button>
          <Button variant="outline" render={<a href={`/api/projects/${id}/export?format=json`} />}>
            Export JSON
          </Button>
          {editable && (
            <Button variant="outline" render={<Link href={`/projects/${id}/detect`} />}>
              Detect gaps (AI)
            </Button>
          )}
          <Button render={<Link href={`/projects/${id}/gaps`} />}>
            View gaps ({openGapCount})
          </Button>
        </div>
      </div>

      {/* Sharing (owner only) */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Sharing</CardTitle>
            <CardDescription>
              Give other users or whole teams access. Editors can change the
              project; viewers can only read.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(members.length > 0 || teamShares.length > 0) && (
              <ul className="flex flex-col gap-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      {m.user.email}{" "}
                      <Badge variant="secondary">{m.role}</Badge>
                    </span>
                    <form action={unshareProjectUser}>
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <SubmitButton variant="ghost" size="xs">
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
                {teamShares.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      Team: {s.team.name}{" "}
                      <Badge variant="secondary">{s.role}</Badge>
                    </span>
                    <form action={unshareProjectTeam}>
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="teamId" value={s.teamId} />
                      <SubmitButton variant="ghost" size="xs">
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form
              action={shareProjectWithUser}
              className="flex flex-wrap items-end gap-2 border-t pt-4"
            >
              <input type="hidden" name="projectId" value={id} />
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="share-email">Share with user (email)</Label>
                <Input
                  id="share-email"
                  name="email"
                  type="email"
                  placeholder="user@acme.com"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="share-role">Role</Label>
                <NativeSelect id="share-role" name="role" defaultValue="viewer">
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                </NativeSelect>
              </div>
              <SubmitButton variant="outline">Share</SubmitButton>
            </form>

            {allTeams.filter((t) => !sharedTeamIds.has(t.id)).length > 0 && (
              <form
                action={shareProjectWithTeam}
                className="flex flex-wrap items-end gap-2 border-t pt-4"
              >
                <input type="hidden" name="projectId" value={id} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="share-team">Share with team</Label>
                  <NativeSelect id="share-team" name="teamId" defaultValue="" required>
                    <option value="" disabled>
                      Choose a team…
                    </option>
                    {allTeams
                      .filter((t) => !sharedTeamIds.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="share-team-role">Role</Label>
                  <NativeSelect
                    id="share-team-role"
                    name="role"
                    defaultValue="viewer"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </NativeSelect>
                </div>
                <SubmitButton variant="outline">Share</SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Goals — Define (measurable; progress computed from linked gaps) */}
      <Card>
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardDescription>
            Define · measurable targets. Progress is computed from the linked gaps
            (% verified) — never set by hand. Link the gaps that fulfil each goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {goals.length > 0 && (
            <ul className="flex flex-col gap-3">
              {goals.map((goal) => {
                const unlinked = projectGaps.filter(
                  (pg) => !goal.linkedGaps.some((lg) => lg.id === pg.id)
                );
                return (
                  <li
                    key={goal.id}
                    className="flex flex-col gap-2 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{goal.title}</span>
                        {goal.metricType === "value" &&
                          goal.metricTargetValue != null && (
                            <Badge variant="outline">
                              target {goal.metricTargetValue}
                              {goal.metricUnit ? ` ${goal.metricUnit}` : ""}
                            </Badge>
                          )}
                        {goal.metricType === "capability_scores" && (
                          <Badge variant="outline">capability scores</Badge>
                        )}
                        {goal.targetDate && (
                          <span className="text-xs text-muted-foreground">
                            by {goal.targetDate.toISOString().slice(0, 10)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            goal.progress === 100 && goal.total > 0
                              ? "default"
                              : "secondary"
                          }
                        >
                          {goal.progress}% · {goal.verified}/{goal.total} verified
                        </Badge>
                        <form action={deleteGoal}>
                          <input type="hidden" name="id" value={goal.id} />
                          <input type="hidden" name="projectId" value={id} />
                          <SubmitButton variant="ghost" size="xs">
                            Remove
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                      <div
                        className="h-1.5 rounded bg-primary"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                    {goal.linkedGaps.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {goal.linkedGaps.map((lg) => (
                          <li
                            key={lg.id}
                            className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
                          >
                            <span>
                              {lg.status === "verified" ? "✓" : "○"} {lg.title}
                            </span>
                            <form action={unlinkGoalGap}>
                              <input type="hidden" name="projectId" value={id} />
                              <input type="hidden" name="goalId" value={goal.id} />
                              <input type="hidden" name="gapId" value={lg.id} />
                              <button
                                type="submit"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                ✕
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    {unlinked.length > 0 && (
                      <form action={linkGoalGap} className="flex items-end gap-2">
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="goalId" value={goal.id} />
                        <NativeSelect
                          name="gapId"
                          defaultValue=""
                          required
                          className="max-w-xs"
                        >
                          <option value="" disabled>
                            Link a gap…
                          </option>
                          {unlinked.map((pg) => (
                            <option key={pg.id} value={pg.id}>
                              {pg.title}
                            </option>
                          ))}
                        </NativeSelect>
                        <SubmitButton variant="outline" size="sm">
                          Link
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <form
            action={addGoal}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="goal-title">New goal</Label>
              <Input
                id="goal-title"
                name="title"
                required
                placeholder="e.g. Single source of truth for leads"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-metric">Metric</Label>
              <NativeSelect id="goal-metric" name="metricType" defaultValue="none">
                {METRIC_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_TYPE_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="goal-target-value">Target</Label>
              <Input
                id="goal-target-value"
                name="metricTargetValue"
                type="number"
                step="any"
                placeholder="90"
              />
            </div>
            <div className="flex w-20 flex-col gap-1.5">
              <Label htmlFor="goal-unit">Unit</Label>
              <Input id="goal-unit" name="metricUnit" placeholder="%" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Target date</Label>
              <Input id="goal-date" name="targetDate" type="date" />
            </div>
            <SubmitButton variant="outline">Add goal</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Regressions — Phase 2 time-aware checks */}
      {(regressions.dropped.length > 0 || regressions.reopened.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>⚠ Regressions</CardTitle>
            <CardDescription>
              Things that moved backwards since an earlier assessment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {regressions.dropped.length > 0 && (
              <div>
                <div className="font-medium">Capability scores that dropped</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {regressions.dropped.map((d) => (
                    <li key={d.name} className="text-muted-foreground">
                      {d.name}:{" "}
                      <span className="text-destructive">
                        {d.from} → {d.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {regressions.reopened.length > 0 && (
              <div>
                <div className="font-medium">Verified gaps that reopened</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {regressions.reopened.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/projects/${id}/gaps/${r.id}`}
                        className="text-destructive hover:underline"
                      >
                        {r.title}
                      </Link>{" "}
                      <span className="text-muted-foreground">({r.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assessments — Feedback (dated snapshots) */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Assessments</CardTitle>
              <CardDescription>
                Feedback · dated snapshots of current state. Scoring below edits
                the latest one; take a new assessment to record progress.
              </CardDescription>
            </div>
            {dueDate && (
              <Badge variant={overdue ? "destructive" : "secondary"}>
                {overdue ? "Assessment overdue" : "Next due"}:{" "}
                {dueDate.toISOString().slice(0, 10)}
                {project.reviewCadence ? ` (${project.reviewCadence})` : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {assessments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {a.takenAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  {a.isLatest && <Badge>latest</Badge>}
                  {a.isBaseline && <Badge variant="outline">baseline</Badge>}
                  {a.narrative && (
                    <span className="text-muted-foreground">— {a.narrative}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {a.open} open · {a.closed} met
                  </span>
                  {!a.isBaseline && (
                    <form action={setBaselineAssessment}>
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="assessmentId" value={a.id} />
                      <SubmitButton variant="ghost" size="xs">
                        Set baseline
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <form
            action={takeAssessmentAction}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="assessment-narrative">
                New assessment — current-state narrative
              </Label>
              <Input
                id="assessment-narrative"
                name="narrative"
                placeholder="e.g. After Q2 improvements: pipeline tooling live, reporting still manual"
              />
            </div>
            <SubmitButton variant="outline" pendingText="Snapshotting…">
              Take new assessment
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Capabilities & scoring — Assess */}
      <Card>
        <CardHeader>
          <CardTitle>Capabilities &amp; scoring</CardTitle>
          <CardDescription>
            Assess · score current vs target maturity ({SCORE_MIN}–{SCORE_MAX})
            on the latest assessment (
            {assessment.takenAt.toISOString().slice(0, 10)}). Gaps are computed
            from these scores — you never type them by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {project.capabilities.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Capability</TableHead>
                  <TableHead className="w-24">Weight</TableHead>
                  <TableHead className="w-28">Current</TableHead>
                  <TableHead className="w-28">Target</TableHead>
                  <TableHead className="w-20">Gap</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.capabilities.map((cap) => {
                  const score = scoreByCapability.get(cap.id);
                  const current = score?.currentScore ?? "";
                  const target = score?.targetScore ?? "";
                  const gapSize =
                    score && score.targetScore > score.currentScore
                      ? score.targetScore - score.currentScore
                      : 0;
                  return (
                    <TableRow key={cap.id}>
                      <TableCell className="font-medium">{cap.name}</TableCell>
                      <TableCell>{cap.businessWeight}</TableCell>
                      <TableCell colSpan={3}>
                        <form
                          action={saveScore}
                          className="flex flex-wrap items-center gap-2"
                          id={`score-${cap.id}`}
                        >
                          <input type="hidden" name="projectId" value={id} />
                          <input
                            type="hidden"
                            name="capabilityId"
                            value={cap.id}
                          />
                          <Input
                            name="currentScore"
                            type="number"
                            min={SCORE_MIN}
                            max={SCORE_MAX}
                            defaultValue={current}
                            placeholder="cur"
                            className="w-16"
                            aria-label="Current score"
                          />
                          <Input
                            name="targetScore"
                            type="number"
                            min={SCORE_MIN}
                            max={SCORE_MAX}
                            defaultValue={target}
                            placeholder="tgt"
                            className="w-16"
                            aria-label="Target score"
                          />
                          <span className="w-10 text-center">
                            {gapSize > 0 ? (
                              <Badge variant="destructive">+{gapSize}</Badge>
                            ) : score ? (
                              <Badge variant="secondary">0</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                          <NativeSelect
                            name="confidence"
                            defaultValue={score?.confidence ?? "medium"}
                            aria-label="Confidence"
                            className="w-24"
                          >
                            {CONFIDENCE_LEVELS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </NativeSelect>
                          <Input
                            name="evidence"
                            defaultValue={score?.evidence ?? ""}
                            placeholder="evidence / link"
                            className="w-44"
                            aria-label="Evidence"
                          />
                          <SubmitButton size="sm" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={deleteCapability}>
                          <input type="hidden" name="id" value={cap.id} />
                          <input type="hidden" name="projectId" value={id} />
                          <SubmitButton variant="ghost" size="xs">
                            Remove
                          </SubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No capabilities yet. Add the dimensions you want to assess this
              project against.
            </p>
          )}

          <form
            action={applyTemplate}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template">Seed from template</Label>
              <NativeSelect id="template" name="templateId" defaultValue="" required>
                <option value="" disabled>
                  Choose a domain…
                </option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.capabilities.length})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <SubmitButton variant="outline">Apply template</SubmitButton>
          </form>

          <form
            action={addCapability}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cap-name">New capability</Label>
              <Input
                id="cap-name"
                name="name"
                required
                placeholder="e.g. Pipeline management"
              />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="cap-weight">Weight (1–5)</Label>
              <Input
                id="cap-weight"
                name="businessWeight"
                type="number"
                min={SCORE_MIN}
                max={SCORE_MAX}
                defaultValue={3}
              />
            </div>
            <SubmitButton variant="outline">Add capability</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Achievements — auto-logged when a gap is verified */}
      <Card>
        <CardHeader>
          <CardTitle>Achievements</CardTitle>
          <CardDescription>
            Auto-logged when a gap reaches “verified” — the record that the loop
            is working. Not a manual entry screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {achievements.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {achievements.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    🏆 {a.title}
                    {a.fromScore != null && a.toScore != null && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {a.fromScore} → {a.toScore}
                        {a.targetScore != null ? ` (target ${a.targetScore})` : ""}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {a.achievedAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No achievements yet. Verify a resolved gap on the gaps page to log
              one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
