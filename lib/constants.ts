// Shared domain vocabulary for GapFlow.

// Gap lifecycle (SPEC section 3), in order. The user moves a gap along this list;
// Phase 2 auto-advances an engaged gap to "resolved" when re-measurement closes it,
// and auto-logs an Achievement when it reaches "verified".
export const GAP_STATUSES = [
  "identified",
  "prioritized",
  "planned",
  "in_progress",
  "resolved",
  "verified",
] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  identified: "Identified",
  prioritized: "Prioritized",
  planned: "Planned",
  in_progress: "In progress",
  resolved: "Resolved",
  verified: "Verified",
};

// Statuses that mean the gap is no longer "open" (it has been closed by the loop).
export const CLOSED_GAP_STATUSES: GapStatus[] = ["resolved", "verified"];

export function isClosedStatus(status: string): boolean {
  return (CLOSED_GAP_STATUSES as string[]).includes(status);
}

export function gapStatusOrder(status: string): number {
  const i = (GAP_STATUSES as readonly string[]).indexOf(status);
  return i === -1 ? 0 : i;
}

export const PROJECT_STATUSES = ["active", "on_hold", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Action & Task share a simple execution lifecycle (Phase 3 — Plan & Execute).
export const WORK_STATUSES = ["todo", "in_progress", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function isWorkStatus(status: string): status is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(status);
}

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

// Severity is derived from gap size, never entered by hand.
export function severityForGapSize(gapSize: number): "low" | "medium" | "high" {
  if (gapSize >= 3) return "high";
  if (gapSize === 2) return "medium";
  return "low";
}

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

// AI gaps have no score, so seed their impact from the suggested severity.
export function impactForSeverity(severity: string): number {
  if (severity === "high") return 5;
  if (severity === "medium") return 3;
  return 2;
}

// Requirements (Input — resources/procurement needed to close a gap).
export const REQUIREMENT_TYPES = [
  "budget",
  "subscription",
  "license",
  "tool",
  "hardware",
  "headcount",
  "training",
  "vendor",
  "other",
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const COST_CADENCES = ["one_time", "monthly", "annual"] as const;
export type CostCadence = (typeof COST_CADENCES)[number];
export const COST_CADENCE_LABELS: Record<CostCadence, string> = {
  one_time: "one-time",
  monthly: "/mo",
  annual: "/yr",
};

export const REQUIREMENT_STATUSES = [
  "identified",
  "requested",
  "approved",
  "acquired",
  "rejected",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export function isRequirementType(v: string): v is RequirementType {
  return (REQUIREMENT_TYPES as readonly string[]).includes(v);
}
export function isCostCadence(v: string): v is CostCadence {
  return (COST_CADENCES as readonly string[]).includes(v);
}
export function isRequirementStatus(v: string): v is RequirementStatus {
  return (REQUIREMENT_STATUSES as readonly string[]).includes(v);
}

// ---- Phase 2: measurable & time-aware ----

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export function isConfidence(v: string): v is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

export const METRIC_TYPES = ["none", "value", "capability_scores"] as const;
export type MetricType = (typeof METRIC_TYPES)[number];
export const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  none: "No metric",
  value: "Target value",
  capability_scores: "Capability scores",
};
export function isMetricType(v: string): v is MetricType {
  return (METRIC_TYPES as readonly string[]).includes(v);
}

export const REVIEW_CADENCES = ["monthly", "quarterly"] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];
export function isReviewCadence(v: string): v is ReviewCadence {
  return (REVIEW_CADENCES as readonly string[]).includes(v);
}

// Next assessment due = last assessment date + cadence interval.
export function nextDueDate(lastTakenAt: Date, cadence: string): Date | null {
  const d = new Date(lastTakenAt);
  if (cadence === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cadence === "quarterly") d.setMonth(d.getMonth() + 3);
  else return null;
  return d;
}

export function isPast(date: Date | null): boolean {
  return date ? date.getTime() < Date.now() : false;
}

// Clamp a 1-5 score coming from form input.
export function clampScore(value: number): number {
  if (Number.isNaN(value)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value)));
}
