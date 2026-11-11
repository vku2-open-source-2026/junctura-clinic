// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dosesDue } from "./vaccines.mjs";

const CLINIC_APP = "junctura-clinic";
const DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Folds case and diacritics so "nguyen" finds "Nguyễn". */
export const fold = text => String(text).normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Loads the synthetic clinic dataset from a junctura-health checkout (never copied
 * into this repository) and moves every date so the demo day is today.
 */
export async function loadClinicData({ healthDir, today = new Date().toISOString().slice(0, 10) }) {
  const seed = await import(pathToFileURL(resolve(healthDir, "seed/generate.mjs")).href);
  return buildClinicData({ clinic: seed.rebase(seed.loadData("clinic.json"), today), accounts: seed.loadData("accounts.json"), today });
}

export function buildClinicData({ clinic, accounts, today = todayISO() }) {
  const patients = new Map(clinic.patients.map(patient => [patient.patientId, patient]));
  const referralsBySubject = new Map();
  for (const referral of clinic.referrals) referralsBySubject.set(referral.subject, [...(referralsBySubject.get(referral.subject) ?? []), referral]);
  // Staff are matched by username, which stays stable even if the identity provider re-issues subjects.
  const staff = new Map(accounts.users.filter(user => user.app === CLINIC_APP).map(user => [user.username, user]));

  const lastVisit = patient => patient.encounters.reduce((latest, item) => (item.date > latest ? item.date : latest), "");
  /**
   * The dataset lists recorded allergies only. An empty list cannot tell "confirmed none" from
   * "never asked", so it is reported as not recorded; "none-known" needs an explicit entry by staff.
   */
  const allergyState = patient => (patient.allergies.length > 0 ? "recorded" : "not-recorded");
  const nameOf = patient => ({ patientId: patient.patientId, patientName: patient.patientName });
  const since = days => new Date(Date.parse(`${today}T00:00:00.000Z`) - days * DAY).toISOString().slice(0, 10);
  const summary = patient => ({
    patientId: patient.patientId,
    patientName: patient.patientName,
    birthYear: patient.birthYear,
    sex: patient.sex,
    ward: patient.ward,
    allergyState: allergyState(patient),
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
    today,
    /** Doses due or coming due, most overdue first. */
    vaccinesDue() {
      return [...patients.values()]
        .flatMap(patient => dosesDue(patient.vaccinations, today).map(item => ({ ...nameOf(patient), birthYear: patient.birthYear, ...item })))
        .sort((a, b) => a.due.localeCompare(b.due) || a.patientName.localeCompare(b.patientName, "vi"));
    },
    referrals() {
      const bySubject = new Map([...patients.values()].map(patient => [patient.subject, patient]));
      return clinic.referrals
        .map(({ subject, fromFacility: _f, ...referral }) => ({ ...referral, ...nameOf(bySubject.get(subject) ?? { patientId: "", patientName: "" }) }))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    },
    /** Everything the "today" screen needs in one call. */
    overview() {
      const all = [...patients.values()];
      const due = this.vaccinesDue();
      const encounters = all.flatMap(patient => patient.encounters.map(item => ({ ...nameOf(patient), ...item }))).sort((a, b) => b.date.localeCompare(a.date));
      const referrals = this.referrals();
      const severe = all.filter(patient => patient.allergies.some(item => item.severity === "severe"));
      return {
        today,
        counts: {
          patients: all.length,
          severeAllergy: severe.length,
          vaccinesOverdue: due.filter(item => item.state === "overdue").length,
          vaccinesSoon: due.filter(item => item.state === "soon").length,
          encounters30d: encounters.filter(item => item.date >= since(30)).length,
          referrals30d: referrals.filter(item => item.issuedAt.slice(0, 10) >= since(30)).length,
        },
        severeAllergy: severe.map(summary).slice(0, 5),
        recentEncounters: encounters.slice(0, 8),
        recentReferrals: referrals.slice(0, 4),
      };
    },
    get(patientId) {
      const patient = patients.get(patientId);
      if (!patient) return null;
      const { subject, ...record } = patient;
      return { ...record, allergyState: allergyState(patient), vaccinesDue: dosesDue(patient.vaccinations, today), referrals: (referralsBySubject.get(subject) ?? []).map(({ subject: _s, fromFacility: _f, ...referral }) => referral) };
    },
  };
}
