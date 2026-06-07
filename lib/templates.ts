// Domain templates (SPEC: reusable capability sets per IT domain). Defined in
// code as static reference data — applying one seeds a project's capabilities.

export type CapabilityTemplate = {
  id: string;
  name: string;
  description: string;
  capabilities: { name: string; businessWeight: number }[];
};

export const TEMPLATES: CapabilityTemplate[] = [
  {
    id: "crm",
    name: "CRM",
    description: "Customer relationship management platform.",
    capabilities: [
      { name: "Lead capture", businessWeight: 5 },
      { name: "Pipeline management", businessWeight: 4 },
      { name: "Reporting & dashboards", businessWeight: 3 },
      { name: "Automation & workflows", businessWeight: 3 },
      { name: "Integrations", businessWeight: 4 },
    ],
  },
  {
    id: "itsm",
    name: "ITSM",
    description: "IT service management.",
    capabilities: [
      { name: "Incident management", businessWeight: 5 },
      { name: "Change management", businessWeight: 4 },
      { name: "Problem management", businessWeight: 3 },
      { name: "Service catalog", businessWeight: 3 },
      { name: "SLA tracking", businessWeight: 4 },
    ],
  },
  {
    id: "security",
    name: "Security posture",
    description: "Security and compliance maturity.",
    capabilities: [
      { name: "Identity & access management", businessWeight: 5 },
      { name: "Vulnerability management", businessWeight: 5 },
      { name: "Endpoint protection", businessWeight: 4 },
      { name: "Logging & monitoring", businessWeight: 4 },
      { name: "Incident response", businessWeight: 5 },
      { name: "Security awareness training", businessWeight: 2 },
    ],
  },
  {
    id: "infra",
    name: "Infrastructure",
    description: "Core infrastructure and operations.",
    capabilities: [
      { name: "Compute & hosting", businessWeight: 4 },
      { name: "Networking", businessWeight: 4 },
      { name: "Backup & recovery", businessWeight: 5 },
      { name: "Observability", businessWeight: 3 },
      { name: "CI/CD & deployment", businessWeight: 3 },
    ],
  },
];

export function getTemplate(id: string): CapabilityTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
