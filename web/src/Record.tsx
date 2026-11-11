// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionList, AiSummaryPanel, AlertBanner, Badge, Button, ConfirmDialog, PatientBanner, Section, SourceBadge, StaleNotice, TabPanel, Tabs, WorkspaceLayout, useToast } from "@junctura/health-ui";
import { ArrowLeft, FileOutput, Pill, Plus, ShieldAlert, Stethoscope, Syringe } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, getPatient, getSummary, stopMedication } from "./api";
import { allergyView, encounterDetail, historyOf, PATIENT_TABS, type PatientTab } from "./domain";
import { AllergyDialog, ConditionDialog, ExamDialog, MedicationDialog, ReferralDialog, VaccinateDialog } from "./Forms";
import { formatDate, severityLabel } from "./format";
import { EventList, UrgencyBadge } from "./parts";
import { dueLabel } from "./Lists";
import { Link, navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { PatientRecord } from "./types";

const TAB_LABEL: Record<PatientTab, string> = { summary: "Tổng quan", medications: "Thuốc đang dùng", vaccinations: "Tiêm chủng", referrals: "Chuyển tuyến", history: "Lịch sử" };
const ID_BASE = "record";

function Empty({ children }: { children: string }) { return <p className="text-sm text-muted">{children}</p>; }

function Summary({ record, onAllergy, onCondition }: { record: PatientRecord; onAllergy?: () => void; onCondition?: () => void }) {
  return (
    <div className="space-y-6">
      {onAllergy && <Section title="Dị ứng" description="Cập nhật khi hỏi lại người bệnh. Chưa ghi nhận khác với không dị ứng."><Button variant="secondary" icon={<ShieldAlert aria-hidden className="size-4" />} onClick={onAllergy}>Cập nhật dị ứng</Button></Section>}
      <Section title="Bệnh mạn tính" count={record.chronicConditions.length} actions={onCondition ? <Button variant="ghost" icon={<Plus aria-hidden className="size-4" />} onClick={onCondition}>Thêm bệnh mạn tính</Button> : undefined}>
        {record.chronicConditions.length === 0 ? <Empty>Chưa ghi nhận bệnh mạn tính.</Empty> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {record.chronicConditions.map(item => <li key={item.code} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span className="font-medium text-ink">{item.name}</span><span className="text-sm text-muted">Từ {formatDate(item.since)}</span></li>)}
          </ul>
        )}
      </Section>
      <Section title="Khám gần đây" count={record.encounters.length}>
        {record.encounters.length === 0 ? <Empty>Chưa có lượt khám.</Empty> : (
          <EventList label="Lượt khám gần đây" events={record.encounters.slice(0, 5).map((item, index) => ({ id: `e${index}`, date: item.date, title: item.reason, detail: encounterDetail(item) }))} />
        )}
      </Section>
    </div>
  );
}

type Dialog = "exam" | "vaccinate" | "referral" | "allergy" | "condition" | "medication";

export function PatientRecordPage({ patientId, tab, search = "" }: { patientId: string; tab: PatientTab; search?: string }) {
  const { settings, setCrumbs, can, station, expire } = useSession();
  const { notify } = useToast();
  const { state, reload } = useRemote(signal => getPatient(settings, patientId, signal), [settings, patientId]);
  // After a save the server sends back the whole record; it replaces what was loaded without another request.
  const [fresh, setFresh] = useState<PatientRecord | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [stopping, setStopping] = useState<{ id: number; name: string } | null>(null);
  const [summary, setSummary] = useState<{ loading: boolean; text?: string }>({ loading: false });
  const rawQueue = Number(new URLSearchParams(search).get("queue"));
  const queueId = Number.isInteger(rawQueue) && rawQueue > 0 ? rawQueue : undefined;
  useEffect(() => { setFresh(null); setSummary({ loading: false }); }, [patientId]);
  const saved = (message: string) => (record: PatientRecord) => { setFresh(record); setSummary({ loading: false }); notify(message, "ok"); };
  const generate = async () => {
    setSummary({ loading: true });
    try { setSummary({ loading: false, text: (await getSummary(settings, patientId)).lines.join("\n") }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) return expire();
      setSummary({ loading: false }); notify("Chưa soạn được bản tóm tắt.", "danger");
    }
  };
  const confirmStop = async () => {
    if (!stopping) return;
    try { setFresh(await stopMedication(settings, patientId, stopping.id)); notify(`Đã ngừng ${stopping.name}`, "ok"); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return expire(); notify("Chưa ngừng được thuốc. Hãy thử lại.", "danger"); }
    setStopping(null);
  };
  const name = state.status === "ready" ? state.data.patientName : null;
  useEffect(() => {
    if (!name) return;
    setCrumbs([name]);
    return () => setCrumbs([]);
  }, [name, setCrumbs]);
  const open = (next: string) => navigate(`/patients/${encodeURIComponent(patientId)}/${next}`);
  return (
    <Remote state={state} reload={reload}>
      {loaded => {
        const record = fresh && fresh.patientId === loaded.patientId ? fresh : loaded;
        const allergy = allergyView(record);
        const severe = record.allergies.some(item => item.severity === "severe");
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => navigate(queueId ? "/reception" : "/patients")}>{queueId ? "Hàng chờ khám" : "Danh sách bệnh nhân"}</Button>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Thao tác với hồ sơ">
                {can("exam") && <Button icon={<Stethoscope aria-hidden className="size-4" />} onClick={() => setDialog("exam")}>Ghi lượt khám</Button>}
                {can("vaccinate") && <Button variant="secondary" icon={<Syringe aria-hidden className="size-4" />} onClick={() => setDialog("vaccinate")}>Ghi mũi tiêm</Button>}
                {can("refer") && <Button variant="secondary" icon={<FileOutput aria-hidden className="size-4" />} onClick={() => setDialog("referral")}>Lập phiếu chuyển tuyến</Button>}
              </div>
            </div>
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
                <Section title="Tóm tắt"><AiSummaryPanel enabled={station.aiSummary} kind="template" summary={summary.text} loading={summary.loading} onGenerate={() => void generate()} /></Section>
              </>}>
              <TabPanel tabsId={ID_BASE} id="summary" hidden={tab !== "summary"}><Summary record={record} onAllergy={can("exam") ? () => setDialog("allergy") : undefined} onCondition={can("exam") ? () => setDialog("condition") : undefined} /></TabPanel>
              <TabPanel tabsId={ID_BASE} id="medications" hidden={tab !== "medications"}>
                {can("exam") && <div className="mb-3"><Button variant="secondary" icon={<Pill aria-hidden className="size-4" />} onClick={() => setDialog("medication")}>Thêm thuốc đang dùng</Button></div>}
                {record.currentMedications.length === 0 ? <Empty>Chưa ghi nhận thuốc đang dùng.</Empty> : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {record.currentMedications.map(item => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <span><span className="font-medium text-ink">{item.name}</span> <span className="text-ink-2">{item.dose}</span></span>
                        <span className="flex items-center gap-3 text-sm text-muted">Từ {formatDate(item.since)}{can("exam") && <Button variant="ghost" onClick={() => setStopping({ id: item.id, name: item.name })}>Ngừng thuốc</Button>}</span>
                      </li>
                    ))}
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
                        <p className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{item.toFacility}</span><UrgencyBadge urgency={item.urgency} /><Badge>{formatDate(item.issuedAt)}</Badge><Link to={`/phieu-chuyen-tuyen/${encodeURIComponent(record.patientId)}/${encodeURIComponent(item.referralId)}`} className="text-sm font-medium text-brand underline-offset-2 hover:underline">Xem và in phiếu</Link></p>
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
            {dialog === "exam" && <ExamDialog record={record} queueId={queueId} open onClose={() => setDialog(null)} onSaved={saved("Đã lưu lượt khám")} />}
            {dialog === "vaccinate" && <VaccinateDialog record={record} open onClose={() => setDialog(null)} onSaved={saved("Đã ghi mũi tiêm")} />}
            {dialog === "referral" && <ReferralDialog record={record} open onClose={() => setDialog(null)} onSaved={result => { saved(`Đã lập phiếu ${result.referralId}`)(result.record); navigate(`/phieu-chuyen-tuyen/${encodeURIComponent(record.patientId)}/${encodeURIComponent(result.referralId)}`); }} />}
            {dialog === "allergy" && <AllergyDialog record={record} open onClose={() => setDialog(null)} onSaved={saved("Đã cập nhật dị ứng")} />}
            {dialog === "condition" && <ConditionDialog record={record} open onClose={() => setDialog(null)} onSaved={saved("Đã thêm bệnh mạn tính")} />}
            {dialog === "medication" && <MedicationDialog record={record} open onClose={() => setDialog(null)} onSaved={saved("Đã thêm thuốc")} />}
            <ConfirmDialog open={stopping !== null} title={`Ngừng ${stopping?.name ?? "thuốc"}?`} description="Thuốc sẽ rời danh sách đang dùng. Việc này được ghi vào nhật ký." danger confirmLabel="Ngừng thuốc" onConfirm={() => void confirmStop()} onCancel={() => setStopping(null)} />
          </div>
        );
      }}
    </Remote>
  );
}
