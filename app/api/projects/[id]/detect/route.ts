import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEdit, getCurrentUser, getProjectRole } from "@/lib/access";

// Server-only route. The Anthropic key is read from the environment by the SDK
// and never leaves the server; only the structured gap list is returned.
export const runtime = "nodejs";

const ProposedGap = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  capability: z.string(),
});
const GapList = z.object({ gaps: z.array(ProposedGap) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canEdit(await getProjectRole(id, user))) {
    return NextResponse.json(
      { error: "You don't have edit access to this project." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const target = (body.target ?? "").toString().trim();
  const current = (body.current ?? "").toString().trim();

  if (!target || !current) {
    return NextResponse.json(
      { error: "Describe both the target state and the current state." },
      { status: 400 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env." },
      { status: 503 }
    );
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const caps = await prisma.capability.findMany({
    where: { projectId: id },
    select: { name: true },
  });
  const capabilityList =
    caps.length > 0
      ? caps.map((c) => `- ${c.name}`).join("\n")
      : "(none defined yet)";

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const system =
    "You are an IT gap analyst. Given a project's desired (target) state and its " +
    "current state, identify the concrete gaps between them. For each gap give a " +
    "short title, a one-to-two sentence description, a suggested severity " +
    "(low | medium | high), and the single capability it maps to. Prefer one of " +
    "the project's existing capabilities when it fits; otherwise propose a concise " +
    "capability name. Return only real, distinct gaps grounded in the text provided.";

  const userPrompt = [
    `Project: ${project.name}`,
    "",
    "Existing capabilities:",
    capabilityList,
    "",
    "TARGET STATE (where we want to be):",
    target,
    "",
    "CURRENT STATE (where we are today):",
    current,
  ].join("\n");

  try {
    const message = await client.messages.parse({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(GapList) },
    });
    return NextResponse.json({ gaps: message.parsed_output?.gaps ?? [] });
  } catch (err) {
    const messageText =
      err instanceof Error ? err.message : "AI request failed.";
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
