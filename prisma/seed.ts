// Seeds one sample project so the full Phase 2 loop is visible immediately:
// two dated assessments (for the burndown), open gaps, and one verified gap
// with its auto-logged achievement. Self-contained (no app imports / aliases).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function severityForGapSize(gapSize: number): "low" | "medium" | "high" {
  if (gapSize >= 3) return "high";
  if (gapSize === 2) return "medium";
  return "low";
}

async function main() {
  // Start clean so re-seeding is idempotent.
  await prisma.project.deleteMany({ where: { name: "CRM Rollout (sample)" } });
  await prisma.team.deleteMany({ where: { name: "Platform team (sample)" } });
  await prisma.person.deleteMany({
    where: { name: { in: ["Jane Doe", "Raj Patel", "Mia Chen"] } },
  });

  // Ensure the admin user exists and owns the sample project.
  const admin = await prisma.user.upsert({
    where: { email: "shareef6695@gmail.com" },
    update: {},
    create: {
      email: "shareef6695@gmail.com",
      name: "Admin",
      passwordHash: await bcrypt.hash("changeme123", 10),
      role: "admin",
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "CRM Rollout (sample)",
      description:
        "Sample project demonstrating the deterministic gap-analysis loop.",
      ownerId: admin.id,
      goals: {
        create: [
          { title: "Single source of truth for leads" },
          { title: "Automated pipeline reporting", status: "open" },
        ],
      },
    },
  });

  // Capabilities with their business weight.
  const capDefs = [
    { name: "Lead capture", businessWeight: 5 },
    { name: "Pipeline management", businessWeight: 4 },
    { name: "Reporting", businessWeight: 3 },
    { name: "Automation", businessWeight: 2 },
    { name: "Integrations", businessWeight: 4 },
  ];
  const caps: Record<string, string> = {};
  for (const c of capDefs) {
    const created = await prisma.capability.create({
      data: { projectId: project.id, name: c.name, businessWeight: c.businessWeight },
    });
    caps[c.name] = created.id;
  }

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Two dated snapshots — scores improve over time (drives the burndown).
  //                          [current, target]
  const earlier: Record<string, [number, number]> = {
    "Lead capture": [1, 5],
    "Pipeline management": [2, 4],
    Reporting: [1, 4],
    Automation: [1, 3],
    Integrations: [3, 4],
  };
  const current: Record<string, [number, number]> = {
    "Lead capture": [3, 5], // still open: gap 2
    "Pipeline management": [4, 4], // met — and verified below
    Reporting: [2, 4], // still open: gap 2
    Automation: [3, 3], // met
    Integrations: [4, 4], // met
  };

  async function snapshot(
    takenAt: Date,
    narrative: string,
    scores: Record<string, [number, number]>,
    isBaseline = false
  ) {
    const assessment = await prisma.assessment.create({
      data: { projectId: project.id, source: "manual", narrative, takenAt, isBaseline },
    });
    for (const [name, [cur, tgt]] of Object.entries(scores)) {
      await prisma.capabilityScore.create({
        data: {
          assessmentId: assessment.id,
          capabilityId: caps[name],
          currentScore: cur,
          targetScore: tgt,
        },
      });
    }
    return assessment;
  }

  await snapshot(monthAgo, "Initial assessment", earlier, true);
  const latest = await snapshot(now, "After Q2 improvements", current);

  // Open gaps computed from the latest assessment (as recomputeGaps would).
  // Distinct impact/effort so they spread across the prioritization matrix.
  const priority: Record<string, { impact: number; effort: number }> = {
    "Lead capture": { impact: 5, effort: 2 }, // quick win (top-left)
    Reporting: { impact: 3, effort: 4 }, // major-ish
  };
  const openGaps: Record<string, string> = {};
  for (const [name, [cur, tgt]] of Object.entries(current)) {
    const gapSize = tgt - cur;
    if (gapSize > 0) {
      const g = await prisma.gap.create({
        data: {
          projectId: project.id,
          capabilityId: caps[name],
          sourceAssessmentId: latest.id,
          title: `Close gap in ${name}`,
          description: `Current maturity ${cur}/5, target ${tgt}/5.`,
          severity: severityForGapSize(gapSize),
          impact: priority[name]?.impact ?? Math.min(gapSize + 2, 5),
          effort: priority[name]?.effort ?? 3,
          status: "identified",
        },
      });
      openGaps[name] = g.id;
    }
  }

  // A gap that was worked, re-measured as closed, and verified → achievement.
  const verifiedGap = await prisma.gap.create({
    data: {
      projectId: project.id,
      capabilityId: caps["Pipeline management"],
      sourceAssessmentId: latest.id,
      title: "Close gap in Pipeline management",
      description: "Raised from 2/4 to 4/4 and verified by re-assessment.",
      severity: "medium",
      impact: 4,
      effort: 3,
      status: "verified",
    },
  });
  await prisma.achievement.create({
    data: {
      projectId: project.id,
      gapId: verifiedGap.id,
      title: "Closed gap in Pipeline management",
    },
  });

  // ---- Phase 3: people, a team, and assigned tasks under the Lead capture gap.
  const jane = await prisma.person.create({
    data: { name: "Jane Doe", email: "jane@acme.com", role: "Engineer" },
  });
  const raj = await prisma.person.create({
    data: { name: "Raj Patel", email: "raj@acme.com", role: "Analyst" },
  });
  const mia = await prisma.person.create({
    data: { name: "Mia Chen", email: "mia@acme.com", role: "Project Manager" },
  });

  const team = await prisma.team.create({
    data: {
      name: "Platform team (sample)",
      memberships: {
        create: [{ personId: jane.id }, { personId: raj.id }],
      },
    },
  });

  const inDays = (n: number) =>
    new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  // An action with tasks (one already overdue) under the Lead capture gap.
  await prisma.action.create({
    data: {
      gapId: openGaps["Lead capture"],
      title: "Implement lead-capture web forms",
      description: "Stand up forms that feed leads straight into the CRM.",
      status: "in_progress",
      tasks: {
        create: [
          {
            title: "Design form schema",
            status: "in_progress",
            assigneeId: jane.id,
            dueDate: inDays(7),
          },
          {
            title: "Build API endpoint",
            status: "todo",
            assigneeId: raj.id,
            teamId: team.id,
            dueDate: inDays(-3), // overdue
          },
          {
            title: "QA validation",
            status: "todo",
            assigneeId: jane.id,
            teamId: team.id,
            dueDate: inDays(14),
          },
        ],
      },
    },
  });

  // A lighter action under the Reporting gap, assigned to Mia.
  await prisma.action.create({
    data: {
      gapId: openGaps["Reporting"],
      title: "Build pipeline dashboard",
      status: "todo",
      tasks: {
        create: [
          { title: "Gather reporting requirements", assigneeId: mia.id, dueDate: inDays(10) },
        ],
      },
    },
  });

  console.log(`Seeded project "${project.name}" (${project.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
