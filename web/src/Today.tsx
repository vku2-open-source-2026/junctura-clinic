// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionList, Button, PageHeader, Section, StatStrip, WorkspaceLayout, type ActionItem } from "@junctura/health-ui";
import { AlertTriangle, CalendarClock, ClipboardList, Users } from "lucide-react";
import { getOverview } from "./api";
import { formatLongDate } from "./format";
import { EventList, PatientLink, UrgencyBadge } from "./parts";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { Overview } from "./types";

function actionsOf(overview: Overview): ActionItem[] {
  const { counts, severeAllergy } = overview;
  const items: ActionItem[] = [];
  if (counts.severeAllergy > 0) {
    items.push({
      id: "allergy", tone: "danger", title: `${counts.severeAllergy} người bệnh có dị ứng nặng`,
      detail: severeAllergy.map(patient => patient.patientName).join(", "), actionLabel: "Xem danh sách", onAction: () => navigate("/patients?f=allergy"),
    });
  }
  if (counts.vaccinesOverdue > 0) items.push({ id: "overdue", tone: "warn", title: `${counts.vaccinesOverdue} mũi tiêm quá hạn`, detail: "Theo lịch tiêm mẫu của bản demo", actionLabel: "Mở lịch tiêm", onAction: () => navigate("/vaccinations") });
  if (counts.vaccinesSoon > 0) items.push({ id: "soon", tone: "brand", title: `${counts.vaccinesSoon} mũi tiêm sắp đến hạn trong 30 ngày`, actionLabel: "Mở lịch tiêm", onAction: () => navigate("/vaccinations") });
  if (counts.referrals30d > 0) items.push({ id: "referrals", tone: "brand", title: `${counts.referrals30d} phiếu chuyển tuyến trong 30 ngày`, actionLabel: "Xem phiếu", onAction: () => navigate("/referrals") });
  return items;
}

export function Today() {
  const { settings, facility } = useSession();
  const { state, reload } = useRemote(signal => getOverview(settings, signal), [settings]);
  return (
    <div className="space-y-6">
      <PageHeader title="Hôm nay" meta={state.status === "ready" ? `${formatLongDate(state.data.today)} · ${facility}` : facility}
        actions={<Button variant="secondary" onClick={() => navigate("/patients")}>Mở danh sách bệnh nhân</Button>} />
      <Remote state={state} reload={reload}>
        {overview => (
          <div className="space-y-6">
            <StatStrip items={[
              { label: "Người bệnh", value: overview.counts.patients, icon: <Users aria-hidden className="size-4" />, hint: "Hồ sơ tại trạm" },
              { label: "Lượt khám 30 ngày", value: overview.counts.encounters30d, icon: <ClipboardList aria-hidden className="size-4" />, hint: "Tính đến hôm nay" },
              { label: "Dị ứng nặng", value: overview.counts.severeAllergy, icon: <AlertTriangle aria-hidden className="size-4" />, hint: "Cần chú ý khi kê thuốc, tiêm", tone: overview.counts.severeAllergy > 0 ? "danger" : "neutral" },
              { label: "Mũi tiêm quá hạn", value: overview.counts.vaccinesOverdue, icon: <CalendarClock aria-hidden className="size-4" />, hint: `${overview.counts.vaccinesSoon} mũi sắp đến hạn`, tone: overview.counts.vaccinesOverdue > 0 ? "warn" : "neutral" },
            ]} />
          <WorkspaceLayout asideLabel="Chuyển tuyến gần đây"
            aside={<>
              <Section title="Chuyển tuyến gần đây">
                {overview.recentReferrals.length === 0 ? <p className="text-sm text-muted">Chưa có phiếu chuyển tuyến.</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {overview.recentReferrals.map(referral => (
                      <li key={referral.referralId} className="space-y-0.5 px-4 py-2.5">
                        <p className="flex flex-wrap items-center gap-2"><PatientLink id={referral.patientId} name={referral.patientName} /><UrgencyBadge urgency={referral.urgency} /></p>
                        <p className="text-sm text-ink-2">{referral.toFacility}</p>
                        <p className="text-sm text-muted">{referral.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>}>
            <Section title="Cần xử lý" description="Việc nên làm trước trong ca trực này." count={actionsOf(overview).length}>
              <ActionList label="Việc cần xử lý" items={actionsOf(overview)} empty="Không có việc tồn đọng." />
            </Section>
            <Section title="Khám gần đây" description="Các lượt khám mới ghi nhận tại trạm.">
              {overview.recentEncounters.length === 0 ? <p className="text-sm text-muted">Chưa có lượt khám.</p> : (
                <EventList label="Lượt khám gần đây" events={overview.recentEncounters.map((item, index) => ({
                  id: `${item.patientId}-${index}`, date: item.date, title: <PatientLink id={item.patientId} name={item.patientName} />, detail: [item.reason, item.diagnosis?.name].filter(Boolean).join(" · "),
                }))} />
              )}
            </Section>
          </WorkspaceLayout>
          </div>
        )}
      </Remote>
    </div>
  );
}
