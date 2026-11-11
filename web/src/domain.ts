// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyState } from "@junctura/health-ui";
import { ageOf, fold, severityLabel } from "./format";
import type { PatientRecord, PatientSummary } from "./types";

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

/** The banner state of a record. The server only knows "recorded" or "not recorded". */
export function allergyView(record: Pick<PatientRecord, "allergyState" | "allergies">): { state: AllergyState; items: string[] } {
  return record.allergyState === "recorded"
    ? { state: "recorded", items: record.allergies.map(item => `${item.substance} (${severityLabel(item.severity).toLowerCase()})`) }
    : { state: "not-recorded", items: [] };
}

export const PATIENT_TABS = ["summary", "medications", "vaccinations", "referrals", "history"] as const;
export type PatientTab = (typeof PATIENT_TABS)[number];
export const tabFromPath = (value: string | undefined): PatientTab => (PATIENT_TABS as readonly string[]).includes(value ?? "") ? (value as PatientTab) : "summary";

export interface HistoryEvent { id: string; date: string; kind: "visit" | "vaccine" | "referral"; title: string; detail?: string }

/** Visits, vaccinations and referrals of one person in one list, newest first. */
export function historyOf(record: PatientRecord): HistoryEvent[] {
  const events: HistoryEvent[] = [
    ...record.encounters.map((item, index) => ({ id: `e${index}`, date: item.date, kind: "visit" as const, title: item.reason, detail: item.diagnosis?.name })),
    ...record.vaccinations.map((item, index) => ({ id: `v${index}`, date: item.date, kind: "vaccine" as const, title: item.vaccine, detail: `Mũi ${item.doseNumber}` })),
    ...record.referrals.map(item => ({ id: item.referralId, date: item.issuedAt.slice(0, 10), kind: "referral" as const, title: `Chuyển tuyến: ${item.toFacility}`, detail: item.reason })),
  ];
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
