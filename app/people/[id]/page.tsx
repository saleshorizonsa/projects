import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonWithTasks } from "@/lib/people";
import { getAccessibleProjectIds, requireUser } from "@/lib/access";
import { WORK_STATUS_LABELS, type WorkStatus } from "@/lib/constants";
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

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const scope = await getAccessibleProjectIds(user);
  const data = await getPersonWithTasks(id, scope);
  if (!data) notFound();
  const { person, tasks } = data;

  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdue = openTasks.filter((t) => t.overdue);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/people"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← People
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{person.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[person.role, person.email].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="mt-2 flex gap-2">
          <Badge variant={openTasks.length >= 4 ? "destructive" : "secondary"}>
            {openTasks.length} open
          </Badge>
          {overdue.length > 0 && (
            <Badge variant="destructive">{overdue.length} overdue</Badge>
          )}
          {person.memberships.map((m) => (
            <Badge key={m.id} variant="outline">
              {m.team.name}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned tasks ({tasks.length})</CardTitle>
          <CardDescription>
            Across all projects. Overdue tasks are flagged so overload is obvious.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Gap</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-32">Due</TableHead>
                  <TableHead className="w-24">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.title}
                      <div className="text-xs text-muted-foreground">
                        {t.actionTitle}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projects/${t.projectId}`}
                        className="hover:underline"
                      >
                        {t.projectName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projects/${t.projectId}/gaps/${t.gapId}`}
                        className="hover:underline"
                      >
                        {t.gapTitle}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={t.status === "done" ? "secondary" : "default"}
                      >
                        {WORK_STATUS_LABELS[t.status as WorkStatus] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.dueDate ? (
                        <span className={t.overdue ? "font-medium text-destructive" : ""}>
                          {t.dueDate.toISOString().slice(0, 10)}
                          {t.overdue && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.teamName ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tasks assigned to {person.name} yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
