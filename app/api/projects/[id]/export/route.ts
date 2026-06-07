import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getProjectRole } from "@/lib/access";

export const runtime = "nodejs";

type Row = {
  capability: string;
  source: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  currentScore: number | "";
  targetScore: number | "";
  gapSize: number | "";
  impact: number;
  effort: number;
};

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!(await getProjectRole(id, user))) {
    return NextResponse.json({ error: "No access." }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { capabilities: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Current/target scores come from the latest assessment.
  const assessment = await prisma.assessment.findFirst({
    where: { projectId: id },
    orderBy: { takenAt: "desc" },
    include: { scores: true },
  });
  const scoreByCap = new Map(
    (assessment?.scores ?? []).map((s) => [s.capabilityId, s])
  );

  const gaps = await prisma.gap.findMany({
    where: { projectId: id },
    include: { capability: true },
  });

  const rows: Row[] = gaps.map((g) => {
    const score = g.capabilityId ? scoreByCap.get(g.capabilityId) : undefined;
    const current = score?.currentScore ?? "";
    const target = score?.targetScore ?? "";
    const gapSize =
      typeof current === "number" && typeof target === "number"
        ? Math.max(target - current, 0)
        : "";
    return {
      capability: g.capability?.name ?? g.suggestedCapability ?? "",
      source: g.source,
      title: g.title,
      description: g.description ?? "",
      severity: g.severity,
      status: g.status,
      currentScore: current,
      targetScore: target,
      gapSize,
      impact: g.impact,
      effort: g.effort,
    };
  });

  const format = (req.nextUrl.searchParams.get("format") ?? "json").toLowerCase();
  const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (format === "csv") {
    const headers = [
      "capability",
      "source",
      "title",
      "description",
      "severity",
      "status",
      "currentScore",
      "targetScore",
      "gapSize",
      "impact",
      "effort",
    ];
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => csvCell((r as Record<string, unknown>)[h])).join(",")
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-gaps.csv"`,
      },
    });
  }

  const payload = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
    },
    capabilities: project.capabilities.map((c) => ({
      name: c.name,
      businessWeight: c.businessWeight,
    })),
    gaps: rows,
    exportedAt: new Date().toISOString(),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-export.json"`,
    },
  });
}
