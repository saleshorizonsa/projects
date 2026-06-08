import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, requireUser } from "@/lib/access";
import { getProjectRequirements, rollupCosts } from "@/lib/requirements";
import {
  COST_CADENCE_LABELS,
  isRequirementStatus,
  isRequirementType,
  REQUIREMENT_STATUSES,
  REQUIREMENT_TYPES,
  type CostCadence,
} from "@/lib/constants";
import { RequirementStatusSelect } from "@/components/requirement-status-select";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function ProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  await requireProjectRole(id, user, "view");

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const all = await getProjectRequirements(id);
  // Per-project cost-to-close — one-time vs recurring kept separate.
  const rollup = rollupCosts(all);

  const typeFilter = sp.type && isRequirementType(sp.type) ? sp.type : "";
  const statusFilter =
    sp.status && isRequirementStatus(sp.status) ? sp.status : "";
  const rows = all.filter(
    (r) =>
      (!typeFilter || r.type === typeFilter) &&
      (!statusFilter || r.status === statusFilter)
  );

  const acquirements = await prisma.acquirement.findMany({
    where: { projectId: id },
    orderBy: { acquiredAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Requirements & spend</h1>
        <p className="text-sm text-muted-foreground">
          Everything needed to close this project&apos;s gaps — budget, licenses,
          headcount, tools, vendors — and what it costs.
        </p>
      </div>

      {/* Cost-to-close rollup (one-time vs recurring kept separate) */}
      <Card>
        <CardHeader>
          <CardTitle>Cost to close</CardTitle>
          <CardDescription>
            Across all non-rejected requirements. One-time and recurring are not
            summed together.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              One-time
            </div>
            <div className="text-2xl font-semibold">${fmt(rollup.oneTime)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Monthly
            </div>
            <div className="text-2xl font-semibold">${fmt(rollup.monthly)}/mo</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Annual
            </div>
            <div className="text-2xl font-semibold">${fmt(rollup.annual)}/yr</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Project budget
            </div>
            <div className="text-2xl font-semibold">
              {project.budget != null ? `$${fmt(project.budget)}` : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List + filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Procurement list ({rows.length})</CardTitle>
              <CardDescription>Filter by type and status.</CardDescription>
            </div>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <NativeSelect name="type" defaultValue={typeFilter}>
                <option value="">all types</option>
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="status" defaultValue={statusFilter}>
                <option value="">all statuses</option>
                {REQUIREMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="outline" size="sm">
                Filter
              </Button>
              {(typeFilter || statusFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href={`/projects/${id}/requirements`} />}
                >
                  Clear
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requirement</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead>Gap</TableHead>
                  <TableHead className="w-32">Cost</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.vendor && (
                        <div className="text-xs text-muted-foreground">
                          {r.vendor}
                          {r.url && (
                            <>
                              {" · "}
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                link
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projects/${id}/gaps/${r.gapId}`}
                        className="hover:underline"
                      >
                        {r.gapTitle}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.cost != null ? (
                        <>
                          ${fmt(r.cost)}{" "}
                          <span className="text-muted-foreground">
                            {COST_CADENCE_LABELS[r.costCadence as CostCadence] ??
                              r.costCadence}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <RequirementStatusSelect
                        reqId={r.id}
                        projectId={id}
                        gapId={r.gapId}
                        status={r.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No requirements{typeFilter || statusFilter ? " match the filter" : " yet"}.
              Add them on a gap&apos;s detail page.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Acquired resources (auto-logged when a requirement hits "acquired") */}
      <Card>
        <CardHeader>
          <CardTitle>Acquired resources ({acquirements.length})</CardTitle>
          <CardDescription>
            Auto-logged when a requirement reaches “acquired” — the record of what
            the investment bought.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acquirements.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {acquirements.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-medium">🎁 {a.title}</span>
                  <span className="text-muted-foreground">
                    {a.cost != null ? `$${fmt(a.cost)} · ` : ""}
                    {a.acquiredAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing acquired yet. Set a requirement to “acquired” to log one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
