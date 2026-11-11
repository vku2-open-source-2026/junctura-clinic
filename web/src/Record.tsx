// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionList, AiSummaryPanel, AlertBanner, Badge, Button, PatientBanner, Section, SourceBadge, StaleNotice, TabPanel, Tabs, WorkspaceLayout } from "@junctura/health-ui";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { getPatient } from "./api";
import { allergyView, historyOf, PATIENT_TABS, type PatientTab } from "./domain";
import { formatDate, severityLabel } from "./format";
import { EventList, UrgencyBadge } from "./parts";
import { dueLabel } from "./Lists";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { PatientRecord } from "./types";

const TAB_LABEL: Record<PatientTab, string> = { summary: "Tổng quan", medications: "Thuốc đang dùng", vaccinations: "Tiêm chủng", referrals: "Chuyển tuyến", history: "Lịch sử" };
const ID_BASE = "record";

function Empty({ children }: { children: string }) { return <p className="text-sm text-muted">{children}</p>; }

function Summary({ record }: { record: PatientRecord }) {
  return (
    <div className="space-y-6">
      <Section title="Bệnh mạn tính" count={record.chronicConditions.length}>
        {record.chronicConditions.length === 0 ? <Empty>Chưa ghi nhận bệnh mạn tính.</Empty> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {record.chronicConditions.map(item => <li key={item.code} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span className="font-medium text-ink">{item.name}</span><span className="text-sm text-muted">Từ {formatDate(item.since)}</span></li>)}
          </ul>
        )}
      </Section>
      <Section title="Khám gần đây" count={record.encounters.length}>
        {record.encounters.length === 0 ? <Empty>Chưa có lượt khám.</Empty> : (
          <EventList label="Lượt khám gần đây" events={record.encounters.slice(0, 5).map((item, index) => ({ id: `e${index}`, date: item.date, title: item.reason, detail: item.diagnosis?.name }))} />
        )}
      </Section>
    </div>
  );
}

export function PatientRecordPage({ patientId, tab }: { patientId: string; tab: PatientTab }) {
  const { settings, setCrumbs } = useSession();
  const { state, reload } = useRemote(signal => getPatient(settings, patientId, signal), [settings, patientId]);
  const name = state.status === "ready" ? state.data.patientName : null;
  useEffect(() => {
    if (!name) return;
    setCrumbs([name]);
    return () => setCrumbs([]);
  }, [name, setCrumbs]);
  const open = (next: string) => navigate(`/patients/${encodeURIComponent(patientId)}/${next}`);
  return (
    <Remote state={state} reload={reload}>
      {record => {
        const allergy = allergyView(record);
        const severe = record.allergies.some(item => item.severity === "severe");
        return (
          <div className="space-y-5">
            <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => navigate("/patients")}>Danh sách bệnh nhân</Button>
            <PatientBanner name={record.patientName} recordId={record.patientId} birthYear={record.birthYear} sex={record.sex} allergy={allergy} extra={record.ward} />
            {allergy.state === "recorded"
              ? <AlertBanner level={severe ? "critical" : "warning"} title={severe ? "Có dị ứng nặng" : "Có dị ứng đã ghi nhận"}>{record.allergies.map(item => `${item.substance}: ${item.reaction} (${severityLabel(item.severity).toLowerCase()})`).join("; ")}</AlertBanner>
              : <AlertBanner level="notice" title="Chưa ghi nhận dị ứng">Hồ sơ chưa có thông tin dị ứng. Hỏi lại người bệnh trước khi kê thuốc hoặc tiêm; không coi là không dị ứng.</AlertBanner>}
            <div className="flex flex-wrap items-center gap-3"><SourceBadge source="Junctura Clinic" unit="Trạm y tế" /><StaleNotice updatedAt={record.updatedAt} /></div>
            <Tabs label="Các phần của hồ sơ" idBase={ID_BASE} value={tab} onChange={open}
              items={PATIENT_TABS.map(id => ({ id, label: TAB_LABEL[id], count: id === "medications" ? record.currentMedications.length : id === "vaccinations" ? record.vaccinations.length : id === "referrals" ? record.referrals.length : undefined }))} />
            <WorkspaceLayout asideLabel="Nhắc việc và tóm tắt"
              aside={<>
                <Section title="Nhắc tiêm chủng" count={record.vaccinesDue.length}>
                  <ActionList label="Mũi tiêm cần nhắc" empty="Không có mũi tiêm cần nhắc." items={record.vaccinesDue.map(item => ({
                    id: item.code, tone: item.state === "overdue" ? "warn" : "brand", title: `${item.vaccine} · mũi ${item.nextDose}`, detail: `${dueLabel(item)} · hạn ${formatDate(item.due)}`,
                  }))} />
                </Section>
                <Section title="Tóm tắt"><AiSummaryPanel enabled={false} /></Section>
              </>}>
              <TabPanel tabsId={ID_BASE} id="summary" hidden={tab !== "summary"}><Summary record={record} /></TabPanel>
              <TabPanel tabsId={ID_BASE} id="medications" hidden={tab !== "medications"}>
                {record.currentMedications.length === 0 ? <Empty>Chưa ghi nhận thuốc đang dùng.</Empty> : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {record.currentMedications.map(item => <li key={item.name} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span><span className="font-medium text-ink">{item.name}</span> <span className="text-ink-2">{item.dose}</span></span><span className="text-sm text-muted">Từ {formatDate(item.since)}</span></li>)}
                  </ul>
                )}
              </TabPanel>
              <TabPanel tabsId={ID_BASE} id="vaccinations" hidden={tab !== "vaccinations"}>
                {record.vaccinations.length === 0 ? <Empty>Chưa có mũi tiêm nào.</Empty> : (
                  <EventList label="Các mũi đã tiêm" events={[...record.vaccinations].sort((a, b) => b.date.localeCompare(a.date)).map((item, index) => ({ id: `v${index}`, date: item.date, title: item.vaccine, detail: `Mũi ${item.doseNumber}` }))} />
                )}
              </TabPanel>
              <TabPanel tabsId={ID_BASE} id="referrals" hidden={tab !== "referrals"}>
                {record.referrals.length === 0 ? <Empty>Chưa có phiếu chuyển tuyến.</Empty> : (
                  <ul className="space-y-3">
                    {record.referrals.map(item => (
                      <li key={item.referralId} className="space-y-1 rounded-lg border border-line bg-surface px-4 py-3">
                        <p className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{item.toFacility}</span><UrgencyBadge urgency={item.urgency} /><Badge>{formatDate(item.issuedAt)}</Badge></p>
                        <p className="text-sm text-ink-2">{item.reason}</p>
                        {item.treatmentGiven && <p className="text-sm text-muted">Đã xử trí: {item.treatmentGiven}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </TabPanel>
              <TabPanel tabsId={ID_BASE} id="history" hidden={tab !== "history"}>
                {historyOf(record).length === 0 ? <Empty>Chưa có lịch sử.</Empty> : <EventList label="Lịch sử khám, tiêm và chuyển tuyến" events={historyOf(record)} />}
              </TabPanel>
            </WorkspaceLayout>
          </div>
        );
      }}
    </Remote>
  );
}
