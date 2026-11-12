// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

/** Counts only: nothing here names a person. */
const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const REPORT_KINDS = Object.freeze({ daily: "ngay", diagnoses: "chan-doan", wards: "phuong-xa", ages: "nhom-tuoi", vaccines: "vac-xin" });

const dayNumber = value => Date.parse(`${value}T00:00:00.000Z`);
export const validDate = value => typeof value === "string" && ISO.test(value) && !Number.isNaN(dayNumber(value)) && new Date(dayNumber(value)).toISOString().startsWith(value);

/** `from` and `to` are inclusive calendar days (YYYY-MM-DD), at most one year apart. */
export function buildReport(db, { from, to, today }) {
  if (!validDate(from) || !validDate(to) || from > to) throw new RangeError("invalid-range");
  if ((dayNumber(to) - dayNumber(from)) / DAY > 366) throw new RangeError("range-too-long");
  const all = (sql, ...args) => db.prepare(sql).all(...args).map(item => ({ ...item }));
  const one = (sql, ...args) => ({ ...db.prepare(sql).get(...args) });
  const year = Number(today.slice(0, 4));

  const byDay = new Map();
  for (let at = dayNumber(from); at <= dayNumber(to); at += DAY) byDay.set(new Date(at).toISOString().slice(0, 10), { date: new Date(at).toISOString().slice(0, 10), encounters: 0, vaccinations: 0, referrals: 0, queue: 0 });
  const add = (rows, key) => { for (const row of rows) if (byDay.has(row.day)) byDay.get(row.day)[key] = row.n; };
  add(all("SELECT date AS day, COUNT(*) AS n FROM encounters WHERE date BETWEEN ? AND ? GROUP BY date", from, to), "encounters");
  add(all("SELECT date AS day, COUNT(*) AS n FROM vaccinations WHERE date BETWEEN ? AND ? GROUP BY date", from, to), "vaccinations");
  add(all("SELECT substr(issued_at, 1, 10) AS day, COUNT(*) AS n FROM referrals WHERE substr(issued_at, 1, 10) BETWEEN ? AND ? GROUP BY day", from, to), "referrals");
  add(all("SELECT day, COUNT(*) AS n FROM queue WHERE day BETWEEN ? AND ? AND state = 'done' GROUP BY day", from, to), "queue");

  const range = [from, to];
  const diagnoses = all(`SELECT COALESCE(NULLIF(diagnosis_code, ''), '—') AS code, diagnosis_name AS name, COUNT(*) AS count FROM encounters
    WHERE date BETWEEN ? AND ? AND diagnosis_name IS NOT NULL GROUP BY diagnosis_code, diagnosis_name ORDER BY count DESC, name LIMIT 20`, ...range);
  const wards = all(`SELECT p.ward AS ward, COUNT(*) AS encounters, COUNT(DISTINCT p.patient_id) AS patients FROM encounters e JOIN patients p ON p.patient_id = e.patient_id
    WHERE e.date BETWEEN ? AND ? GROUP BY p.ward ORDER BY encounters DESC, ward`, ...range);
  const bands = new Map([["Dưới 6 tuổi", 0], ["6–17 tuổi", 0], ["18–59 tuổi", 0], ["60 tuổi trở lên", 0]]);
  for (const { birth_year: birth, n } of all("SELECT p.birth_year, COUNT(*) AS n FROM encounters e JOIN patients p ON p.patient_id = e.patient_id WHERE e.date BETWEEN ? AND ? GROUP BY p.birth_year", ...range)) {
    const age = year - birth;
    const band = age < 6 ? "Dưới 6 tuổi" : age < 18 ? "6–17 tuổi" : age < 60 ? "18–59 tuổi" : "60 tuổi trở lên";
    bands.set(band, bands.get(band) + n);
  }
  const vaccines = all("SELECT vaccine, COUNT(*) AS doses, COUNT(DISTINCT patient_id) AS patients FROM vaccinations WHERE date BETWEEN ? AND ? GROUP BY vaccine ORDER BY doses DESC, vaccine", ...range);
  const days = [...byDay.values()];
  const totals = {
    encounters: days.reduce((sum, item) => sum + item.encounters, 0), vaccinations: days.reduce((sum, item) => sum + item.vaccinations, 0),
    referrals: days.reduce((sum, item) => sum + item.referrals, 0), queue: days.reduce((sum, item) => sum + item.queue, 0),
    patients: one("SELECT COUNT(DISTINCT patient_id) AS n FROM encounters WHERE date BETWEEN ? AND ?", ...range).n,
  };
  return { from, to, totals, daily: days, diagnoses, wards, ages: [...bands].map(([band, count]) => ({ band, count })), vaccines };
}

/** A spreadsheet that opens a cell starting with = + - @ as a formula can be abused, so those cells are prefixed with an apostrophe. */
const cell = value => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
const TABLES = {
  daily: [["Ngày", "date"], ["Lượt khám", "encounters"], ["Mũi tiêm", "vaccinations"], ["Phiếu chuyển tuyến", "referrals"], ["Số đã khám", "queue"]],
  diagnoses: [["Mã bệnh", "code"], ["Chẩn đoán", "name"], ["Số lượt", "count"]],
  wards: [["Xã/phường", "ward"], ["Lượt khám", "encounters"], ["Số người bệnh", "patients"]],
  ages: [["Nhóm tuổi", "band"], ["Lượt khám", "count"]],
  vaccines: [["Vắc xin", "vaccine"], ["Số mũi", "doses"], ["Số người", "patients"]],
};

/** UTF-8 with a byte-order mark so Excel reads Vietnamese correctly. */
export function reportCsv(report, kind) {
  const columns = TABLES[kind];
  if (!columns) throw new RangeError("unknown-report-kind");
  const lines = [columns.map(([label]) => cell(label)).join(","), ...report[kind].map(row => columns.map(([, key]) => cell(row[key])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
