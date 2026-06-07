"use client";

import { useTransition } from "react";
import { updateWorkStatus } from "@/app/actions";
import {
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Status dropdown shared by Actions and Tasks. `kind` routes to the right table.
export function WorkStatusSelect({
  kind,
  id,
  projectId,
  gapId,
  status,
}: {
  kind: "action" | "task";
  id: string;
  projectId: string;
  gapId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      onValueChange={(value) =>
        startTransition(() =>
          updateWorkStatus(kind, id, projectId, gapId, String(value))
        )
      }
    >
      <SelectTrigger size="sm" className={isPending ? "w-36 opacity-60" : "w-36"}>
        <SelectValue>
          {(value: string) =>
            WORK_STATUS_LABELS[value as WorkStatus] ?? value
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {WORK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {WORK_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
