import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/access";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
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

export default async function TeamsPage() {
  await requireUser();
  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: { include: { person: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.person.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="text-sm text-muted-foreground">
          Group people into teams you can assign tasks to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New team</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTeam} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                name="name"
                required
                placeholder="Platform team"
              />
            </div>
            <SubmitButton variant="outline">Create team</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No teams yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => {
            const memberIds = new Set(team.memberships.map((m) => m.personId));
            const candidates = people.filter((p) => !memberIds.has(p.id));
            return (
              <Card key={team.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{team.name}</CardTitle>
                    <form action={deleteTeam}>
                      <input type="hidden" name="id" value={team.id} />
                      <SubmitButton variant="ghost" size="xs">
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                  <CardDescription>
                    {team.memberships.length} members · {team._count.tasks} tasks
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {team.memberships.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {team.memberships.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                        >
                          <Link
                            href={`/people/${m.person.id}`}
                            className="hover:underline"
                          >
                            {m.person.name}
                            {m.person.role && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {m.person.role}
                              </span>
                            )}
                          </Link>
                          <form action={removeTeamMember}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input
                              type="hidden"
                              name="personId"
                              value={m.person.id}
                            />
                            <SubmitButton variant="ghost" size="xs">
                              Remove
                            </SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  )}

                  {candidates.length > 0 && (
                    <form
                      action={addTeamMember}
                      className="flex items-end gap-2 border-t pt-3"
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor={`add-${team.id}`}>Add member</Label>
                        <NativeSelect
                          id={`add-${team.id}`}
                          name="personId"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select a person…
                          </option>
                          {candidates.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <SubmitButton variant="outline" size="sm">
                        Add
                      </SubmitButton>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {people.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add people on the{" "}
          <Link href="/people" className="underline">
            People
          </Link>{" "}
          page before building teams.
        </p>
      )}
    </div>
  );
}
