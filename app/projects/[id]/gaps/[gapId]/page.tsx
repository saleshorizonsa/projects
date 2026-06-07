import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentAssessment } from "@/lib/gaps";
import {
  addAction,
  addRequirement,
  addTask,
  deleteAction,
  deleteRequirement,
  deleteTask,
  updateGapPriority,
} from "@/app/actions";
import {
  COST_CADENCE_LABELS,
  COST_CADENCES,
  REQUIREMENT_TYPES,
  SCORE_MAX,
  SCORE_MIN,
  type CostCadence,
} from "@/lib/constants";
import { requireProjectRole, requireUser } from "@/lib/access";
import { GapStatusSelect } from "@/components/gap-status-select";
import { RequirementStatusSelect } from "@/components/requirement-status-select";
import { WorkStatusSelect } from "@/components/work-status-select";
import { SubmitButton } from "@/components/submit-button";
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
import { NativeSelect } from "@/components/ui/native-select";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default async function GapDetailPage({
  params,
}: {
  params: Promise<{ id: string; gapId: string }>;
}) {
  const { id, gapId } = await params;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");

  const gap = await prisma.gap.findUnique({
    where: { id: gapId },
    include: {
      capability: true,
      actions: {
        orderBy: { title: "asc" },
        include: {
          tasks: {
            orderBy: [{ dueDate: "asc" }],
            include: { assignee: true, team: true },
          },
        },
      },
      requirements: {
        orderBy: { createdAt: "asc" },
        include: { action: { select: { title: true } } },
      },
    },
  });
  if (!gap || gap.projectId !== id) notFound();

  // Cost roll-up across this gap's requirements (excluding rejected).
  const costByCadence = { one_time: 0, monthly: 0, annual: 0 } as Record<
    CostCadence,
    number
  >;
  for (const r of gap.requirements) {
    if (r.status === "rejected" || r.cost == null) continue;
    const cad = (r.costCadence as CostCadence) ?? "one_time";
    if (cad in costByCadence) costByCadence[cad] += r.cost;
  }
  const fmtCost = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const [people, teams, assessment, audits] = await Promise.all([
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    getOrCreateCurrentAssessment(id),
    prisma.gapAudit.findMany({
      where: { gapId },
      orderBy: { changedAt: "desc" },
    }),
  ]);

  const score = gap.capabilityId
    ? await prisma.capabilityScore.findUnique({
        where: {
          assessmentId_capabilityId: {
            assessmentId: assessment.id,
            capabilityId: gap.capabilityId,
          },
        },
      })
    : null;
  const current = score?.currentScore ?? 0;
  const target = score?.targetScore ?? 0;
  const gapSize = Math.max(target - current, 0);
  const weight = gap.capability?.businessWeight ?? 1;

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}/gaps`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Gaps
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{gap.title}</h1>
        {gap.description && (
          <p className="mt-1 text-sm text-muted-foreground">{gap.description}</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Move the gap through its lifecycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <GapStatusSelect gapId={gap.id} projectId={id} status={gap.status} />
          </CardContent>
        </Card>

        {/* Prioritization — user-owned impact & effort drive the matrix */}
        <Card>
          <CardHeader>
            <CardTitle>Prioritization</CardTitle>
            <CardDescription>
              Impact × effort (1–5).{" "}
              <Link href={`/projects/${id}/matrix`} className="underline">
                See the matrix
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateGapPriority} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="gapId" value={gap.id} />
              <input type="hidden" name="projectId" value={id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="impact">Impact</Label>
                <Input
                  id="impact"
                  name="impact"
                  type="number"
                  min={SCORE_MIN}
                  max={SCORE_MAX}
                  defaultValue={gap.impact}
                  className="w-20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="effort">Effort</Label>
                <Input
                  id="effort"
                  name="effort"
                  type="number"
                  min={SCORE_MIN}
                  max={SCORE_MAX}
                  defaultValue={gap.effort}
                  className="w-20"
                />
              </div>
              <SubmitButton size="sm">Save</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Computed signal (read-only, derived from the latest assessment) */}
      <Card>
        <CardHeader>
          <CardTitle>Computed signal</CardTitle>
          <CardDescription>
            Derived from the current assessment — not editable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Capability">{gap.capability?.name ?? "(unknown)"}</Field>
          <Field label="Current">{current}/5</Field>
          <Field label="Target">{target}/5</Field>
          <Field label="Gap size">
            {gapSize > 0 ? (
              <Badge variant="destructive">+{gapSize}</Badge>
            ) : (
              <Badge variant="secondary">met</Badge>
            )}
          </Field>
          <Field label="Business weight">{weight}</Field>
          <Field label="Rank (gap × weight)">
            <span className="font-semibold">{gapSize * weight}</span>
          </Field>
          <Field label="Severity">
            <Badge>{gap.severity}</Badge>
          </Field>
        </CardContent>
      </Card>

      {/* Plan & Execute — Actions under the gap, Tasks under each action */}
      <Card>
        <CardHeader>
          <CardTitle>Plan &amp; execute</CardTitle>
          <CardDescription>
            Actions that will close this gap, broken into assignable tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {gap.actions.map((action) => (
            <div key={action.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{action.title}</div>
                <div className="flex items-center gap-2">
                  <WorkStatusSelect
                    kind="action"
                    id={action.id}
                    projectId={id}
                    gapId={gap.id}
                    status={action.status}
                  />
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="gapId" value={gap.id} />
                    <SubmitButton variant="ghost" size="xs">
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </div>
              {action.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {action.description}
                </p>
              )}

              {/* Tasks */}
              <ul className="mt-3 flex flex-col gap-2">
                {action.tasks.map((task) => {
                  const overdue =
                    task.dueDate !== null &&
                    task.status !== "done" &&
                    task.dueDate < now;
                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-1 flex-col">
                        <span className="font-medium">{task.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {task.assignee ? (
                            <Link
                              href={`/people/${task.assignee.id}`}
                              className="hover:underline"
                            >
                              {task.assignee.name}
                            </Link>
                          ) : (
                            "Unassigned"
                          )}
                          {task.team && <> · {task.team.name}</>}
                          {task.dueDate && (
                            <>
                              {" · due "}
                              <span
                                className={overdue ? "font-medium text-destructive" : ""}
                              >
                                {task.dueDate.toISOString().slice(0, 10)}
                                {overdue && " ⚠"}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <WorkStatusSelect
                          kind="task"
                          id={task.id}
                          projectId={id}
                          gapId={gap.id}
                          status={task.status}
                        />
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="projectId" value={id} />
                          <input type="hidden" name="gapId" value={gap.id} />
                          <SubmitButton variant="ghost" size="xs">
                            ✕
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Add task to this action */}
              <form
                action={addTask}
                className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3"
              >
                <input type="hidden" name="actionId" value={action.id} />
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="gapId" value={gap.id} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`task-${action.id}`}>New task</Label>
                  <Input
                    id={`task-${action.id}`}
                    name="title"
                    required
                    placeholder="e.g. Configure lead web form"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Assignee</Label>
                  <NativeSelect name="assigneeId" defaultValue="">
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Team</Label>
                  <NativeSelect name="teamId" defaultValue="">
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`due-${action.id}`}>Due</Label>
                  <Input id={`due-${action.id}`} name="dueDate" type="date" />
                </div>
                <SubmitButton size="sm" variant="outline">
                  Add task
                </SubmitButton>
              </form>
            </div>
          ))}

          {gap.actions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No actions yet. Add the first initiative to close this gap.
            </p>
          )}

          {/* Add action */}
          <form
            action={addAction}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <input type="hidden" name="gapId" value={gap.id} />
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="action-title">New action</Label>
              <Input
                id="action-title"
                name="title"
                required
                placeholder="e.g. Implement lead-capture web forms"
              />
            </div>
            <div className="flex flex-[2] flex-col gap-1.5">
              <Label htmlFor="action-desc">Description</Label>
              <Input id="action-desc" name="description" placeholder="Optional" />
            </div>
            <SubmitButton variant="outline">Add action</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Requirements — Input (resources/procurement needed to close the gap) */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>
            Inputs needed to close this gap — budget, licenses, headcount, tools,
            vendors. Track each from identified → requested → approved → acquired.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {gap.requirements.length > 0 ? (
            <>
              <ul className="flex flex-col gap-2">
                {gap.requirements.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{r.type}</Badge>
                        <span className="font-medium">{r.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.cost != null && (
                          <>
                            ${fmtCost(r.cost)} {COST_CADENCE_LABELS[r.costCadence as CostCadence] ?? r.costCadence}
                          </>
                        )}
                        {r.vendor && <> · {r.vendor}</>}
                        {r.action?.title && <> · for: {r.action.title}</>}
                        {r.url && (
                          <>
                            {" · "}
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">
                              link
                            </a>
                          </>
                        )}
                        {r.description && <div>{r.description}</div>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RequirementStatusSelect
                        reqId={r.id}
                        projectId={id}
                        gapId={gap.id}
                        status={r.status}
                      />
                      <form action={deleteRequirement}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="gapId" value={gap.id} />
                        <SubmitButton variant="ghost" size="xs">
                          ✕
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Estimated cost (excl. rejected):{" "}
                <span className="font-medium text-foreground">
                  ${fmtCost(costByCadence.one_time)} one-time
                </span>
                {" · "}${fmtCost(costByCadence.monthly)}/mo{" · "}$
                {fmtCost(costByCadence.annual)}/yr
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No requirements yet. Add what you need to acquire to close this gap.
            </p>
          )}

          {/* Add requirement */}
          <form
            action={addRequirement}
            className="flex flex-col gap-2 border-t pt-4"
          >
            <input type="hidden" name="gapId" value={gap.id} />
            <input type="hidden" name="projectId" value={id} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-type">Type</Label>
                <NativeSelect id="req-type" name="type" defaultValue="budget">
                  {REQUIREMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-[2] flex-col gap-1.5">
                <Label htmlFor="req-name">Name</Label>
                <Input
                  id="req-name"
                  name="name"
                  required
                  placeholder="e.g. HubSpot Marketing Pro seat"
                />
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor="req-cost">Cost</Label>
                <Input
                  id="req-cost"
                  name="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-cadence">Cadence</Label>
                <NativeSelect id="req-cadence" name="costCadence" defaultValue="monthly">
                  {COST_CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace("_", "-")}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="req-desc">Description</Label>
                <Input id="req-desc" name="description" placeholder="Optional" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-vendor">Vendor</Label>
                <Input id="req-vendor" name="vendor" placeholder="Optional" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-url">URL</Label>
                <Input id="req-url" name="url" placeholder="Optional" />
              </div>
              {gap.actions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-action">For action</Label>
                  <NativeSelect id="req-action" name="actionId" defaultValue="">
                    <option value="">— none —</option>
                    {gap.actions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <SubmitButton variant="outline">Add requirement</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Audit history of status changes */}
      <Card>
        <CardHeader>
          <CardTitle>Status history</CardTitle>
          <CardDescription>Every status change, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {audits.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {audits.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {a.fromStatus ? `${a.fromStatus} → ` : ""}
                    <span className="font-medium">{a.toStatus}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.changedByEmail ?? "—"} ·{" "}
                    {a.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No status changes recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      {people.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Tip: add{" "}
          <Link href="/people" className="underline">
            people
          </Link>{" "}
          and{" "}
          <Link href="/teams" className="underline">
            teams
          </Link>{" "}
          to assign tasks to them.
        </p>
      )}
    </div>
  );
}
