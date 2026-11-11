// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// Demo vaccination schedule used to flag doses that are due. It is a simplified, team-written
// table for the synthetic dataset, not clinical guidance: a real station follows the national
// immunisation programme. Keys are CVX codes (see junctura-health seed/catalog.mjs).
export const SCHEDULE = {
  "141": { name: "Vắc xin cúm mùa", repeatDays: 365 },
  "112": { name: "Vắc xin uốn ván (VAT)", doses: 3, intervalDays: 28 },
  "43": { name: "Vắc xin viêm gan B", doses: 3, intervalDays: 30 },
  "213": { name: "Vắc xin COVID-19", doses: 3, intervalDays: 90 },
};

const DAY = 86_400_000;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY);

/** Days ahead that still count as "soon". */
export const SOON_DAYS = 30;

/**
 * Doses a person is due for: the next dose of an unfinished series, or the yearly repeat.
 * State is "overdue" (date passed) or "soon" (within SOON_DAYS); later doses are not listed.
 */
export function dosesDue(vaccinations, today) {
  const latest = new Map();
  for (const item of vaccinations) {
    const known = latest.get(item.code);
    if (!known || item.date > known.date || (item.date === known.date && item.doseNumber > known.doseNumber)) latest.set(item.code, item);
  }
  const due = [];
  for (const [code, last] of latest) {
    const rule = SCHEDULE[code];
    if (!rule) continue;
    let nextDose;
    let dueDate;
    if (rule.repeatDays) { nextDose = last.doseNumber + 1; dueDate = addDays(last.date, rule.repeatDays); }
    else if (last.doseNumber < rule.doses) { nextDose = last.doseNumber + 1; dueDate = addDays(last.date, rule.intervalDays); }
    else continue;
    const late = daysBetween(dueDate, today);
    if (late > 0) due.push({ vaccine: rule.name, code, nextDose, due: dueDate, state: "overdue", daysLate: late });
    else if (-late <= SOON_DAYS) due.push({ vaccine: rule.name, code, nextDose, due: dueDate, state: "soon", daysLate: late });
  }
  return due;
}
