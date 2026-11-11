// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
export type Severity = "mild" | "moderate" | "severe";

export interface PublicConfig { issuer: string; clientId: string; facility: string }
export interface Me { username: string; displayName: string; role: string }

export interface PatientSummary {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  allergyCount: number; severeAllergy: boolean; lastVisit: string | null;
}

export interface Diagnosis { code: string; name: string }
export interface PatientRecord {
  patientId: string; patientName: string; birthYear: number; sex: "male" | "female"; ward: string;
  allergies: { substance: string; severity: Severity; reaction: string }[];
  chronicConditions: (Diagnosis & { since: string })[];
  currentMedications: { name: string; dose: string; since: string }[];
  encounters: { date: string; reason: string; diagnosis?: Diagnosis }[];
  vaccinations: { vaccine: string; code: string; date: string; doseNumber: number }[];
  referrals: { referralId: string; issuedAt: string; toFacility: string; urgency: "routine" | "urgent" | "emergency"; reason: string; provisionalDiagnosis?: Diagnosis; treatmentGiven?: string }[];
}
