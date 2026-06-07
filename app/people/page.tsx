import Link from "next/link";
import { getPeopleWithLoad } from "@/lib/people";
import { getAccessibleProjectIds, requireUser } from "@/lib/access";
import { createPerson, deletePerson } from "@/app/actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Heuristic for "who's overloaded" — purely a visual cue.
const OVERLOAD_THRESHOLD = 4;

export default async function PeoplePage() {
  const user = await requireUser();
  const scope = await getAccessibleProjectIds(user);
  const people = await getPeopleWithLoad(scope);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="text-sm text-muted-foreground">
          Everyone you can assign work to. Open-task counts surface who is
          overloaded.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory ({people.length})</CardTitle>
          <CardDescription>
            Sorted by open tasks (busiest first).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {people.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-28">Open tasks</TableHead>
                  <TableHead className="w-24">Overdue</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/people/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.role ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.openTasks >= OVERLOAD_THRESHOLD
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {p.openTasks}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.overdueTasks > 0 ? (
                        <Badge variant="destructive">{p.overdueTasks}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deletePerson}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton variant="ghost" size="xs">
                          Remove
                        </SubmitButton>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No people yet. Add someone to start assigning tasks.
            </p>
          )}

          <form
            action={createPerson}
            className="flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="person-name">Name</Label>
              <Input id="person-name" name="name" required placeholder="Jane Doe" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-role">Role</Label>
              <Input id="person-role" name="role" placeholder="Engineer" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-email">Email</Label>
              <Input
                id="person-email"
                name="email"
                type="email"
                placeholder="jane@acme.com"
              />
            </div>
            <SubmitButton variant="outline">Add person</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
