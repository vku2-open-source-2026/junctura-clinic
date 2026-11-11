// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyState } from "@junctura/health-ui";
import { ageOf, fold, severityLabel } from "./format";
import type { Encounter, PatientRecord, PatientSummary } from "./types";

export type PatientFilter = "all" | "allergy" | "elder" | "child";

export const ELDER_FROM = 60;
export const CHILD_UNDER = 6;

export function filterPatients(list: PatientSummary[], filter: PatientFilter, text: string, now: Date = new Date()): PatientSummary[] {
  const needle = fold(text.trim());
  return list.filter(patient => {
    const age = ageOf(patient.birthYear, now);
    const inGroup = filter === "all" || (filter === "allergy" && patient.allergyState === "recorded") || (filter === "elder" && age >= ELDER_FROM) || (filter === "child" && age < CHILD_UNDER);
    return inGroup && (!needle || fold(patient.patientName).includes(needle) || patient.patientId.toLowerCase().includes(needle) || fold(patient.ward).includes(needle));
  });
}

/** The banner state of a record. "none-known" only after staff confirmed it; an empty list alone is "not recorded". */
export function allergyView(record: Pick<PatientRecord, "allergyState" | "allergies">): { state: AllergyState; items: string[] } {
  if (record.allergyState === "recorded") return { state: "recorded", items: record.allergies.map(item => `${item.substance} (${severityLabel(item.severity).toLowerCase()})`) };
  return { state: record.allergyState, items: [] };
}

export const PATIENT_TABS = ["summary", "medications", "vaccinations", "referrals", "history"] as const;
export type PatientTab = (typeof PATIENT_TABS)[number];
export const tabFromPath = (value: string | undefined): PatientTab => (PATIENT_TABS as readonly string[]).includes(value ?? "") ? (value as PatientTab) : "summary";

export interface HistoryEvent { id: string; date: string; kind: "visit" | "vaccine" | "referral"; title: string; detail?: string }

/** Visits, vaccinations and referrals of one person in one list, newest first. */
export function historyOf(record: PatientRecord): HistoryEvent[] {
  const events: HistoryEvent[] = [
    ...record.encounters.map((item, index) => ({ id: `e${index}`, date: item.date, kind: "visit" as const, title: item.reason, detail: encounterDetail(item) || undefined })),
    ...record.vaccinations.map((item, index) => ({ id: `v${index}`, date: item.date, kind: "vaccine" as const, title: item.vaccine, detail: `Mũi ${item.doseNumber}` })),
    ...record.referrals.map(item => ({ id: item.referralId, date: item.issuedAt.slice(0, 10), kind: "referral" as const, title: `Chuyển tuyến: ${item.toFacility}`, detail: item.reason })),
  ];
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

/** The vaccines of the demo schedule (same keys as the server's schedule) and how many doses each has; `null` = yearly repeat. */
export const VACCINES: { code: string; name: string; doses: number | null }[] = [
  { code: "141", name: "Vắc xin cúm mùa", doses: null },
  { code: "112", name: "Vắc xin uốn ván (VAT)", doses: 3 },
  { code: "43", name: "Vắc xin viêm gan B", doses: 3 },
  { code: "213", name: "Vắc xin COVID-19", doses: 3 },
];

/** Dose number the next injection of this vaccine would be, or null when the series is complete. */
export function nextDoseOf(record: Pick<PatientRecord, "vaccinations">, code: string): number | null {
  const rule = VACCINES.find(item => item.code === code);
  if (!rule) return null;
  const last = record.vaccinations.filter(item => item.code === code).reduce((top, item) => Math.max(top, item.doseNumber), 0);
  return rule.doses !== null && last >= rule.doses ? null : last + 1;
}

/** One line per measured value, for a visit's detail. */
export function vitalsText(vitals: Encounter["vitals"]): string {
  if (!vitals) return "";
  const parts = [
    vitals.temperatureC !== undefined && `Nhiệt độ ${vitals.temperatureC}°C`, vitals.pulse !== undefined && `Mạch ${vitals.pulse}`,
    vitals.systolic !== undefined && vitals.diastolic !== undefined && `HA ${vitals.systolic}/${vitals.diastolic}`, vitals.spo2 !== undefined && `SpO2 ${vitals.spo2}%`, vitals.weightKg !== undefined && `${vitals.weightKg} kg`,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function encounterDetail(item: Encounter): string {
  return [item.diagnosis?.name, vitalsText(item.vitals), item.prescriptions?.length ? `Thuốc: ${item.prescriptions.map(drug => `${drug.name} ${drug.dose}`).join("; ")}` : "", item.advice ? `Dặn dò: ${item.advice}` : ""].filter(Boolean).join(" · ");
}
