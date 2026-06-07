"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAiGaps, type AiGapInput } from "@/app/actions";
import { SEVERITIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

type Proposal = AiGapInput & { include: boolean };

export function AiGapDetector({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  async function detect() {
    setLoading(true);
    setError(null);
    setProposals(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Detection failed.");
        return;
      }
      setProposals(
        (data.gaps ?? []).map((g: AiGapInput) => ({ ...g, include: true }))
      );
    } catch {
      setError("Network error contacting the server.");
    } finally {
      setLoading(false);
    }
  }

  function update(index: number, patch: Partial<Proposal>) {
    setProposals((prev) =>
      prev
        ? prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
        : prev
    );
  }

  function save() {
    if (!proposals) return;
    const selected = proposals
      .filter((p) => p.include)
      .map(({ title, description, severity, capability }) => ({
        title,
        description,
        severity,
        capability,
      }));
    if (selected.length === 0) return;
    startSaving(async () => {
      await saveAiGaps(projectId, selected);
      router.push(`/projects/${projectId}/gaps`);
    });
  }

  const selectedCount = proposals?.filter((p) => p.include).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Describe the states</CardTitle>
          <CardDescription>
            Claude proposes gaps from your description — you review and confirm
            before anything is saved. Existing capabilities are used to ground the
            suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target">Target state</Label>
            <Textarea
              id="target"
              rows={5}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Where you want this project to be…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current">Current state</Label>
            <Textarea
              id="current"
              rows={5}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Where things stand today…"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={detect} disabled={loading || !target.trim() || !current.trim()}>
              {loading ? "Detecting…" : "Detect gaps"}
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {proposals && (
        <Card>
          <CardHeader>
            <CardTitle>Proposed gaps ({proposals.length})</CardTitle>
            <CardDescription>
              Edit anything, untick what you don’t want, then save. AI proposes —
              you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {proposals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No gaps proposed. Try describing the states in more detail.
              </p>
            )}
            {proposals.map((p, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={p.include}
                    onChange={(e) => update(i, { include: e.target.checked })}
                    className="size-4"
                    aria-label="Include this gap"
                  />
                  <Input
                    value={p.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    className="flex-1 font-medium"
                  />
                </div>
                <Textarea
                  rows={2}
                  value={p.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Severity</Label>
                    <NativeSelect
                      value={p.severity}
                      onChange={(e) => update(i, { severity: e.target.value })}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Capability</Label>
                    <Input
                      value={p.capability}
                      onChange={(e) => update(i, { capability: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            {proposals.length > 0 && (
              <Button
                onClick={save}
                disabled={isSaving || selectedCount === 0}
                className="self-end"
              >
                {isSaving ? "Saving…" : `Save ${selectedCount} gap${selectedCount === 1 ? "" : "s"}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
