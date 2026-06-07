"use client";

import { useTransition } from "react";
import { updateGapStatus } from "@/app/actions";
import {
  GAP_STATUSES,
  GAP_STATUS_LABELS,
  type GapStatus,
} from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function GapStatusSelect({
  gapId,
  projectId,
  status,
}: {
  gapId: string;
  projectId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      onValueChange={(value) =>
        startTransition(() =>
          updateGapStatus(gapId, projectId, String(value))
        )
      }
    >
      <SelectTrigger size="sm" className={isPending ? "w-40 opacity-60" : "w-40"}>
        <SelectValue>
          {(value: string) =>
            GAP_STATUS_LABELS[value as GapStatus] ?? value
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {GAP_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {GAP_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
