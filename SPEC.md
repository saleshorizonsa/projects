# GapFlow — Project Gap Management

A gap-analysis project manager for IT managers. For every project, you define where you
want to be, assess where you are, let the app surface the gaps, plan actions and resources
to close them, assign the work to teams, then re-measure. It is a feedback loop, not a
checklist.

This document is the build spec and the single source of truth. Hand it to Claude Code as
context for every phase.

> **Build status:** Phase 1 is built and committed. Phases 2–5 below are the remaining plan.

---

## 1. Core concept — the loop

The app is built around one repeating cycle. The user's original four "layers" map onto it:

| Loop stage | User's term | What happens |
|------------|-------------|--------------|
| **Define**  | Output    | Set the target state and measurable goals (the setpoint). |
| **Assess**  | Feedback  | Record the current state; the app computes the gaps (target − current). |
| **Plan**    | Input     | Create actions (the *how*) and requirements (the *what's needed*) per gap. |
| **Execute** | Processes | Break actions into tasks, assign to people/teams, track to done. |
| **(loop)**  | —         | Re-assess. A gap is only *closed* once a new assessment confirms it shrank. |

The most important rule: **a gap is not done when it is assigned — it is done when it is
re-measured and verified.** That return arrow is the whole point of the product.

The full chain, with the resource side sitting alongside the work side:

```
Goal → Gap → { Action (the how) + Requirement (what it needs) } → Task (who does it) → re-measure
```

---

## 2. How gaps are detected (the critical part)

The app must never ask the user to type gaps by hand. It computes them. Two complementary
mechanisms:

### 2a. Structured capability scoring (always available, deterministic)
- Each project is assessed against a set of **capabilities** (e.g. for CRM: lead capture,
  pipeline management, reporting, automation, integrations).
- For each capability the user records a **current score** and a **target score** (1–5 maturity).
- `gap_size = target_score − current_score`. Any capability where `gap_size > 0` becomes a Gap.
- Gaps auto-rank by `gap_size × business_weight`.

### 2b. AI-assisted detection (the differentiator)
- The user can instead (or additionally) describe the target and current state in free text
  (the assessment **narrative** field).
- The app sends both to the Claude API and asks for a **structured JSON list of gaps**, each
  with title, description, suggested severity, and suggested capability mapping.
- The user reviews/edits before the gaps are saved — AI proposes, human confirms.
- Keep the structured scores as the source of truth so the AI output stays grounded.

### Prioritization
Every gap carries an **impact** (1–5) and **effort** (1–5). The app surfaces a simple
impact × effort matrix so the user attacks high-impact / low-effort gaps first.

---

## 3. Data model

```
Project
  id, name, description, status, owner_id
  budget (nullable), review_cadence (nullable: e.g. 'monthly'|'quarterly'), created_at
  └─ has many Goals, Capabilities, Assessments, Gaps, Achievements, Acquirements

Goal                      (Define / Output)
  id, project_id, title, description, target_date, status
  metric_type ('value' | 'capability_scores' | 'none')
  metric_target_value (nullable), metric_unit (nullable)
  -- progress is COMPUTED: % of this goal's linked gaps that are verified
  └─ linked to many Gaps (GoalGap join table)

Capability                (the dimensions being scored; can come from a Template)
  id, project_id, name, business_weight

Assessment                (Feedback — a dated snapshot of current state)
  id, project_id, taken_at, narrative (free-text current-state),
  is_baseline (bool), source ('manual' | 'ai')
  └─ has many CapabilityScores

CapabilityScore
  id, assessment_id, capability_id, current_score, target_score
  evidence (nullable: note or link), confidence ('low' | 'medium' | 'high')

Gap                       (the error signal)
  id, project_id, capability_id (nullable), source_assessment_id
  title, description, severity, impact (1-5), effort (1-5)
  status ('identified'|'prioritized'|'planned'|'in_progress'|'resolved'|'verified')
  └─ has many Actions, has many Requirements

Action                    (Input — the HOW; what will close the gap)
  id, gap_id, title, description, status
  └─ has many Tasks

Requirement               (Input — WHAT'S NEEDED; financials / procurement)
  id, gap_id, action_id (nullable)
  type ('budget'|'subscription'|'license'|'tool'|'hardware'|'headcount'|'training'|'vendor'|'other')
  name, description
  cost, cost_cadence ('one_time' | 'monthly' | 'annual')
  status ('identified'|'requested'|'approved'|'acquired'|'rejected')
  vendor (nullable), url (nullable)

Task                      (Processes — assignable unit of work)
  id, action_id, title, status ('todo'|'in_progress'|'done'), assignee_id, team_id, due_date

Person
  id, name, email, role
Team
  id, name  (has many Person via membership)

Achievement               (auto-logged when a Gap reaches 'verified')
  id, project_id, gap_id, title, achieved_at
  from_score, to_score, target_score   (the before/after, for the report)

Acquirement               (auto-logged when a Requirement reaches 'acquired')
  id, project_id, requirement_id, title, acquired_at, cost

Template                  (reusable capability sets per IT domain)
  id, name (e.g. 'CRM','ITSM','Security posture'), default_capabilities[]
```

Notes:
- `Achievement` and `Acquirement` are auto-created, never hand-entered. Achievements record
  closed gaps; Acquirements record resources gained. Together they are the Output layer's
  proof that the loop worked and the case for the investment.
- Keep `Assessment` rows as dated snapshots — they power the burndown chart and regression
  detection.
- Goal progress is always computed from linked gaps, never stored as a manual status.

---

## 4. Recommended stack (Vercel + Postgres + Claude Code)

- **Framework:** Next.js (App Router), TypeScript — full-stack, deploys natively to Vercel.
- **Database:** Postgres. Local Postgres for dev; managed Postgres in prod via `DATABASE_URL`
  (Vercel's Postgres offering or Neon — confirm the current option in Vercel's docs at deploy time).
- **ORM:** Prisma (migrations + type safety). Drizzle is a fine lighter alternative.
- **UI:** Tailwind CSS + shadcn/ui.
- **Charts:** Recharts (dashboard, gap burndown).
- **Auth:** Auth.js (NextAuth) — added in Phase 5; earlier phases run single-user.
- **AI gap detection:** Anthropic Claude API. Key in `ANTHROPIC_API_KEY`, **server-side only**,
  never exposed to the client. Confirm the current production model string from Anthropic's
  docs rather than hardcoding from memory.

---

## 5. Build phases

### Phase 1 — MVP, single user, manual scoring  ✅ BUILT
- Projects CRUD.
- Capabilities per project + manual current/target scoring.
- Auto-computed, ranked Gaps from the scores (never hand-typed).
- Basic gap detail with a status field.
- No teams, AI, requirements, or auth yet.

### Phase 2 — Make the loop measurable & time-aware
*Closes the loop and upgrades the Output (Define) and Feedback (Assess) layers.*
- Multiple dated **Assessments** per project; one can be flagged as the **baseline**.
- Free-text **narrative** field on each assessment (feeds AI detection later, holds nuance now).
- Full **gap lifecycle**: identified → prioritized → planned → in_progress → resolved → verified.
- Auto-create an **Achievement** (with from/to/target scores) when a gap is verified.
- **Gap burndown** chart (open vs closed over time) using Recharts.
- **Measurable goals:** add metric (target value + unit, or target capability scores) to Goal;
  link goals to gaps; show goal progress as % of linked gaps verified.
- **Evidence + confidence** on each CapabilityScore, to flag which scores are guesses.
- **Regression detection:** flag any capability whose current score dropped vs an earlier
  assessment, or any previously-verified gap that has reopened.
- **Review cadence:** optional schedule per project + a "next assessment due" indicator.
- *Not yet:* multi-rater scoring, automated data import.

### Phase 3 — Plan, Execute & Resources
- **Actions** under gaps; **Tasks** under actions.
- **People/Teams**; assign tasks to a person and/or team with a due date; per-person workload view.
- **Impact × effort** matrix view for gaps.
- **Requirements** (financials/procurement) on a gap or action — budget, subscriptions,
  licenses, tools, headcount, etc., each with cost and `cost_cadence` (one-time vs recurring)
  and a status from identified → acquired.
- **Cost-to-close** rollups per gap and per project; a **subscription/procurement list**
  (filter by type + status); recurring vs one-time spend separated.
- Auto-create an **Acquirement** when a Requirement reaches "acquired".

### Phase 4 — Intelligence & reuse
- **AI-assisted gap detection** via the Claude API (server route only): describe target +
  current state → structured gaps returned for review/edit before saving.
- **Domain Templates** (CRM, ITSM, security, infra) to seed a project's capabilities.
- **Manager dashboard:** open vs closed gaps, burndown, breakdowns by project and by team,
  planned spend vs budget.
- **Multi-rater scoring:** let several people score the same capability; surface disagreement.
- **Data import:** map an imported metric (CSV first) to the 1–5 scale to auto-fill some scores.
- **Achievement / Acquirement report:** quarterly roll-up with before/after scores and spend.

### Phase 5 — Auth & polish
- Auth.js with login, roles, and project sharing; scope all data to the user / their teams.
- Export (project + gaps + financials to CSV/JSON); audit history of status changes.
- Notifications (assessment due, task due).
- Vercel deployment: which env vars to set (`DATABASE_URL`, `ANTHROPIC_API_KEY`, auth secrets).

---

## 6. How to proceed with Claude Code

Build one phase at a time. For each: paste the phase prompt, point it at this file, verify it
runs locally against Postgres, commit, then move on. If Claude Code drifts from the model,
paste the relevant section of this spec back into the prompt — cheaper than letting it
improvise the schema.

Phase 2 prompt to use next:

> "Read SPEC.md. Implement Phase 2 exactly as described in section 5 (Make the loop measurable
> & time-aware), using the data model in section 3. Migrate the schema, keep existing Phase 1
> data working, and give me the exact commands to run. Do not add multi-rater scoring or data
> import yet — those are Phase 4."
