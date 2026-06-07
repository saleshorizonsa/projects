"use client";

import { useTransition } from "react";
import { updateRequirementStatus } from "@/app/actions";
import { REQUIREMENT_STATUSES } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RequirementStatusSelect({
  reqId,
  projectId,
  gapId,
  status,
}: {
  reqId: string;
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
          updateRequirementStatus(reqId, projectId, gapId, String(value))
        )
      }
    >
      <SelectTrigger size="sm" className={isPending ? "w-36 opacity-60" : "w-36"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REQUIREMENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
