// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, type Tone } from "@junctura/health-ui";
import type { ReactNode } from "react";
import type { HistoryEvent } from "./domain";
import { formatDate, urgencyLabel } from "./format";
import { Link } from "./router";

export const PatientLink = ({ id, name }: { id: string; name: string }) => <Link to={`/patients/${encodeURIComponent(id)}`} className="font-medium text-brand underline-offset-2 hover:underline">{name}</Link>;

export const URGENCY_TONE: Record<string, Tone> = { routine: "neutral", urgent: "warn", emergency: "danger" };
export const UrgencyBadge = ({ urgency }: { urgency: string }) => <Badge tone={URGENCY_TONE[urgency] ?? "neutral"}>{urgencyLabel(urgency)}</Badge>;

const KIND: Record<HistoryEvent["kind"], { label: string; tone: Tone }> = { visit: { label: "Khám", tone: "brand" }, vaccine: { label: "Tiêm", tone: "ok" }, referral: { label: "Chuyển tuyến", tone: "warn" } };

/** Dated list of events. Dates only (no clock time), so it does not use the library Timeline. */
export function EventList({ events, label, who }: { events: { id: string; date: string; kind?: HistoryEvent["kind"]; title: ReactNode; detail?: string }[]; label: string; who?: boolean }) {
  return (
    <ol aria-label={label} className="relative space-y-4 border-l border-line pl-5">
      {events.map(event => (
        <li key={event.id} className="relative">
          <span aria-hidden className="absolute -left-[1.62rem] top-1.5 size-2.5 rounded-full bg-brand ring-4 ring-app" />
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <time dateTime={event.date}>{formatDate(event.date)}</time>
            {event.kind && <Badge tone={KIND[event.kind].tone}>{KIND[event.kind].label}</Badge>}
          </p>
          <p className={who ? "font-medium text-ink" : "font-medium text-ink"}>{event.title}</p>
          {event.detail && <p className="text-sm text-ink-2">{event.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
