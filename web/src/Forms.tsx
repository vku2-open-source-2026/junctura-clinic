// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AlertBanner, Button, Dialog, SelectField, TextAreaField, TextField, useToast } from "@junctura/health-ui";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { addCondition, addEncounter, addMedication, addReferral, addVaccination, ApiError, createPatient, enqueue, saveAllergies } from "./api";
import { nextDoseOf, VACCINES } from "./domain";
import { PatientLink } from "./parts";
import { useSession } from "./session";
import type { AllergyConflict, PatientRecord, PatientSummary, Severity } from "./types";

type Errors = Record<string, string>;

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [{ value: "mild", label: "Nhẹ" }, { value: "moderate", label: "Vừa" }, { value: "severe", label: "Nặng" }];
const URGENCY_OPTIONS = [{ value: "routine", label: "Thường" }, { value: "urgent", label: "Khẩn" }, { value: "emergency", label: "Cấp cứu" }];
const SEX_OPTIONS = [{ value: "male", label: "Nam" }, { value: "female", label: "Nữ" }];

/** Drops empty strings so optional fields are simply not sent. */
const only = <T extends Record<string, unknown>>(object: T): Partial<T> => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== undefined)) as Partial<T>;

interface Submit<T> { saving: boolean; errors: Errors; general: string | null; run: (action: () => Promise<T>, done: (result: T) => void, extra?: (error: ApiError) => boolean) => Promise<void>; reset: () => void }

/** Runs one save: shows field messages from a 422, lets the caller handle special 409 answers, and keeps the dialog open on any failure. */
function useSubmit<T>(): Submit<T> {
  const { expire } = useSession();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  return {
    saving, errors, general,
    reset: () => { setErrors({}); setGeneral(null); },
    async run(action, done, extra) {
      setSaving(true);
      setErrors({});
      setGeneral(null);
      try {
        done(await action());
      } catch (error) {
        if (!(error instanceof ApiError)) setGeneral("Không kết nối được máy chủ Clinic. Dữ liệu chưa được lưu, hãy thử lại.");
        else if (error.status === 401) expire();
        else if (extra?.(error)) return;
        else if (error.status === 422) setErrors(error.fields);
        else if (error.status === 403) setGeneral("Vai trò của bạn không được làm thao tác này.");
        else if (error.status === 404) setGeneral("Không tìm thấy hồ sơ này nữa. Tải lại trang rồi thử lại.");
        else if (error.code === "series-complete") setGeneral("Người bệnh đã tiêm đủ các mũi của vắc xin này theo lịch của bản demo.");
        else if (error.code === "duplicate-vaccination") setGeneral("Đã có mũi tiêm vắc xin này trong cùng ngày.");
        else setGeneral("Chưa lưu được. Hãy thử lại; nếu vẫn lỗi, báo quản trị viên.");
      } finally {
        setSaving(false);
      }
    },
  };
}

/** Messages of fields that have no input of their own (for example the whole vitals group). */
function Unplaced({ errors, shown }: { errors: Errors; shown: string[] }) {
  const rest = Object.entries(errors).filter(([key]) => !shown.includes(key));
  if (!rest.length) return null;
  return <AlertBanner level="warning" title="Kiểm tra lại thông tin">{rest.map(([, message]) => message).join(" ")}</AlertBanner>;
}

function FormDialog({ open, title, onClose, onSubmit, submit, submitLabel, children, extraFooter }: {
  open: boolean; title: string; onClose: () => void; onSubmit: () => void; submit: Pick<Submit<unknown>, "saving" | "general">; submitLabel: string; children: ReactNode; extraFooter?: ReactNode;
}) {
  const id = useId();
  return (
    <Dialog open={open} title={title} onClose={onClose}
      footer={<>{extraFooter}<Button variant="ghost" onClick={onClose}>Hủy</Button><Button type="submit" form={id} loading={submit.saving}>{submitLabel}</Button></>}>
      <form id={id} noValidate className="space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }}>
        {submit.general && <AlertBanner level="critical" title="Chưa lưu được">{submit.general}</AlertBanner>}
        {children}
      </form>
    </Dialog>
  );
}

/** Shown when the server found a medicine that matches a recorded allergy. Staff must confirm and say why. */
function AllergyOverride({ conflicts, confirmed, reason, onConfirmed, onReason, error }: {
  conflicts: AllergyConflict[]; confirmed: boolean; reason: string; onConfirmed: (value: boolean) => void; onReason: (value: string) => void; error?: string;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
      <AlertBanner level="critical" title="Cảnh báo dị ứng">
        {conflicts.map(item => `${item.medicine} trùng với dị ứng đã ghi nhận: ${item.allergen} (${item.severity === "severe" ? "nặng" : item.severity === "moderate" ? "vừa" : "nhẹ"})`).join("; ")}.
        Bỏ thuốc này, hoặc xác nhận bên dưới nếu đã hỏi lại người bệnh.
      </AlertBanner>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-1 size-4" checked={confirmed} onChange={event => onConfirmed(event.target.checked)} />
        <span>Tôi đã hỏi lại người bệnh và vẫn kê thuốc này</span>
      </label>
      {confirmed && <TextField label="Lý do kê thuốc dù có cảnh báo" required value={reason} onChange={event => onReason(event.target.value)} error={error} />}
    </div>
  );
}

// ---------------------------------------------------------------- new patient

/** With `withQueue`, the new person also gets a ticket in today's line in the same step. */
export function NewPatientDialog({ open, onClose, onCreated, withQueue = false }: { open: boolean; onClose: () => void; onCreated: (record: PatientRecord) => void; withQueue?: boolean }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<{ record: PatientRecord; ticket: string | null }>();
  const [form, setForm] = useState({ patientName: "", birthYear: "", sex: "", ward: "", phone: "" });
  const [matches, setMatches] = useState<PatientSummary[]>([]);
  const [visit, setVisit] = useState({ reason: "", urgent: false });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));
  const close = () => { setForm({ patientName: "", birthYear: "", sex: "", ward: "", phone: "" }); setVisit({ reason: "", urgent: false }); setMatches([]); submit.reset(); onClose(); };
  const save = (confirmDuplicate = false) => submit.run(
    async () => {
      if (withQueue && visit.reason.trim().length < 2) throw new ApiError(422, "invalid", { error: "invalid", fields: { reason: "Hãy nhập lý do đến khám." } });
      const record = await createPatient(settings, only({ ...form, birthYear: form.birthYear.trim(), confirmDuplicate }));
      if (!withQueue) return { record, ticket: null as string | null };
      try {
        const entry = await enqueue(settings, { patientId: record.patientId, reason: visit.reason, priority: visit.urgent ? "urgent" : "normal" });
        return { record, ticket: entry.ticket };
      } catch {
        return { record, ticket: null }; // the record exists; staff can queue the person from the search box
      }
    },
    ({ record, ticket }) => {
      notify(ticket ? `Đã thêm ${record.patientName} (${record.patientId}), số ${ticket}` : `Đã thêm ${record.patientName} (${record.patientId})${withQueue ? ". Chưa xếp được hàng chờ, hãy thêm lại ở khung bên phải." : ""}`, ticket || !withQueue ? "ok" : "danger");
      close(); onCreated(record);
    },
    error => {
      if (error.code !== "possible-duplicate") return false;
      setMatches((error.body.matches as PatientSummary[]) ?? []);
      return true;
    },
  );
  const e = submit.errors;
  return (
    <FormDialog open={open} title="Thêm người bệnh mới" onClose={close} onSubmit={() => save()} submit={submit} submitLabel={withQueue ? "Thêm và lấy số" : "Thêm người bệnh"}>
      <p className="text-sm text-muted">Chỉ cần thông tin để nhận diện. Dị ứng, bệnh mạn tính và thuốc ghi trong hồ sơ khi khám.</p>
      <TextField label="Họ và tên" required value={form.patientName} onChange={set("patientName")} error={e.patientName} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Năm sinh" required inputMode="numeric" maxLength={4} value={form.birthYear} onChange={set("birthYear")} error={e.birthYear} />
        <SelectField label="Giới tính" required value={form.sex} onChange={set("sex")} options={SEX_OPTIONS} placeholder="Chọn" error={e.sex} />
      </div>
      <TextField label="Xã/phường" required value={form.ward} onChange={set("ward")} error={e.ward} />
      <TextField label="Số điện thoại" hint="Không bắt buộc" inputMode="tel" value={form.phone} onChange={set("phone")} error={e.phone} />
      {withQueue && (
        <>
          <TextAreaField label="Lý do đến khám" required rows={2} value={visit.reason} onChange={event => setVisit(value => ({ ...value, reason: event.target.value }))} error={e.reason} hint="Người này sẽ được cấp số thứ tự ngay" />
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="size-4" checked={visit.urgent} onChange={event => setVisit(value => ({ ...value, urgent: event.target.checked }))} />Ưu tiên khẩn</label>
        </>
      )}
      <Unplaced errors={e} shown={["patientName", "birthYear", "sex", "ward", "phone", ...(withQueue ? ["reason"] : [])]} />
      {matches.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warn/40 bg-warn/5 p-4">
          <AlertBanner level="warning" title="Có thể đã có hồ sơ này">Đã có người cùng họ tên và năm sinh. Mở hồ sơ cũ thay vì tạo trùng.</AlertBanner>
          <ul className="space-y-1 text-sm">{matches.map(match => <li key={match.patientId}><PatientLink id={match.patientId} name={`${match.patientName} (${match.patientId})`} /> · {match.ward}</li>)}</ul>
          <Button variant="secondary" loading={submit.saving} onClick={() => save(true)}>Đây là người khác, vẫn thêm mới</Button>
        </div>
      )}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- exam

interface PrescriptionRow { name: string; dose: string; ongoing: boolean }
const EMPTY_EXAM = { reason: "", temperatureC: "", pulse: "", systolic: "", diastolic: "", spo2: "", weightKg: "", diagnosisCode: "", diagnosisName: "", notes: "", advice: "" };

export function ExamDialog({ record, queueId, open, onClose, onSaved }: { record: PatientRecord; queueId?: number; open: boolean; onClose: () => void; onSaved: (record: PatientRecord) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<PatientRecord>();
  const [form, setForm] = useState(EMPTY_EXAM);
  const [rows, setRows] = useState<PrescriptionRow[]>([]);
  const [conflicts, setConflicts] = useState<AllergyConflict[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));
  const setRow = (index: number, patch: Partial<PrescriptionRow>) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const close = () => { setForm(EMPTY_EXAM); setRows([]); setConflicts([]); setConfirmed(false); setReason(""); submit.reset(); onClose(); };

  const save = () => submit.run(
    () => addEncounter(settings, record.patientId, {
      reason: form.reason,
      vitals: only({ temperatureC: form.temperatureC, pulse: form.pulse, systolic: form.systolic, diastolic: form.diastolic, spo2: form.spo2, weightKg: form.weightKg }),
      diagnosis: form.diagnosisName ? only({ code: form.diagnosisCode, name: form.diagnosisName }) : undefined,
      notes: form.notes, advice: form.advice, queueId,
      prescriptions: rows.filter(row => row.name || row.dose).map(row => ({ name: row.name, dose: row.dose, ongoing: row.ongoing })),
      overrideAllergy: confirmed, overrideReason: confirmed ? reason : undefined,
    }),
    saved => { notify("Đã lưu lượt khám", "ok"); close(); onSaved(saved); },
    error => {
      if (error.code !== "allergy-conflict") return false;
      setConflicts((error.body.conflicts as AllergyConflict[]) ?? []);
      return true;
    },
  );
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Ghi lượt khám · ${record.patientName}`} onClose={close} onSubmit={save} submit={submit} submitLabel="Lưu lượt khám">
      <TextField label="Lý do khám" required value={form.reason} onChange={set("reason")} error={e.reason} />
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-ink">Sinh hiệu <span className="font-normal text-muted">(không bắt buộc)</span></legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextField label="Nhiệt độ (°C)" inputMode="decimal" value={form.temperatureC} onChange={set("temperatureC")} />
          <TextField label="Mạch (lần/phút)" inputMode="numeric" value={form.pulse} onChange={set("pulse")} />
          <TextField label="SpO2 (%)" inputMode="numeric" value={form.spo2} onChange={set("spo2")} />
          <TextField label="Huyết áp tâm thu" inputMode="numeric" value={form.systolic} onChange={set("systolic")} />
          <TextField label="Huyết áp tâm trương" inputMode="numeric" value={form.diastolic} onChange={set("diastolic")} />
          <TextField label="Cân nặng (kg)" inputMode="decimal" value={form.weightKg} onChange={set("weightKg")} />
        </div>
        {e.vitals && <p role="alert" className="text-sm text-danger">{e.vitals}</p>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <TextField label="Mã bệnh" hint="ICD-10" value={form.diagnosisCode} onChange={set("diagnosisCode")} />
        <TextField label="Chẩn đoán" value={form.diagnosisName} onChange={set("diagnosisName")} error={e.diagnosis} />
      </div>
      <TextAreaField label="Ghi chú khám" value={form.notes} onChange={set("notes")} error={e.notes} rows={3} />
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-ink">Thuốc kê</legend>
        {rows.map((row, index) => (
          <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <TextField label="Tên thuốc" value={row.name} onChange={event => setRow(index, { name: event.target.value })} />
            <TextField label="Liều dùng" value={row.dose} onChange={event => setRow(index, { dose: event.target.value })} />
            <label className="flex items-center gap-2 pb-2 text-sm text-ink"><input type="checkbox" className="size-4" checked={row.ongoing} onChange={event => setRow(index, { ongoing: event.target.checked })} />Dùng lâu dài</label>
            <Button variant="ghost" aria-label={`Xóa thuốc ${index + 1}`} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setRows(list => list.filter((_, i) => i !== index))} />
          </div>
        ))}
        {e.prescriptions && <p role="alert" className="text-sm text-danger">{e.prescriptions}</p>}
        {rows.length < 10 && <Button variant="secondary" icon={<Plus aria-hidden className="size-4" />} onClick={() => setRows(list => [...list, { name: "", dose: "", ongoing: false }])}>Thêm thuốc</Button>}
      </fieldset>
      <AllergyOverride conflicts={conflicts} confirmed={confirmed} reason={reason} onConfirmed={setConfirmed} onReason={setReason} error={e.overrideReason} />
      <TextAreaField label="Dặn dò" value={form.advice} onChange={set("advice")} error={e.advice} rows={2} />
      <Unplaced errors={e} shown={["reason", "vitals", "diagnosis", "notes", "prescriptions", "overrideReason", "advice"]} />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- vaccination

export function VaccinateDialog({ record, code, open, onClose, onSaved }: { record: PatientRecord; code?: string; open: boolean; onClose: () => void; onSaved: (record: PatientRecord) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<PatientRecord>();
  const [chosen, setChosen] = useState(code ?? "");
  const [lot, setLot] = useState("");
  const [date, setDate] = useState("");
  const vaccine = VACCINES.find(item => item.code === chosen);
  const dose = chosen ? nextDoseOf(record, chosen) : null;
  const close = () => { setLot(""); setDate(""); submit.reset(); onClose(); };
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Ghi mũi tiêm · ${record.patientName}`} onClose={close} submit={submit} submitLabel="Ghi mũi tiêm"
      onSubmit={() => submit.run(() => addVaccination(settings, record.patientId, only({ code: chosen, date, lot })), saved => { notify("Đã ghi mũi tiêm", "ok"); close(); onSaved(saved); })}>
      {record.allergyState !== "recorded" && <AlertBanner level="notice" title="Chưa có thông tin dị ứng rõ ràng">Hỏi lại người bệnh về dị ứng trước khi tiêm.</AlertBanner>}
      <SelectField label="Vắc xin" required value={chosen} onChange={event => setChosen(event.target.value)} placeholder="Chọn vắc xin" error={e.code}
        options={VACCINES.map(item => ({ value: item.code, label: item.name }))} />
      {vaccine && (dose === null
        ? <AlertBanner level="warning" title="Đã đủ các mũi">Người bệnh đã tiêm đủ {vaccine.doses} mũi theo lịch của bản demo.</AlertBanner>
        : <p className="text-sm text-ink-2">Sẽ ghi là <strong>mũi {dose}</strong>{vaccine.doses ? ` (trên ${vaccine.doses} mũi)` : " (tiêm nhắc hằng năm)"}.</p>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Ngày tiêm" type="date" hint="Để trống là hôm nay" value={date} onChange={event => setDate(event.target.value)} error={e.date} />
        <TextField label="Số lô" hint="Không bắt buộc" value={lot} onChange={event => setLot(event.target.value)} error={e.lot} />
      </div>
      <Unplaced errors={e} shown={["code", "date", "lot"]} />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- referral

export function ReferralDialog({ record, open, onClose, onSaved }: { record: PatientRecord; open: boolean; onClose: () => void; onSaved: (result: { referralId: string; record: PatientRecord }) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<{ referralId: string; record: PatientRecord }>();
  const [form, setForm] = useState({ toFacility: "", urgency: "routine", reason: "", diagnosisCode: "", diagnosisName: "", treatmentGiven: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));
  const close = () => { setForm({ toFacility: "", urgency: "routine", reason: "", diagnosisCode: "", diagnosisName: "", treatmentGiven: "" }); submit.reset(); onClose(); };
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Lập phiếu chuyển tuyến · ${record.patientName}`} onClose={close} submit={submit} submitLabel="Lập phiếu"
      onSubmit={() => submit.run(() => addReferral(settings, record.patientId, {
        toFacility: form.toFacility, urgency: form.urgency, reason: form.reason, treatmentGiven: form.treatmentGiven,
        provisionalDiagnosis: form.diagnosisName ? only({ code: form.diagnosisCode, name: form.diagnosisName }) : undefined,
      }), result => { notify(`Đã lập phiếu ${result.referralId}`, "ok"); close(); onSaved(result); })}>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <TextField label="Chuyển đến" required value={form.toFacility} onChange={set("toFacility")} error={e.toFacility} hint="Ví dụ: Bệnh viện Đà Nẵng" />
        <SelectField label="Mức độ" required value={form.urgency} onChange={set("urgency")} options={URGENCY_OPTIONS} error={e.urgency} />
      </div>
      <TextAreaField label="Lý do chuyển tuyến" required rows={3} value={form.reason} onChange={set("reason")} error={e.reason} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <TextField label="Mã bệnh" hint="ICD-10" value={form.diagnosisCode} onChange={set("diagnosisCode")} />
        <TextField label="Chẩn đoán sơ bộ" value={form.diagnosisName} onChange={set("diagnosisName")} error={e.provisionalDiagnosis} />
      </div>
      <TextAreaField label="Đã xử trí tại trạm" rows={2} value={form.treatmentGiven} onChange={set("treatmentGiven")} error={e.treatmentGiven} />
      <p className="text-sm text-muted">Phiếu kèm thông tin dị ứng của người bệnh. Bệnh viện chỉ xem hồ sơ qua Junctura khi người bệnh đồng ý.</p>
      <Unplaced errors={e} shown={["toFacility", "urgency", "reason", "provisionalDiagnosis", "treatmentGiven"]} />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- allergies

interface AllergyRow { substance: string; severity: Severity; reaction: string }

export function AllergyDialog({ record, open, onClose, onSaved }: { record: PatientRecord; open: boolean; onClose: () => void; onSaved: (record: PatientRecord) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<PatientRecord>();
  const [rows, setRows] = useState<AllergyRow[]>(() => record.allergies.map(item => ({ ...item })));
  const [none, setNone] = useState(record.allergyState === "none-known");
  const setRow = (index: number, patch: Partial<AllergyRow>) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const close = () => { submit.reset(); onClose(); };
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Dị ứng · ${record.patientName}`} onClose={close} submit={submit} submitLabel="Lưu dị ứng"
      onSubmit={() => submit.run(() => saveAllergies(settings, record.patientId, { noKnownAllergies: rows.length === 0 && none, items: rows }), saved => { notify("Đã cập nhật dị ứng", "ok"); close(); onSaved(saved); })}>
      <p className="text-sm text-muted">Hỏi người bệnh về thuốc, thức ăn, vắc xin từng gây phản ứng. Chỉ chọn "chưa biết dị ứng nào" khi đã hỏi.</p>
      {rows.map((row, index) => (
        <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
          <TextField label="Chất gây dị ứng" value={row.substance} onChange={event => setRow(index, { substance: event.target.value })} />
          <SelectField label="Mức độ" value={row.severity} onChange={event => setRow(index, { severity: event.target.value as Severity })} options={SEVERITY_OPTIONS} />
          <TextField label="Phản ứng" value={row.reaction} onChange={event => setRow(index, { reaction: event.target.value })} />
          <Button variant="ghost" aria-label={`Xóa dị ứng ${index + 1}`} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setRows(list => list.filter((_, i) => i !== index))} />
        </div>
      ))}
      {e.items && <p role="alert" className="text-sm text-danger">{e.items}</p>}
      <Button variant="secondary" icon={<Plus aria-hidden className="size-4" />} onClick={() => setRows(list => [...list, { substance: "", severity: "moderate", reaction: "" }])}>Thêm dị ứng</Button>
      {rows.length === 0 && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1 size-4" checked={none} onChange={event => setNone(event.target.checked)} />
          <span>Đã hỏi: người bệnh chưa biết dị ứng nào. Nếu không chọn, hồ sơ vẫn hiện "chưa ghi nhận dị ứng".</span>
        </label>
      )}
      <Unplaced errors={e} shown={["items"]} />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- condition and medicine

export function ConditionDialog({ record, open, onClose, onSaved }: { record: PatientRecord; open: boolean; onClose: () => void; onSaved: (record: PatientRecord) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<PatientRecord>();
  const [form, setForm] = useState({ name: "", code: "", since: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));
  const close = () => { setForm({ name: "", code: "", since: "" }); submit.reset(); onClose(); };
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Thêm bệnh mạn tính · ${record.patientName}`} onClose={close} submit={submit} submitLabel="Thêm bệnh"
      onSubmit={() => submit.run(() => addCondition(settings, record.patientId, only(form)), saved => { notify("Đã thêm bệnh mạn tính", "ok"); close(); onSaved(saved); })}>
      <TextField label="Tên bệnh" required value={form.name} onChange={set("name")} error={e.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Mã bệnh" hint="ICD-10, không bắt buộc" value={form.code} onChange={set("code")} error={e.code} />
        <TextField label="Bắt đầu từ" required type="date" value={form.since} onChange={set("since")} error={e.since} />
      </div>
      <Unplaced errors={e} shown={["name", "code", "since"]} />
    </FormDialog>
  );
}

export function MedicationDialog({ record, open, onClose, onSaved }: { record: PatientRecord; open: boolean; onClose: () => void; onSaved: (record: PatientRecord) => void }) {
  const { settings } = useSession();
  const { notify } = useToast();
  const submit = useSubmit<PatientRecord>();
  const [form, setForm] = useState({ name: "", dose: "", since: "" });
  const [conflicts, setConflicts] = useState<AllergyConflict[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));
  const close = () => { setForm({ name: "", dose: "", since: "" }); setConflicts([]); setConfirmed(false); setReason(""); submit.reset(); onClose(); };
  const e = submit.errors;
  return (
    <FormDialog open={open} title={`Thêm thuốc đang dùng · ${record.patientName}`} onClose={close} submit={submit} submitLabel="Thêm thuốc"
      onSubmit={() => submit.run(
        () => addMedication(settings, record.patientId, only({ ...form, overrideAllergy: confirmed, overrideReason: confirmed ? reason : undefined })),
        saved => { notify("Đã thêm thuốc", "ok"); close(); onSaved(saved); },
        error => { if (error.code !== "allergy-conflict") return false; setConflicts((error.body.conflicts as AllergyConflict[]) ?? []); return true; },
      )}>
      <TextField label="Tên thuốc" required value={form.name} onChange={set("name")} error={e.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Liều dùng" required value={form.dose} onChange={set("dose")} error={e.dose} hint="Ví dụ: 5 mg x 1 lần/ngày" />
        <TextField label="Bắt đầu từ" type="date" hint="Để trống là hôm nay" value={form.since} onChange={set("since")} error={e.since} />
      </div>
      <AllergyOverride conflicts={conflicts} confirmed={confirmed} reason={reason} onConfirmed={setConfirmed} onReason={setReason} error={e.overrideReason} />
      <Unplaced errors={e} shown={["name", "dose", "since", "overrideReason"]} />
    </FormDialog>
  );
}
