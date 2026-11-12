// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, SelectField, type QueueItem, type Tone } from "@junctura/health-ui";
import type { ReactNode } from "react";
import type { HistoryEvent } from "./domain";
import { ageOf, formatDate, formatDateTime, sexLabel, urgencyLabel } from "./format";
import { Link } from "./router";
import type { QueueEntry, Referral, ReferralStatus } from "./types";

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

/** A queue row for the library QueueList: urgent, young and old people first get a marker; allergies show as a badge. */
export function toQueueItem(entry: QueueEntry, extra?: ReactNode): QueueItem {
  const age = ageOf(entry.birthYear);
  return {
    id: String(entry.id), ticket: entry.ticket, name: entry.patientName, meta: `${entry.patientId} · ${age} tuổi · ${sexLabel(entry.sex)}`,
    priority: entry.priority === "urgent" ? "urgent" : entry.group === "child" ? "child" : entry.group === "senior" ? "elder" : undefined, since: entry.since, note: entry.reason,
    flags: <>
      {entry.severeAllergy ? <Badge tone="danger">Dị ứng nặng</Badge> : entry.allergyState === "not-recorded" ? <Badge tone="warn">Chưa ghi nhận dị ứng</Badge> : null}
      {extra}
    </>,
  };
}

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; tone: Tone }> = {
  issued: { label: "Đã lập phiếu", tone: "neutral" }, received: { label: "Bệnh viện đã tiếp nhận", tone: "ok" }, cancelled: { label: "Đã hủy", tone: "warn" },
};

/** Where a referral stands: the staff-set status, and whether the receiving side has read it through Junctura. */
export function ReferralProgress({ referral, onStatus }: { referral: Referral; onStatus?: (status: ReferralStatus) => void }) {
  const info = REFERRAL_STATUS[referral.status] ?? REFERRAL_STATUS.issued;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={info.tone}>{info.label}</Badge>
      <span className="text-muted">{referral.viewCount ? `Bệnh viện đã xem qua Junctura ${referral.viewCount} lần, gần nhất ${formatDateTime(referral.viewedAt ?? "")}` : "Bệnh viện chưa xem qua Junctura"}</span>
      {onStatus && (
        <span className="w-48"><SelectField label="Đổi trạng thái" value={referral.status} onChange={event => onStatus(event.target.value as ReferralStatus)}
          options={(Object.keys(REFERRAL_STATUS) as ReferralStatus[]).map(value => ({ value, label: REFERRAL_STATUS[value].label }))} /></span>
      )}
    </div>
  );
}
