"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Breakdown } from "@/lib/dashboard";

// Stacked open/closed bars, one per category (project or team).
export function BreakdownBarChart({ data }: { data: Breakdown[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            cursor={{ fill: "var(--muted)", opacity: 0.3 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="open" name="Open" stackId="a" fill="var(--destructive)" />
          <Bar dataKey="closed" name="Closed / done" stackId="a" fill="var(--primary)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
