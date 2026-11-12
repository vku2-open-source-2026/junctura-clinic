// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildClinicData } from "../server/data.mjs";
import { fixture, startApp } from "./helpers.mjs";

const staff = { username: "ysi.tramyte", displayName: "Y sĩ Lê Thị Hoa" };
const api = app => async (path, { method = "GET", body, user = "ysi.tramyte" } = {}) => {
  const response = await fetch(app.base + path, {
    method, headers: { authorization: `Bearer ${app.signer.sign({ preferred_username: user })}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: type.includes("json") ? JSON.parse(bytes.toString("utf8")) : bytes.toString("utf8"), headers: response.headers };
};
const patient = (id, name, birthYear) => ({
  subject: `s-${id}`, patientId: id, patientName: name, birthYear, sex: "female", ward: "Hòa Khánh Bắc",
  allergies: [], chronicConditions: [], currentMedications: [], encounters: [], vaccinations: [],
});
const crowd = () => buildClinicData({
  ...fixture, today: "2026-11-01",
  clinic: { ...fixture.clinic, patients: [...fixture.clinic.patients, patient("P0003", "Bé Lê Na", 2024), patient("P0004", "Cụ Ngô Thị Lan", 1945), patient("P0005", "Phạm Văn Ba", 1990)] },
});

test("an insurance number is optional, checked, and kept on the record", async () => {
  const app = await startApp();
  const call = api(app);
  try {
    const created = await call("/api/patients", { method: "POST", body: { patientName: "Võ Thị Cúc", birthYear: 1990, sex: "female", ward: "Hòa Khánh", insuranceNo: "dn4 797 9123456 78" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.insuranceNo, "DN4797912345678");
    const bad = await call("/api/patients", { method: "POST", body: { patientName: "Võ Thị Dung", birthYear: 1990, sex: "female", ward: "Hòa Khánh", insuranceNo: "12345" } });
    assert.equal(bad.status, 422);
    assert.match(bad.body.fields.insuranceNo, /định dạng/);
    const updated = await call("/api/patients/P0001/insurance", { method: "PUT", body: { insuranceNo: "DN4797912340000" } });
    assert.equal(updated.body.insuranceNo, "DN4797912340000");
    assert.equal((await call("/api/patients/P0001/insurance", { method: "PUT", body: {} })).body.insuranceNo, undefined, "clearing is allowed");
    const note = app.data.audit({ patientId: "P0001", limit: 5 }).find(entry => entry.action === "patient.insurance");
    assert.ok(note && !note.detail.includes("DN4"), "the audit line never repeats the number");
  } finally { await app.close(); }
});

test("urgent people go first, then young children and older people, then everyone else by number", () => {
  const data = crowd();
  for (const [id, priority] of [["P0005", "normal"], ["P0001", "normal"], ["P0003", "normal"], ["P0004", "normal"], ["P0002", "urgent"]]) data.enqueue({ patientId: id, reason: "Khám", priority }, staff);
  assert.deepEqual(data.queueToday().map(item => item.patientId), ["P0002", "P0003", "P0004", "P0005", "P0001"]);
  assert.deepEqual(data.queueToday().map(item => item.group), [null, "child", "senior", null, null]);
  data.close();
});

test("each station keeps its own line and its own ticket numbers", () => {
  const data = crowd();
  const [, second] = [0, data.addStation("Điểm khám Hòa Khánh Nam", staff)].map((_, index, all) => all[1].at(-1));
  assert.deepEqual(data.stations().map(item => item.name), ["Trạm Y tế thử nghiệm", "Điểm khám Hòa Khánh Nam"]);
  assert.equal(data.enqueue({ patientId: "P0001", reason: "Khám" }, staff).ticket, "001");
  assert.equal(data.enqueue({ patientId: "P0002", reason: "Khám", stationId: second.id }, staff).ticket, "001");
  assert.deepEqual([data.queueToday("main").length, data.queueToday(second.id).length, data.queueToday().length], [1, 1, 2]);
  assert.throws(() => data.enqueue({ patientId: "P0003", reason: "Khám", stationId: "nowhere" }, staff), { code: "station-not-found" });
  assert.throws(() => data.addStation("Điểm khám Hòa Khánh Nam", staff), { code: "station-exists" });
  assert.equal(data.renameStation(second.id, "Điểm khám phụ", staff).at(-1).name, "Điểm khám phụ");
  data.close();
});

test("a database made before stations, insurance and referral status existed is upgraded in place", () => {
  const file = join(mkdtempSync(join(tmpdir(), "clinic-db-")), "old.db");
  buildClinicData({ ...fixture, today: "2026-11-01", file }).close();
  const raw = new DatabaseSync(file);
  for (const sql of ["ALTER TABLE patients DROP COLUMN insurance_no", "ALTER TABLE referrals DROP COLUMN status", "ALTER TABLE queue DROP COLUMN station_id", "DROP TABLE stations"]) raw.exec(sql);
  raw.close();
  const data = buildClinicData({ ...fixture, today: "2026-11-01", file });
  assert.equal(data.get("P0001").patientName, "Nguyễn Văn An");
  assert.equal(data.stations().length, 1);
  assert.equal(data.get("P0001").referrals[0].status, "issued");
  assert.equal(data.enqueue({ patientId: "P0001", reason: "Khám" }, staff).station, "main");
  data.close();
});

test("a referral shows how often the receiving side read it through Junctura, and staff can set its status", async () => {
  const app = await startApp();
  const call = api(app);
  try {
    assert.deepEqual((await call("/api/referrals")).body.referrals.map(item => item.viewCount), [undefined]);
    const line = { capability: "referral-summary", purpose: "referral_intake", emergency: false, outcome: "answered", reference: "CT-1" };
    app.data.log({ username: "junctura", displayName: "Junctura" }, "capability.call", "P0001", JSON.stringify(line));
    app.data.log({ username: "junctura", displayName: "Junctura" }, "capability.call", "P0001", JSON.stringify({ ...line, outcome: "refused:purpose_not_allowed" }));
    app.data.log({ username: "junctura", displayName: "Junctura" }, "capability.call", "P0001", JSON.stringify({ ...line, reference: "CT-OTHER" }));
    const [row] = (await call("/api/referrals")).body.referrals;
    assert.equal(row.viewCount, 1, "only answered calls for this referral count");
    assert.ok(row.viewedAt);
    const set = await call("/api/patients/P0001/referrals/CT-1/status", { method: "PUT", body: { status: "received" } });
    assert.equal(set.body.referrals[0].status, "received");
    assert.equal((await call("/api/patients/P0001/referrals/CT-1/status", { method: "PUT", body: { status: "bogus" } })).status, 422);
    assert.equal((await call("/api/patients/P0001/referrals/CT-404/status", { method: "PUT", body: { status: "received" } })).status, 404);
    assert.equal((await call("/api/patients/P0001/referrals/CT-1/status", { method: "PUT", body: { status: "cancelled" }, user: "letan.tram" })).status, 403);
  } finally { await app.close(); }
});

test("catalog search folds diacritics and only suggests", async () => {
  const app = await startApp();
  const call = api(app);
  try {
    const icd = await call("/api/catalog/icd10?q=tang%20huyet");
    assert.deepEqual(icd.body.items, [{ code: "I10", name: "Tăng huyết áp vô căn" }]);
    assert.equal((await call("/api/catalog/medicines?q=amoxi")).body.items[0].name, "Amoxicillin");
    assert.deepEqual((await call("/api/catalog/icd10?q=")).body.items, []);
    assert.equal((await call("/api/catalog/secrets?q=a")).status, 404);
  } finally { await app.close(); }
});

test("reports count without naming anyone, export safe CSV, and need the report permission", async () => {
  const app = await startApp();
  const call = api(app);
  try {
    app.data.addEncounter("P0001", { date: "2026-10-30", reason: "Khám", diagnosis: { code: "=1+1", name: "@cmd" }, prescriptions: [] }, staff);
    const report = await call("/api/reports?from=2026-10-01&to=2026-11-01");
    assert.equal(report.status, 200);
    assert.equal(report.body.totals.encounters, 3);
    assert.equal(report.body.daily.length, 32);
    assert.ok(!JSON.stringify(report.body).includes("Nguyễn"), "no person is named");
    const csv = await call("/api/reports.csv?from=2026-10-01&to=2026-11-01&kind=diagnoses");
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /bao-cao-chan-doan-2026-10-01-2026-11-01\.csv/);
    assert.ok(csv.body.startsWith("﻿"));
    assert.ok(csv.body.includes("'=1+1,'@cmd,1"), "cells that look like formulas are neutralised");
    assert.equal((await call("/api/reports?from=2026-11-02&to=2026-11-01")).status, 422);
    assert.equal((await call("/api/reports?from=2020-01-01&to=2026-11-01")).body.error, "range-too-long");
    assert.equal((await call("/api/reports.csv?kind=nope")).status, 422);
    assert.equal((await call("/api/reports", { user: "letan.tram" })).status, 403);
  } finally { await app.close(); }
});

test("people can take a ticket without signing in and learn nothing about anyone", async () => {
  const app = await startApp();
  const get = async (path, init) => { const response = await fetch(app.base + path, init); return { status: response.status, body: await response.json() }; };
  const post = body => get("/api/public/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const first = await post({ patientName: "nguyen van an", birthYear: 1968, reason: "Đau ngực" });
    assert.equal(first.status, 200);
    assert.deepEqual(Object.keys(first.body).sort(), ["ahead", "already", "state", "station", "ticket"]);
    assert.equal(first.body.already, false);
    const again = await post({ patientName: "Nguyễn Văn An", birthYear: 1968 });
    assert.deepEqual([again.body.already, again.body.ticket], [true, first.body.ticket]);
    assert.equal((await post({ patientName: "Không Có Ai", birthYear: 1968 })).status, 404);
    assert.equal((await post({ patientName: "Nguyễn Văn An", birthYear: 1969 })).status, 404, "name and year must both match");
    assert.equal((await post({ patientName: "A" })).status, 422);
    const board = await get("/api/public/board");
    assert.deepEqual(board.body.calling, []);
    assert.deepEqual(board.body.waiting.map(item => item.ticket), [first.body.ticket]);
    assert.ok(!JSON.stringify(board.body).includes("Nguyễn"), "the board shows numbers only");
    assert.equal((await get("/api/public/board?station=nowhere")).status, 404);
    assert.equal((await get("/api/public/info")).body.facility, "Trạm Y tế thử nghiệm");
    assert.equal(app.data.audit({ limit: 5 }).find(entry => entry.action === "queue.add").username, "self-service");
    for (let i = 0; i < 8; i += 1) await post({ patientName: "Không Có Ai", birthYear: 1968 });
    assert.equal((await post({ patientName: "Nguyễn Văn An", birthYear: 1968 })).status, 429, "guessing is rate limited");
    assert.equal((await get("/api/queue")).status, 401, "the staff queue still needs sign-in");
  } finally { await app.close(); }
});
