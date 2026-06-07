import {
  getGapsByProject,
  getPortfolioStats,
  getTasksByTeam,
} from "@/lib/dashboard";
import { getPortfolioBurndown } from "@/lib/gaps";
import { getAccessibleProjectIds, requireUser } from "@/lib/access";
import { BurndownChart } from "@/components/burndown-chart";
import { BreakdownBarChart } from "@/components/breakdown-bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = await getAccessibleProjectIds(user);
  const [stats, byProject, byTeam, burndown] = await Promise.all([
    getPortfolioStats(scope),
    getGapsByProject(scope),
    getTasksByTeam(scope),
    getPortfolioBurndown(scope),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Manager dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Portfolio view across all projects — open vs closed gaps, burndown over
          time, and breakdowns by project and team.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Projects" value={stats.projects} />
        <Stat label="Open gaps" value={stats.openGaps} />
        <Stat label="Closed gaps" value={stats.closedGaps} />
        <Stat label="Achievements" value={stats.achievements} />
      </div>

      {/* Portfolio burndown */}
      <Card>
        <CardHeader>
          <CardTitle>Gap burndown (all projects)</CardTitle>
          <CardDescription>
            Open vs targets-met summed across every project at each assessment
            date (carry-forward per project).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {burndown.length >= 2 ? (
            <BurndownChart data={burndown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough dated assessments yet to chart a portfolio burndown.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By project */}
        <Card>
          <CardHeader>
            <CardTitle>Gaps by project</CardTitle>
            <CardDescription>Open vs closed gaps per project.</CardDescription>
          </CardHeader>
          <CardContent>
            {byProject.length > 0 ? (
              <BreakdownBarChart data={byProject} />
            ) : (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            )}
          </CardContent>
        </Card>

        {/* By team */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by team</CardTitle>
            <CardDescription>
              Open vs done tasks per team — spot where the load sits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byTeam.length > 0 ? (
              <BreakdownBarChart data={byTeam} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No teams or tasks yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
