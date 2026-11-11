// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { allergyView, filterPatients, historyOf, tabFromPath } from "./domain";
import type { PatientRecord, PatientSummary } from "./types";

const NOW = new Date("2026-11-01");
const p = (over: Partial<PatientSummary>): PatientSummary => ({ patientId: "P1", patientName: "Nguyễn Văn An", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc", allergyState: "not-recorded", allergyCount: 0, severeAllergy: false, lastVisit: null, ...over });
const list = [p({}), p({ patientId: "P2", patientName: "Lê Thị Bé", birthYear: 2023 }), p({ patientId: "P3", patientName: "Trần Văn Lão", birthYear: 1950, allergyState: "recorded", allergyCount: 1 })];

describe("filterPatients", () => {
  it("filters by group", () => {
    expect(filterPatients(list, "allergy", "", NOW).map(x => x.patientId)).toEqual(["P3"]);
    expect(filterPatients(list, "elder", "", NOW).map(x => x.patientId)).toEqual(["P3"]);
    expect(filterPatients(list, "child", "", NOW).map(x => x.patientId)).toEqual(["P2"]);
  });
  it("matches names without diacritics and by record id", () => {
    expect(filterPatients(list, "all", "le thi", NOW).map(x => x.patientId)).toEqual(["P2"]);
    expect(filterPatients(list, "all", "p3", NOW).map(x => x.patientId)).toEqual(["P3"]);
  });
});

describe("allergyView", () => {
  it("never reports none-known from an empty list", () => {
    expect(allergyView({ allergyState: "not-recorded", allergies: [] })).toEqual({ state: "not-recorded", items: [] });
  });
  it("lists recorded allergies with severity", () => {
    const view = allergyView({ allergyState: "recorded", allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Phát ban" }] });
    expect(view.state).toBe("recorded");
    expect(view.items[0]).toContain("Penicillin");
  });
});

describe("historyOf / tabFromPath", () => {
  it("merges visits, vaccines and referrals newest first", () => {
    const record = { encounters: [{ date: "2026-01-05", reason: "Ho" }], vaccinations: [{ vaccine: "Cúm", code: "141", date: "2026-03-01", doseNumber: 1 }], referrals: [{ referralId: "R1", issuedAt: "2026-02-01T08:00:00Z", toFacility: "BV", urgency: "routine", reason: "x" }] } as unknown as PatientRecord;
    expect(historyOf(record).map(e => e.kind)).toEqual(["vaccine", "referral", "visit"]);
  });
  it("falls back to summary for unknown tabs", () => {
    expect(tabFromPath("history")).toBe("history");
    expect(tabFromPath("nope")).toBe("summary");
    expect(tabFromPath(undefined)).toBe("summary");
  });
});
