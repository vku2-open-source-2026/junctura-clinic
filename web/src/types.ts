// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyState } from "@junctura/health-ui";

export type Severity = "mild" | "moderate" | "severe";

export interface PublicConfig { issuer: string; clientId: string; facility: string }
export interface Me { username: string; displayName: string; role: string }

export interface PatientSummary {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  allergyState: Extract<AllergyState, "recorded" | "not-recorded">; allergyCount: number; severeAllergy: boolean; lastVisit: string | null;
}

export interface Diagnosis { code: string; name: string }
export interface VaccineDue { vaccine: string; code: string; nextDose: number; due: string; state: "overdue" | "soon"; daysLate: number }
export interface Referral {
  referralId: string; issuedAt: string; toFacility: string; urgency: "routine" | "urgent" | "emergency"; reason: string;
  provisionalDiagnosis?: Diagnosis; treatmentGiven?: string;
}

export interface PatientRecord {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  allergyState: "recorded" | "not-recorded";
  allergies: { substance: string; severity: Severity; reaction: string }[];
  chronicConditions: (Diagnosis & { since: string })[];
  currentMedications: { name: string; dose: string; since: string }[];
  encounters: { date: string; reason: string; diagnosis?: Diagnosis }[];
  vaccinations: { vaccine: string; code: string; date: string; doseNumber: number }[];
  vaccinesDue: VaccineDue[];
  referrals: Referral[];
  updatedAt?: string; vaccinationsUpdatedAt?: string;
}

export interface Overview {
  today: string;
  counts: { patients: number; severeAllergy: number; vaccinesOverdue: number; vaccinesSoon: number; encounters30d: number; referrals30d: number };
  severeAllergy: PatientSummary[];
  recentEncounters: { patientId: string; patientName: string; date: string; reason: string; diagnosis?: Diagnosis }[];
  recentReferrals: (Referral & { patientId: string; patientName: string })[];
}
export interface DueItem extends VaccineDue { patientId: string; patientName: string; birthYear: number }
export interface ReferralRow extends Referral { patientId: string; patientName: string }
