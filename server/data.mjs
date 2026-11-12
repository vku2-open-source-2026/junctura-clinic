// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { summarize } from "./summary.mjs";
import { SCHEDULE, dosesDue } from "./vaccines.mjs";

const CLINIC_APP = "junctura-clinic";
const DAY = 86_400_000;
/** The station's calendar day: the server's local date, not UTC (UTC would make 00:00-07:00 in Vietnam count as yesterday). */
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => localDay();

/** Folds case and diacritics so "nguyen" finds "Nguyễn". */
export const fold = text => String(text).normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** A rule the caller can turn into a 404/409 answer; never shown as a crash. */
export class DomainError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients (
  patient_id TEXT PRIMARY KEY, subject TEXT, name TEXT NOT NULL, name_fold TEXT NOT NULL, birth_year INTEGER NOT NULL,
  sex TEXT NOT NULL, ward TEXT NOT NULL, phone TEXT, no_known_allergies INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT, vaccinations_updated_at TEXT);
CREATE TABLE IF NOT EXISTS allergies (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(patient_id), substance TEXT NOT NULL, severity TEXT NOT NULL, reaction TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conditions (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(patient_id), code TEXT, name TEXT NOT NULL, since TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS medications (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(patient_id), name TEXT NOT NULL, dose TEXT NOT NULL, since TEXT NOT NULL, stopped_on TEXT);
CREATE TABLE IF NOT EXISTS encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(patient_id), date TEXT NOT NULL, reason TEXT NOT NULL,
  diagnosis_code TEXT, diagnosis_name TEXT, vitals TEXT, notes TEXT, advice TEXT, prescriptions TEXT, by_user TEXT);
CREATE TABLE IF NOT EXISTS vaccinations (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(patient_id), vaccine TEXT NOT NULL, code TEXT NOT NULL, date TEXT NOT NULL, dose_number INTEGER NOT NULL, lot TEXT, by_user TEXT);
CREATE TABLE IF NOT EXISTS referrals (
  referral_id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(patient_id), issued_at TEXT NOT NULL, to_facility TEXT NOT NULL, urgency TEXT NOT NULL,
  reason TEXT NOT NULL, diagnosis_code TEXT, diagnosis_name TEXT, treatment_given TEXT, by_user TEXT);
CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, ticket INTEGER NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(patient_id), reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal', state TEXT NOT NULL DEFAULT 'waiting', created_at TEXT NOT NULL, called_at TEXT, done_at TEXT, by_user TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL, action TEXT NOT NULL, patient_id TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_queue_day ON queue(day, state);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit(patient_id);
`;

const json = value => (value === undefined || value === null ? null : JSON.stringify(value));
const parse = value => (value ? JSON.parse(value) : undefined);
const row = value => (value ? { ...value } : undefined);
const rows = values => values.map(value => ({ ...value }));
const compact = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));

/**
 * Loads the synthetic clinic dataset from a junctura-health checkout (never copied into this
 * repository), moves every date so the first demo day is today, and keeps everything staff add
 * in a local SQLite file.
 */
export async function loadClinicData({ healthDir, file = ":memory:", today = todayISO() }) {
  const seed = await import(pathToFileURL(resolve(healthDir, "seed/generate.mjs")).href);
  if (file !== ":memory:") mkdirSync(dirname(resolve(file)), { recursive: true });
  return buildClinicData({ clinic: seed.rebase(seed.loadData("clinic.json"), today), accounts: seed.loadData("accounts.json"), file });
}

/** `today` is a fixed date in tests; left out, the server uses the calendar day at each request. */
export function buildClinicData({ clinic, accounts, file = ":memory:", today, now = () => new Date() }) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  // Columns added after the first release: a database made by an older version is upgraded in place.
  for (const [table, column, ddl] of [["patients", "insurance_no", "TEXT"], ["referrals", "status", "TEXT NOT NULL DEFAULT 'issued'"], ["queue", "station_id", "TEXT NOT NULL DEFAULT 'main'"]]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }

  const clock = typeof today === "string" ? () => today : () => localDay(now());
  const stamp = () => (typeof today === "string" ? `${today}T08:00:00.000Z` : now().toISOString());
  const q = sql => db.prepare(sql);
  const tx = fn => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  // Staff are matched by username, which stays stable even if the identity provider re-issues subjects.
  const staff = new Map(accounts.users.filter(user => user.app === CLINIC_APP).map(user => [user.username, user]));

  const seeded = row(q("SELECT value FROM meta WHERE key = 'seeded'").get());
  if (!seeded) {
    tx(() => {
      q("INSERT INTO meta (key, value) VALUES ('facility', ?)").run(clinic.facility);
      const putPatient = q("INSERT INTO patients (patient_id, subject, name, name_fold, birth_year, sex, ward, created_at, updated_at, vaccinations_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
      const putAllergy = q("INSERT INTO allergies (patient_id, substance, severity, reaction) VALUES (?,?,?,?)");
      const putCondition = q("INSERT INTO conditions (patient_id, code, name, since) VALUES (?,?,?,?)");
      const putMedication = q("INSERT INTO medications (patient_id, name, dose, since) VALUES (?,?,?,?)");
      const putEncounter = q("INSERT INTO encounters (patient_id, date, reason, diagnosis_code, diagnosis_name) VALUES (?,?,?,?,?)");
      const putVaccination = q("INSERT INTO vaccinations (patient_id, vaccine, code, date, dose_number) VALUES (?,?,?,?,?)");
      const putReferral = q("INSERT INTO referrals (referral_id, patient_id, issued_at, to_facility, urgency, reason, diagnosis_code, diagnosis_name, treatment_given) VALUES (?,?,?,?,?,?,?,?,?)");
      const bySubject = new Map();
      for (const patient of clinic.patients) {
        putPatient.run(patient.patientId, patient.subject ?? null, patient.patientName, fold(patient.patientName), patient.birthYear, patient.sex, patient.ward, stamp(), patient.updatedAt ?? null, patient.vaccinationsUpdatedAt ?? null);
        bySubject.set(patient.subject, patient.patientId);
        for (const item of patient.allergies) putAllergy.run(patient.patientId, item.substance, item.severity, item.reaction);
        for (const item of patient.chronicConditions) putCondition.run(patient.patientId, item.code ?? null, item.name, item.since);
        for (const item of patient.currentMedications) putMedication.run(patient.patientId, item.name, item.dose, item.since);
        for (const item of patient.encounters) putEncounter.run(patient.patientId, item.date, item.reason, item.diagnosis?.code ?? null, item.diagnosis?.name ?? null);
        for (const item of patient.vaccinations) putVaccination.run(patient.patientId, item.vaccine, item.code, item.date, item.doseNumber);
      }
      for (const item of clinic.referrals) {
        const patientId = bySubject.get(item.subject);
        if (patientId) putReferral.run(item.referralId, patientId, item.issuedAt, item.toFacility, item.urgency, item.reason, item.provisionalDiagnosis?.code ?? null, item.provisionalDiagnosis?.name ?? null, item.treatmentGiven ?? null);
      }
      q("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(stamp());
    });
  }
  const facility = q("SELECT value FROM meta WHERE key = 'facility'").get().value;
  q("INSERT OR IGNORE INTO stations (id, name, created_at) VALUES ('main', ?, ?)").run(facility, stamp());

  // ---------- reading ----------
  const patientRow = patientId => row(q("SELECT * FROM patients WHERE patient_id = ?").get(patientId));
  const need = patientId => {
    const patient = patientRow(patientId);
    if (!patient) throw new DomainError("patient-not-found", 404);
    return patient;
  };
  const allergiesOf = patientId => rows(q("SELECT substance, severity, reaction FROM allergies WHERE patient_id = ? ORDER BY id").all(patientId));
  const vaccinationsOf = patientId => rows(q("SELECT vaccine, code, date, dose_number AS doseNumber, lot FROM vaccinations WHERE patient_id = ? ORDER BY date, id").all(patientId)).map(compact);
  /**
   * The seed lists recorded allergies only. An empty list cannot tell "confirmed none" from "never asked",
   * so it is "not recorded" unless staff explicitly confirmed that the person has no known allergies.
   */
  const allergyStateOf = (patient, count) => (count > 0 ? "recorded" : patient.no_known_allergies ? "none-known" : "not-recorded");
  const lastVisitOf = patientId => q("SELECT MAX(date) AS d FROM encounters WHERE patient_id = ?").get(patientId).d ?? null;
  const summary = patient => {
    const allergies = allergiesOf(patient.patient_id);
    return {
      patientId: patient.patient_id, patientName: patient.name, birthYear: patient.birth_year, sex: patient.sex, ward: patient.ward,
      allergyState: allergyStateOf(patient, allergies.length), allergyCount: allergies.length,
      severeAllergy: allergies.some(item => item.severity === "severe"), lastVisit: lastVisitOf(patient.patient_id),
    };
  };
  const nameOf = patient => ({ patientId: patient.patient_id, patientName: patient.name });
  const since = days => new Date(Date.parse(`${clock()}T00:00:00.000Z`) - days * DAY).toISOString().slice(0, 10);
  /** How often, and when last, the receiving side read each referral through Junctura (from the capability-call audit lines). */
  function referralViews() {
    const views = new Map();
    for (const line of rows(q("SELECT at, detail FROM audit WHERE action = 'capability.call' ORDER BY id").all())) {
      let call;
      try { call = JSON.parse(line.detail); } catch { continue; }
      if (call?.capability !== "referral-summary" || call.outcome !== "answered" || typeof call.reference !== "string") continue;
      const seen = views.get(call.reference) ?? { viewCount: 0 };
      views.set(call.reference, { viewCount: seen.viewCount + 1, viewedAt: line.at });
    }
    return views;
  }
  const referralOf = (item, views = referralViews()) => compact({
    ...views.get(item.referral_id), status: item.status ?? "issued",
    referralId: item.referral_id, issuedAt: item.issued_at, toFacility: item.to_facility, urgency: item.urgency, reason: item.reason,
    provisionalDiagnosis: item.diagnosis_name ? compact({ code: item.diagnosis_code, name: item.diagnosis_name }) : undefined, treatmentGiven: item.treatment_given,
  });
  const encounterOf = item => compact({
    date: item.date, reason: item.reason, diagnosis: item.diagnosis_name ? compact({ code: item.diagnosis_code, name: item.diagnosis_name }) : undefined,
    vitals: parse(item.vitals), notes: item.notes, advice: item.advice, prescriptions: parse(item.prescriptions), by: item.by_user,
  });

  function get(patientId) {
    const patient = patientRow(patientId);
    if (!patient) return null;
    const allergies = allergiesOf(patientId);
    const vaccinations = vaccinationsOf(patientId);
    return compact({
      patientId, patientName: patient.name, birthYear: patient.birth_year, sex: patient.sex, ward: patient.ward, phone: patient.phone, insuranceNo: patient.insurance_no,
      allergyState: allergyStateOf(patient, allergies.length), allergies,
      chronicConditions: rows(q("SELECT id, code, name, since FROM conditions WHERE patient_id = ? ORDER BY since, id").all(patientId)).map(compact),
      currentMedications: rows(q("SELECT id, name, dose, since FROM medications WHERE patient_id = ? AND stopped_on IS NULL ORDER BY since, id").all(patientId)),
      encounters: rows(q("SELECT * FROM encounters WHERE patient_id = ? ORDER BY date, id").all(patientId)).map(encounterOf),
      vaccinations, vaccinesDue: dosesDue(vaccinations, clock()),
      referrals: (views => rows(q("SELECT * FROM referrals WHERE patient_id = ? ORDER BY issued_at, referral_id").all(patientId)).map(item => referralOf(item, views)))(referralViews()),
      updatedAt: patient.updated_at, vaccinationsUpdatedAt: patient.vaccinations_updated_at,
    });
  }

  const allPatients = () => rows(q("SELECT * FROM patients ORDER BY patient_id").all());
  function list(query = "") {
    const needle = fold(query.trim());
    return allPatients().filter(patient => !needle || patient.name_fold.includes(needle) || patient.patient_id.toLowerCase().includes(needle)).map(summary);
  }

  function vaccinesDue() {
    return allPatients()
      .flatMap(patient => dosesDue(vaccinationsOf(patient.patient_id), clock()).map(item => ({ ...nameOf(patient), birthYear: patient.birth_year, ...item })))
      .sort((a, b) => a.due.localeCompare(b.due) || a.patientName.localeCompare(b.patientName, "vi"));
  }
  function referrals() {
    const views = referralViews();
    return rows(q("SELECT r.*, p.name FROM referrals r JOIN patients p ON p.patient_id = r.patient_id ORDER BY r.issued_at DESC, r.referral_id DESC").all())
      .map(item => ({ ...referralOf(item, views), patientId: item.patient_id, patientName: item.name }));
  }

  // ---------- queue ----------
  /** Young children and older people are called ahead of ordinary arrivals (after urgent cases). */
  const groupOf = birthYear => { const age = Number(clock().slice(0, 4)) - birthYear; return age < 6 ? "child" : age >= 60 ? "senior" : null; };
  const queueItem = item => {
    const patient = patientRow(item.patient_id);
    return {
      group: groupOf(patient.birth_year), station: item.station_id ?? "main",
      id: item.id, ticket: String(item.ticket).padStart(3, "0"), patientId: item.patient_id, patientName: patient.name, birthYear: patient.birth_year, sex: patient.sex,
      reason: item.reason, priority: item.priority, state: item.state, since: item.created_at, calledAt: item.called_at ?? null, doneAt: item.done_at ?? null,
      severeAllergy: summary(patient).severeAllergy, allergyState: summary(patient).allergyState,
    };
  };
  const rank = entry => (entry.state !== "waiting" ? 3 : entry.priority === "urgent" ? 0 : entry.group ? 1 : 2);
  function queueToday(stationId) {
    const found = stationId ? rows(q("SELECT * FROM queue WHERE day = ? AND station_id = ? ORDER BY ticket").all(clock(), stationId)) : rows(q("SELECT * FROM queue WHERE day = ? ORDER BY ticket").all(clock()));
    return found.map(queueItem).sort((a, b) => rank(a) - rank(b) || a.ticket.localeCompare(b.ticket));
  }

  function overview() {
    const all = allPatients();
    const due = vaccinesDue();
    const encounters = rows(q("SELECT e.*, p.name FROM encounters e JOIN patients p ON p.patient_id = e.patient_id ORDER BY e.date DESC, e.id DESC").all());
    const refs = referrals();
    const severe = all.map(summary).filter(item => item.severeAllergy);
    const line = queueToday();
    return {
      today: clock(),
      counts: {
        patients: all.length, severeAllergy: severe.length,
        vaccinesOverdue: due.filter(item => item.state === "overdue").length, vaccinesSoon: due.filter(item => item.state === "soon").length,
        encounters30d: encounters.filter(item => item.date >= since(30)).length, referrals30d: refs.filter(item => item.issuedAt.slice(0, 10) >= since(30)).length,
        waiting: line.filter(item => item.state === "waiting").length, inExam: line.filter(item => item.state === "called").length, seenToday: line.filter(item => item.state === "done").length,
      },
      severeAllergy: severe.slice(0, 5),
      recentEncounters: encounters.slice(0, 8).map(item => compact({ patientId: item.patient_id, patientName: item.name, date: item.date, reason: item.reason, diagnosis: item.diagnosis_name ? compact({ code: item.diagnosis_code, name: item.diagnosis_name }) : undefined })),
      recentReferrals: refs.slice(0, 4),
      queue: line.filter(item => item.state !== "done" && item.state !== "cancelled").slice(0, 6),
    };
  }

  // ---------- audit ----------
  const log = (by, action, patientId, detail) =>
    q("INSERT INTO audit (at, username, display_name, action, patient_id, detail) VALUES (?,?,?,?,?,?)").run(stamp(), by.username, by.displayName ?? by.username, action, patientId ?? null, detail ?? null);
  /** `calls`: true lists only the capability calls other apps made through Junctura, false leaves them out, omitted lists everything. */
  function audit({ limit = 100, patientId, calls } = {}) {
    const max = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const where = [patientId && "a.patient_id = ?", calls === true && "a.action = 'capability.call'", calls === false && "a.action <> 'capability.call'"].filter(Boolean);
    const sql = `SELECT a.*, p.name AS patient_name FROM audit a LEFT JOIN patients p ON p.patient_id = a.patient_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.id DESC LIMIT ${max}`;
    return rows(patientId ? q(sql).all(patientId) : q(sql).all()).map(item => compact({
      id: item.id, at: item.at, username: item.username, displayName: item.display_name, action: item.action, patientId: item.patient_id, patientName: item.patient_name, detail: item.detail,
    }));
  }

  // ---------- allergy check ----------
  /** Medicines that share a name with a recorded allergy; a quick safety net, not a drug-interaction database. */
  function allergyConflicts(patientId, names) {
    const allergies = allergiesOf(patientId).map(item => ({ ...item, key: fold(item.substance) })).filter(item => item.key.length >= 3);
    const found = [];
    for (const name of names) {
      const key = fold(name);
      for (const allergy of allergies) if (key.includes(allergy.key) || allergy.key.includes(key)) found.push({ medicine: name, allergen: allergy.substance, severity: allergy.severity });
    }
    return found;
  }
  function guardAllergy(patientId, names, override) {
    const conflicts = allergyConflicts(patientId, names);
    if (conflicts.length && !override) throw new DomainError("allergy-conflict", 409, { conflicts });
    return conflicts;
  }

  // ---------- writing ----------
  const touch = patientId => q("UPDATE patients SET updated_at = ? WHERE patient_id = ?").run(stamp(), patientId);
  const nextPatientId = () => `P${String((q("SELECT MAX(CAST(SUBSTR(patient_id, 2) AS INTEGER)) AS n FROM patients").get().n ?? 0) + 1).padStart(4, "0")}`;

  function createPatient(input, by) {
    return tx(() => {
      const duplicate = rows(q("SELECT * FROM patients WHERE name_fold = ? AND birth_year = ?").all(fold(input.patientName), input.birthYear));
      if (duplicate.length && !input.confirmDuplicate) throw new DomainError("possible-duplicate", 409, { matches: duplicate.map(summary) });
      const patientId = nextPatientId();
      q("INSERT INTO patients (patient_id, name, name_fold, birth_year, sex, ward, phone, insurance_no, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(patientId, input.patientName, fold(input.patientName), input.birthYear, input.sex, input.ward, input.phone ?? null, input.insuranceNo ?? null, stamp(), stamp());
      log(by, "patient.create", patientId, "Thêm người bệnh mới");
      return get(patientId);
    });
  }

  function setAllergies(patientId, input, by) {
    return tx(() => {
      need(patientId);
      q("DELETE FROM allergies WHERE patient_id = ?").run(patientId);
      const put = q("INSERT INTO allergies (patient_id, substance, severity, reaction) VALUES (?,?,?,?)");
      for (const item of input.items) put.run(patientId, item.substance, item.severity, item.reaction);
      q("UPDATE patients SET no_known_allergies = ? WHERE patient_id = ?").run(input.items.length === 0 && input.noKnownAllergies ? 1 : 0, patientId);
      touch(patientId);
      log(by, "allergy.update", patientId, input.items.length ? `${input.items.length} dị ứng` : input.noKnownAllergies ? "Xác nhận chưa biết dị ứng nào" : "Xóa danh sách dị ứng (về chưa ghi nhận)");
      return get(patientId);
    });
  }

  function addCondition(patientId, input, by) {
    return tx(() => {
      need(patientId);
      q("INSERT INTO conditions (patient_id, code, name, since) VALUES (?,?,?,?)").run(patientId, input.code ?? null, input.name, input.since);
      touch(patientId);
      log(by, "condition.add", patientId, input.name);
      return get(patientId);
    });
  }

  function addMedication(patientId, input, by) {
    return tx(() => {
      need(patientId);
      const conflicts = guardAllergy(patientId, [input.name], input.overrideAllergy && input.overrideReason);
      q("INSERT INTO medications (patient_id, name, dose, since) VALUES (?,?,?,?)").run(patientId, input.name, input.dose, input.since ?? clock());
      touch(patientId);
      log(by, "medication.add", patientId, conflicts.length ? `${input.name} (đã xác nhận trái cảnh báo dị ứng: ${input.overrideReason})` : input.name);
      return get(patientId);
    });
  }

  function stopMedication(patientId, medicationId, by) {
    return tx(() => {
      need(patientId);
      const item = row(q("SELECT * FROM medications WHERE id = ? AND patient_id = ?").get(medicationId, patientId));
      if (!item || item.stopped_on) throw new DomainError("medication-not-found", 404);
      q("UPDATE medications SET stopped_on = ? WHERE id = ?").run(clock(), medicationId);
      touch(patientId);
      log(by, "medication.stop", patientId, item.name);
      return get(patientId);
    });
  }

  function addEncounter(patientId, input, by) {
    return tx(() => {
      const patient = need(patientId);
      const day = input.date ?? clock();
      if (day < `${patient.birth_year}-01-01`) throw new DomainError("before-birth", 422, { fields: { date: "Ngày khám không được trước năm sinh." } });
      const names = input.prescriptions.map(item => item.name);
      const conflicts = guardAllergy(patientId, names, input.overrideAllergy && input.overrideReason);
      q("INSERT INTO encounters (patient_id, date, reason, diagnosis_code, diagnosis_name, vitals, notes, advice, prescriptions, by_user) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(patientId, day, input.reason, input.diagnosis?.code ?? null, input.diagnosis?.name ?? null, json(input.vitals && Object.keys(input.vitals).length ? input.vitals : undefined), input.notes ?? null, input.advice ?? null,
          json(input.prescriptions.length ? input.prescriptions.map(({ name, dose, ongoing }) => ({ name, dose, ...(ongoing && { ongoing: true }) })) : undefined), by.username);
      for (const item of input.prescriptions) if (item.ongoing) q("INSERT INTO medications (patient_id, name, dose, since) VALUES (?,?,?,?)").run(patientId, item.name, item.dose, day);
      if (input.queueId) {
        const entry = row(q("SELECT * FROM queue WHERE id = ? AND patient_id = ? AND day = ?").get(input.queueId, patientId, clock()));
        if (entry && (entry.state === "waiting" || entry.state === "called")) q("UPDATE queue SET state = 'done', done_at = ? WHERE id = ?").run(stamp(), entry.id);
      }
      touch(patientId);
      log(by, "encounter.create", patientId, [input.diagnosis?.name ?? input.reason, input.prescriptions.length ? `${input.prescriptions.length} thuốc` : null, conflicts.length ? `đã xác nhận trái cảnh báo dị ứng: ${input.overrideReason}` : null].filter(Boolean).join("; "));
      return get(patientId);
    });
  }

  /** The next dose of the demo schedule for this person, or a reason there is none. */
  function nextDose(patientId, code) {
    const rule = SCHEDULE[code];
    if (!rule) return { error: "unknown-vaccine" };
    const given = vaccinationsOf(patientId).filter(item => item.code === code);
    const last = given.reduce((top, item) => (item.doseNumber > top ? item.doseNumber : top), 0);
    if (rule.doses && last >= rule.doses) return { error: "series-complete", rule };
    return { dose: last + 1, rule };
  }

  function addVaccination(patientId, input, by) {
    return tx(() => {
      const patient = need(patientId);
      const day = input.date ?? clock();
      if (day < `${patient.birth_year}-01-01`) throw new DomainError("before-birth", 422, { fields: { date: "Ngày tiêm không được trước năm sinh." } });
      const next = nextDose(patientId, input.code);
      if (next.error === "unknown-vaccine") throw new DomainError("unknown-vaccine", 422, { fields: { code: "Vắc xin này chưa có trong lịch tiêm của bản demo." } });
      if (next.error === "series-complete") throw new DomainError("series-complete", 409, { vaccine: next.rule.name });
      if (q("SELECT 1 FROM vaccinations WHERE patient_id = ? AND code = ? AND date = ?").get(patientId, input.code, day)) throw new DomainError("duplicate-vaccination", 409);
      q("INSERT INTO vaccinations (patient_id, vaccine, code, date, dose_number, lot, by_user) VALUES (?,?,?,?,?,?,?)").run(patientId, next.rule.name, input.code, day, next.dose, input.lot ?? null, by.username);
      q("UPDATE patients SET vaccinations_updated_at = ?, updated_at = ? WHERE patient_id = ?").run(stamp(), stamp(), patientId);
      log(by, "vaccination.record", patientId, `${next.rule.name}, mũi ${next.dose}`);
      return get(patientId);
    });
  }

  function addReferral(patientId, input, by) {
    return tx(() => {
      need(patientId);
      const year = clock().slice(0, 4);
      const last = q("SELECT MAX(CAST(SUBSTR(referral_id, -6) AS INTEGER)) AS n FROM referrals").get().n ?? 0;
      const referralId = `CT-${year}-${String(last + 1).padStart(6, "0")}`;
      q("INSERT INTO referrals (referral_id, patient_id, issued_at, to_facility, urgency, reason, diagnosis_code, diagnosis_name, treatment_given, by_user) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(referralId, patientId, stamp(), input.toFacility, input.urgency, input.reason, input.provisionalDiagnosis?.code ?? null, input.provisionalDiagnosis?.name ?? null, input.treatmentGiven ?? null, by.username);
      touch(patientId);
      log(by, "referral.create", patientId, `${referralId} → ${input.toFacility}`);
      return { referralId, record: get(patientId) };
    });
  }

  function enqueue(input, by) {
    return tx(() => {
      const patient = need(input.patientId);
      const stationId = input.stationId ?? "main";
      if (!q("SELECT 1 FROM stations WHERE id = ?").get(stationId)) throw new DomainError("station-not-found", 404);
      const day = clock();
      if (q("SELECT 1 FROM queue WHERE day = ? AND patient_id = ? AND state IN ('waiting','called')").get(day, input.patientId)) throw new DomainError("already-in-queue", 409);
      const ticket = (q("SELECT MAX(ticket) AS n FROM queue WHERE day = ? AND station_id = ?").get(day, stationId).n ?? 0) + 1;
      const result = q("INSERT INTO queue (day, ticket, patient_id, reason, priority, created_at, by_user, station_id) VALUES (?,?,?,?,?,?,?,?)").run(day, ticket, input.patientId, input.reason, input.priority ?? "normal", stamp(), by.username, stationId);
      log(by, "queue.add", patient.patient_id, `Số ${String(ticket).padStart(3, "0")}: ${input.reason}`);
      return queueItem(row(q("SELECT * FROM queue WHERE id = ?").get(Number(result.lastInsertRowid))));
    });
  }

  const QUEUE_MOVES = { call: ["waiting", "called", "called_at"], done: ["called", "done", "done_at"], cancel: ["waiting", "cancelled", "done_at"] };
  function moveQueue(id, action, by) {
    return tx(() => {
      const entry = row(q("SELECT * FROM queue WHERE id = ? AND day = ?").get(id, clock()));
      if (!entry) throw new DomainError("queue-entry-not-found", 404);
      const [from, to, column] = QUEUE_MOVES[action];
      const allowed = action === "cancel" ? ["waiting", "called"] : [from];
      if (!allowed.includes(entry.state)) throw new DomainError("queue-state-conflict", 409, { state: entry.state });
      q(`UPDATE queue SET state = ?, ${column} = ? WHERE id = ?`).run(to, stamp(), id);
      log(by, `queue.${action}`, entry.patient_id, `Số ${String(entry.ticket).padStart(3, "0")}`);
      return queueItem(row(q("SELECT * FROM queue WHERE id = ?").get(id)));
    });
  }

  // ---------- insurance card, referral status ----------
  function setInsurance(patientId, insuranceNo, by) {
    return tx(() => {
      need(patientId);
      q("UPDATE patients SET insurance_no = ? WHERE patient_id = ?").run(insuranceNo ?? null, patientId);
      touch(patientId);
      log(by, "patient.insurance", patientId, insuranceNo ? "Cập nhật mã thẻ BHYT" : "Xóa mã thẻ BHYT");
      return get(patientId);
    });
  }

  function setReferralStatus(patientId, referralId, status, by) {
    return tx(() => {
      need(patientId);
      const result = q("UPDATE referrals SET status = ? WHERE referral_id = ? AND patient_id = ?").run(status, referralId, patientId);
      if (!result.changes) throw new DomainError("referral-not-found", 404);
      touch(patientId);
      log(by, "referral.status", patientId, `${referralId}: ${status}`);
      return get(patientId);
    });
  }

  // ---------- stations ----------
  const stations = () => rows(q("SELECT id, name FROM stations ORDER BY created_at, id").all());
  function addStation(name, by) {
    return tx(() => {
      if (q("SELECT 1 FROM stations WHERE name = ?").get(name)) throw new DomainError("station-exists", 409);
      const id = `st-${(q("SELECT COUNT(*) AS n FROM stations").get().n) + 1}`;
      q("INSERT INTO stations (id, name, created_at) VALUES (?,?,?)").run(id, name, stamp());
      log(by, "station.add", null, name);
      return stations();
    });
  }
  function renameStation(id, name, by) {
    return tx(() => {
      if (!q("SELECT 1 FROM stations WHERE id = ?").get(id)) throw new DomainError("station-not-found", 404);
      if (q("SELECT 1 FROM stations WHERE name = ? AND id <> ?").get(name, id)) throw new DomainError("station-exists", 409);
      q("UPDATE stations SET name = ? WHERE id = ?").run(name, id);
      log(by, "station.rename", null, name);
      return stations();
    });
  }

  // ---------- self service (no sign-in): only a ticket number, never a person's data ----------
  const SELF = { username: "self-service", displayName: "Người bệnh tự lấy số" };
  function selfTicket({ patientName, birthYear, reason, stationId = "main" }) {
    const matches = rows(q("SELECT patient_id FROM patients WHERE name_fold = ? AND birth_year = ?").all(fold(patientName.trim()), birthYear));
    if (matches.length !== 1) throw new DomainError("record-not-found", 404);
    const patientId = matches[0].patient_id;
    const existing = row(q("SELECT * FROM queue WHERE day = ? AND patient_id = ? AND state IN ('waiting','called')").get(clock(), patientId));
    const entry = existing ? queueItem(existing) : enqueue({ patientId, reason, stationId }, SELF);
    const ahead = queueToday(entry.station).filter(item => item.state === "waiting" && item.id !== entry.id && (rank(item) < rank(entry) || (rank(item) === rank(entry) && item.ticket < entry.ticket))).length;
    return { ticket: entry.ticket, state: entry.state, ahead, station: entry.station, already: Boolean(existing) };
  }
  /** What the waiting-room screen shows: ticket numbers only. */
  function board(stationId = "main") {
    const line = queueToday(stationId);
    return {
      today: clock(), station: stations().find(item => item.id === stationId)?.name ?? null,
      calling: line.filter(item => item.state === "called").map(item => item.ticket),
      waiting: line.filter(item => item.state === "waiting").slice(0, 12).map(item => ({ ticket: item.ticket, priority: item.priority === "urgent" ? "urgent" : item.group ? "group" : "normal" })),
      waitingCount: line.filter(item => item.state === "waiting").length,
    };
  }

  // ---------- settings ----------
  const DEFAULTS = { aiSummary: false, aiModel: false };
  function settings() {
    const stored = Object.fromEntries(rows(q("SELECT key, value FROM settings").all()).map(item => [item.key, JSON.parse(item.value)]));
    return { ...DEFAULTS, ...stored };
  }
  function updateSettings(patch, by) {
    return tx(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in DEFAULTS)) continue;
        q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
        log(by, "settings.update", null, `${key} = ${value}`);
      }
      return settings();
    });
  }

  return {
    facility, staff, db,
    get today() { return clock(); },
    list, get, vaccinesDue, referrals, overview, queueToday, audit, settings, stations, board,
    summaryOf(patientId) {
      const record = get(patientId);
      return record ? summarize(record, clock()) : null;
    },
    /** The patient a Junctura subject identifies, or null (people created at this station have no subject). */
    patientIdBySubject: subject => row(q("SELECT patient_id FROM patients WHERE subject = ?").get(subject))?.patient_id ?? null,
    allergyConflicts,
    log,
    createPatient, setInsurance, setReferralStatus, addStation, renameStation, selfTicket, setAllergies, addCondition, addMedication, stopMedication, addEncounter, addVaccination, addReferral,
    enqueue, callQueue: (id, by) => moveQueue(id, "call", by), finishQueue: (id, by) => moveQueue(id, "done", by), cancelQueue: (id, by) => moveQueue(id, "cancel", by),
    updateSettings,
    close: () => db.close(),
  };
}
