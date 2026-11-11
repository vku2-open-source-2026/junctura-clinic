// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { severityLabel } from "./format";
import type { Severity } from "./types";

export function Card({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
        {count !== undefined && <span className="text-xs text-slate-500">{count}</span>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-slate-500">{children}</p>;

const SEVERITY_STYLE: Record<Severity, string> = {
  severe: "bg-red-100 text-red-800 ring-red-200",
  moderate: "bg-amber-100 text-amber-800 ring-amber-200",
  mild: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SEVERITY_STYLE[severity]}`}>{severityLabel(severity)}</span>
);

export const Notice = ({ tone, children }: { tone: "error" | "info"; children: ReactNode }) => (
  <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-700"}`}>
    {children}
  </div>
);
