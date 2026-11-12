// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyState } from "@junctura/health-ui";

export type Severity = "mild" | "moderate" | "severe";

export interface PublicConfig { issuer: string; clientId: string; facility: string }
export type Permission = "read" | "register" | "queue" | "exam" | "vaccinate" | "refer" | "audit.read" | "settings.write";
export interface Me { username: string; displayName: string; role: string; permissions: Permission[] }

export interface PatientSummary {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  allergyState: Extract<AllergyState, "recorded" | "none-known" | "not-recorded">; allergyCount: number; severeAllergy: boolean; lastVisit: string | null;
}

export interface Diagnosis { code: string; name: string }
export interface VaccineDue { vaccine: string; code: string; nextDose: number; due: string; state: "overdue" | "soon"; daysLate: number }
export interface Referral {
  referralId: string; issuedAt: string; toFacility: string; urgency: "routine" | "urgent" | "emergency"; reason: string;
  provisionalDiagnosis?: Diagnosis; treatmentGiven?: string;
}

export interface Vitals { temperatureC?: number; pulse?: number; systolic?: number; diastolic?: number; spo2?: number; weightKg?: number }
export interface Prescription { name: string; dose: string; ongoing?: boolean }
export interface Encounter { date: string; reason: string; diagnosis?: Diagnosis; vitals?: Vitals; notes?: string; advice?: string; prescriptions?: Prescription[]; by?: string }

export interface PatientRecord {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  phone?: string;
  allergyState: "recorded" | "none-known" | "not-recorded";
  allergies: { substance: string; severity: Severity; reaction: string }[];
  chronicConditions: { id: number; code?: string; name: string; since: string }[];
  currentMedications: { id: number; name: string; dose: string; since: string }[];
  encounters: Encounter[];
  vaccinations: { vaccine: string; code: string; date: string; doseNumber: number; lot?: string }[];
  vaccinesDue: VaccineDue[];
  referrals: Referral[];
  updatedAt?: string; vaccinationsUpdatedAt?: string;
}

export interface Overview {
  today: string;
  counts: { patients: number; severeAllergy: number; vaccinesOverdue: number; vaccinesSoon: number; encounters30d: number; referrals30d: number; waiting: number; inExam: number; seenToday: number };
  severeAllergy: PatientSummary[];
  recentEncounters: { patientId: string; patientName: string; date: string; reason: string; diagnosis?: Diagnosis }[];
  recentReferrals: (Referral & { patientId: string; patientName: string })[];
  queue: QueueEntry[];
}
export interface DueItem extends VaccineDue { patientId: string; patientName: string; birthYear: number }
export interface ReferralRow extends Referral { patientId: string; patientName: string }

export type QueueState = "waiting" | "called" | "done" | "cancelled";
export interface QueueEntry {
  id: number; ticket: string; patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; reason: string;
  priority: "normal" | "urgent"; state: QueueState; since: string; calledAt: string | null; doneAt: string | null;
  severeAllergy: boolean; allergyState: "recorded" | "none-known" | "not-recorded";
}
export interface AuditEntry { id: number; at: string; username: string; displayName: string; action: string; patientId?: string; patientName?: string; detail?: string }
export interface JunctureCall { id: number; at: string; capability?: string; purpose?: string; emergency: boolean; outcome?: string; patientId?: string; patientName?: string }
export interface StationSettings { aiSummary: boolean }
export interface AllergyConflict { medicine: string; allergen: string; severity: Severity }
