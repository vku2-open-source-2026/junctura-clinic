// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CLINIC_APP = "junctura-clinic";

/** Folds case and diacritics so "nguyen" finds "Nguyễn". */
export const fold = text => String(text).normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Loads the synthetic clinic dataset from a junctura-health checkout (never copied
 * into this repository) and moves every date so the demo day is today.
 */
export async function loadClinicData({ healthDir, today = new Date().toISOString().slice(0, 10) }) {
  const seed = await import(pathToFileURL(resolve(healthDir, "seed/generate.mjs")).href);
  return buildClinicData({ clinic: seed.rebase(seed.loadData("clinic.json"), today), accounts: seed.loadData("accounts.json") });
}

export function buildClinicData({ clinic, accounts }) {
  const patients = new Map(clinic.patients.map(patient => [patient.patientId, patient]));
  const referralsBySubject = new Map();
  for (const referral of clinic.referrals) referralsBySubject.set(referral.subject, [...(referralsBySubject.get(referral.subject) ?? []), referral]);
  // Staff are matched by username, which stays stable even if the identity provider re-issues subjects.
  const staff = new Map(accounts.users.filter(user => user.app === CLINIC_APP).map(user => [user.username, user]));

  const lastVisit = patient => patient.encounters.reduce((latest, item) => (item.date > latest ? item.date : latest), "");
  const summary = patient => ({
    patientId: patient.patientId,
    patientName: patient.patientName,
    birthYear: patient.birthYear,
    sex: patient.sex,
    ward: patient.ward,
    allergyCount: patient.allergies.length,
    severeAllergy: patient.allergies.some(item => item.severity === "severe"),
    lastVisit: lastVisit(patient) || null,
  });

  return {
    facility: clinic.facility,
    staff,
    list(query = "") {
      const needle = fold(query.trim());
      return [...patients.values()]
        .filter(patient => !needle || fold(patient.patientName).includes(needle) || patient.patientId.toLowerCase().includes(needle))
        .map(summary);
    },
    get(patientId) {
      const patient = patients.get(patientId);
      if (!patient) return null;
      const { subject, ...record } = patient;
      return { ...record, referrals: (referralsBySubject.get(subject) ?? []).map(({ subject: _s, fromFacility: _f, ...referral }) => referral) };
    },
  };
}
