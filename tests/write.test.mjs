// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildClinicData } from "../server/data.mjs";
import { TODAY, fixture, startApp } from "./helpers.mjs";

const call = async (app, method, path, body, { token = app.signer.sign() } = {}) => {
  const response = await fetch(app.base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};
const as = (app, username) => ({ token: app.signer.sign({ preferred_username: username }) });
const withApp = async fn => {
  const app = await startApp();
  try { await fn(app); } finally { await app.close(); }
};

test("writes need JSON, a signed-in person and the right role", async () => {
  await withApp(async app => {
    const anonymous = await fetch(`${app.base}/api/patients`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(anonymous.status, 401);
    const text = await fetch(`${app.base}/api/patients`, { method: "POST", headers: { authorization: `Bearer ${app.signer.sign()}`, "content-type": "text/plain" }, body: "x" });
    assert.equal(text.status, 415);
    assert.equal((await call(app, "POST", "/api/patients", { patientName: "A" })).status, 422);
    // The front desk may register and queue people but never writes anything clinical.
    const desk = as(app, "letan.tram");
    assert.equal((await call(app, "POST", "/api/patients/P0001/encounters", { reason: "Ho" }, desk)).status, 403);
    assert.equal((await call(app, "POST", "/api/patients/P0001/vaccinations", { code: "141" }, desk)).status, 403);
    assert.equal((await call(app, "POST", "/api/patients/P0001/referrals", { toFacility: "BV", urgency: "routine", reason: "Cần khám thêm" }, desk)).status, 403);
    assert.equal((await call(app, "PUT", "/api/patients/P0001/allergies", { items: [] }, desk)).status, 403);
    assert.equal((await call(app, "GET", "/api/audit", undefined, desk)).status, 403);
    assert.equal((await call(app, "PUT", "/api/settings", { aiSummary: true }, desk)).status, 403);
    assert.equal((await call(app, "POST", "/api/patients", { patientName: "Lê Văn Cường", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc" }, desk)).status, 201);
  });
});

test("registering a person validates input, numbers the record and warns about duplicates", async () => {
  await withApp(async app => {
    const bad = await call(app, "POST", "/api/patients", { patientName: " ", birthYear: 2099, sex: "x", ward: "" });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ["birthYear", "patientName", "sex", "ward"]);

    const created = await call(app, "POST", "/api/patients", { patientName: "  Lê Văn Cường ", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc", phone: "090 123 4567" });
    assert.equal(created.status, 201);
    assert.equal(created.body.patientId, "P0003");
    assert.equal(created.body.patientName, "Lê Văn Cường");
    assert.equal(created.body.phone, "0901234567");
    assert.equal(created.body.allergyState, "not-recorded");

    const duplicate = await call(app, "POST", "/api/patients", { patientName: "le van cuong", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, "possible-duplicate");
    assert.equal(duplicate.body.matches[0].patientId, "P0003");
    assert.equal((await call(app, "POST", "/api/patients", { patientName: "le van cuong", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc", confirmDuplicate: true })).status, 201);
    assert.deepEqual((await call(app, "GET", "/api/patients?q=cuong")).body.patients.map(p => p.patientId), ["P0003", "P0004"]);
  });
});

test("an exam is saved with vitals, prescriptions and closes the queue entry", async () => {
  await withApp(async app => {
    const queued = await call(app, "POST", "/api/queue", { patientId: "P0002", reason: "Ho kéo dài", priority: "urgent" });
    assert.equal(queued.status, 201);
    assert.equal(queued.body.ticket, "001");
    assert.equal((await call(app, "POST", "/api/queue", { patientId: "P0002", reason: "Ho" })).status, 409);
    assert.equal((await call(app, "POST", `/api/queue/${queued.body.id}/call`)).body.state, "called");
    assert.equal((await call(app, "POST", `/api/queue/${queued.body.id}/call`)).status, 409);

    const exam = await call(app, "POST", "/api/patients/P0002/encounters", {
      reason: "Ho kéo dài 2 tuần", vitals: { temperatureC: "37,5", pulse: 88, systolic: 120, diastolic: 80, spo2: 97, weightKg: 54 },
      diagnosis: { code: "J20", name: "Viêm phế quản cấp" }, notes: "Phổi thông khí đều", advice: "Uống đủ nước, tái khám sau 5 ngày",
      prescriptions: [{ name: "Amlodipin", dose: "5 mg x 1 lần/ngày", ongoing: true }, { name: "Paracetamol", dose: "500 mg khi sốt" }], queueId: queued.body.id,
    });
    assert.equal(exam.status, 201);
    const record = exam.body;
    const last = record.encounters.at(-1);
    assert.deepEqual([last.date, last.reason, last.diagnosis.name, last.vitals.temperatureC, last.by], [TODAY, "Ho kéo dài 2 tuần", "Viêm phế quản cấp", 37.5, "ysi.tramyte"]);
    assert.deepEqual(record.currentMedications.map(item => item.name), ["Amlodipin"]);

    const queue = (await call(app, "GET", "/api/queue")).body.queue;
    assert.deepEqual(queue.map(item => [item.patientId, item.state]), [["P0002", "done"]]);
    const overview = (await call(app, "GET", "/api/overview")).body;
    assert.deepEqual([overview.counts.waiting, overview.counts.seenToday], [0, 1]);
  });
});

test("an exam refuses impossible values and future dates", async () => {
  await withApp(async app => {
    const bad = await call(app, "POST", "/api/patients/P0002/encounters", { date: "2026-12-31", reason: "", vitals: { temperatureC: 60, spo2: 140 }, prescriptions: [{ name: "", dose: "" }] });
    assert.equal(bad.status, 422);
    for (const field of ["date", "reason", "vitals", "prescriptions"]) assert.ok(field in bad.body.fields, field);
    assert.equal((await call(app, "POST", "/api/patients/P9999/encounters", { reason: "Ho" })).status, 404);
    assert.equal((await call(app, "GET", "/api/patients/P0002")).body.encounters.length, 1);
  });
});

test("prescribing something the person is allergic to needs a written reason", async () => {
  await withApp(async app => {
    const blocked = await call(app, "POST", "/api/patients/P0001/encounters", { reason: "Viêm họng", prescriptions: [{ name: "Penicillin V", dose: "500 mg" }] });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, "allergy-conflict");
    assert.deepEqual(blocked.body.conflicts[0], { medicine: "Penicillin V", allergen: "Penicillin", severity: "severe" });
    assert.equal((await call(app, "GET", "/api/patients/P0001")).body.encounters.length, 2);

    const noReason = await call(app, "POST", "/api/patients/P0001/encounters", { reason: "Viêm họng", prescriptions: [{ name: "Penicillin V", dose: "500 mg" }], overrideAllergy: true });
    assert.equal(noReason.status, 422);
    assert.ok(noReason.body.fields.overrideReason);

    const allowed = await call(app, "POST", "/api/patients/P0001/encounters", { reason: "Viêm họng", prescriptions: [{ name: "Penicillin V", dose: "500 mg" }], overrideAllergy: true, overrideReason: "Bác sĩ đã hỏi lại, phản ứng cũ là do thuốc khác" });
    assert.equal(allowed.status, 201);
    const audit = (await call(app, "GET", "/api/audit")).body.entries;
    assert.match(audit.find(item => item.action === "encounter.create").detail, /trái cảnh báo dị ứng/);

    assert.equal((await call(app, "POST", "/api/patients/P0001/medications", { name: "Penicillin", dose: "1 viên" })).status, 409);
  });
});

test("allergies: a list, 'no known allergies' and back to not recorded", async () => {
  await withApp(async app => {
    const none = await call(app, "PUT", "/api/patients/P0002/allergies", { noKnownAllergies: true, items: [] });
    assert.equal(none.body.allergyState, "none-known");
    const some = await call(app, "PUT", "/api/patients/P0002/allergies", { items: [{ substance: "Tôm", severity: "moderate", reaction: "Nổi mẩn" }] });
    assert.deepEqual([some.body.allergyState, some.body.allergies.length], ["recorded", 1]);
    const bad = await call(app, "PUT", "/api/patients/P0002/allergies", { items: [{ substance: "T", severity: "nặng", reaction: "" }] });
    assert.equal(bad.status, 422);
    const reset = await call(app, "PUT", "/api/patients/P0002/allergies", { items: [] });
    assert.equal(reset.body.allergyState, "not-recorded");
  });
});

test("chronic conditions and long-term medicines can be added and stopped", async () => {
  await withApp(async app => {
    const condition = await call(app, "POST", "/api/patients/P0002/conditions", { code: "I10", name: "Tăng huyết áp vô căn", since: "2026-10-01" });
    assert.equal(condition.body.chronicConditions[0].name, "Tăng huyết áp vô căn");
    const medicine = await call(app, "POST", "/api/patients/P0002/medications", { name: "Amlodipin", dose: "5 mg x 1 lần/ngày" });
    assert.equal(medicine.status, 201);
    const id = medicine.body.currentMedications[0].id;
    assert.equal((await call(app, "POST", `/api/patients/P0002/medications/${id}/stop`)).body.currentMedications.length, 0);
    assert.equal((await call(app, "POST", `/api/patients/P0002/medications/${id}/stop`)).status, 404);
  });
});

test("vaccination: the dose number follows the schedule and a finished series is refused", async () => {
  await withApp(async app => {
    const first = await call(app, "POST", "/api/patients/P0001/vaccinations", { code: "112", lot: "VAT-2611" });
    assert.equal(first.status, 201);
    assert.deepEqual([first.body.vaccinations.at(-1).doseNumber, first.body.vaccinations.at(-1).lot], [1, "VAT-2611"]);
    assert.equal((await call(app, "POST", "/api/patients/P0001/vaccinations", { code: "112" })).status, 409);
    assert.equal((await call(app, "POST", "/api/patients/P0001/vaccinations", { code: "112", date: "2026-11-30" })).status, 422);
    assert.equal((await call(app, "POST", "/api/patients/P0001/vaccinations", { code: "999" })).status, 422);

    // Second dose of the yearly flu shot restarts the clock; the reminder disappears.
    assert.ok((await call(app, "GET", "/api/patients/P0002")).body.vaccinesDue.some(item => item.code === "141"));
    assert.equal((await call(app, "POST", "/api/patients/P0002/vaccinations", { code: "141" })).status, 201);
    assert.ok(!(await call(app, "GET", "/api/patients/P0002")).body.vaccinesDue.some(item => item.code === "141"));
    assert.equal((await call(app, "GET", "/api/patients/P0002")).body.vaccinationsUpdatedAt, `${TODAY}T08:00:00.000Z`);
  });
});

test("referrals get the next number and appear in the list", async () => {
  await withApp(async app => {
    const bad = await call(app, "POST", "/api/patients/P0002/referrals", { toFacility: "", urgency: "now", reason: "x" });
    assert.equal(bad.status, 422);
    const made = await call(app, "POST", "/api/patients/P0002/referrals", {
      toFacility: "Bệnh viện Đà Nẵng", urgency: "urgent", reason: "Ho ra máu, cần chụp phổi", provisionalDiagnosis: { code: "R04.2", name: "Ho ra máu" }, treatmentGiven: "Cho nằm nghỉ, theo dõi mạch",
    });
    assert.equal(made.status, 201);
    assert.match(made.body.referralId, /^CT-2026-\d{6}$/);
    assert.equal(made.body.record.referrals.at(-1).provisionalDiagnosis.name, "Ho ra máu");
    const list = (await call(app, "GET", "/api/referrals")).body.referrals;
    assert.deepEqual(list.map(item => item.patientId), ["P0002", "P0001"]);
  });
});

test("every write and every record view lands in the audit log", async () => {
  await withApp(async app => {
    await call(app, "GET", "/api/patients/P0001");
    await call(app, "POST", "/api/patients/P0002/vaccinations", { code: "141" });
    await call(app, "POST", "/api/queue", { patientId: "P0001", reason: "Đau ngực" });
    const entries = (await call(app, "GET", "/api/audit")).body.entries;
    assert.deepEqual(entries.map(item => item.action), ["queue.add", "vaccination.record", "patient.view"]);
    assert.deepEqual([entries[0].username, entries[0].patientName], ["ysi.tramyte", "Nguyễn Văn An"]);
    assert.equal(entries.every(item => !("body" in item)), true);
    assert.deepEqual((await call(app, "GET", "/api/audit?patient=P0002")).body.entries.map(item => item.action), ["vaccination.record"]);
  });
});

test("the rule-based summary is off until enabled and never claims more than the record says", async () => {
  await withApp(async app => {
    assert.equal((await call(app, "GET", "/api/settings")).body.aiSummary, false);
    assert.equal((await call(app, "GET", "/api/patients/P0002/summary")).status, 409);
    assert.equal((await call(app, "PUT", "/api/settings", { aiSummary: true })).body.aiSummary, true);
    const summary = await call(app, "GET", "/api/patients/P0002/summary");
    assert.equal(summary.body.kind, "template");
    assert.ok(summary.body.lines.some(line => /chưa ghi nhận.*không có nghĩa là không dị ứng/.test(line)));
    assert.equal((await call(app, "GET", "/api/patients/P9999/summary")).status, 404);
  });
});

test("data survives a restart and the seed is loaded only once", () => {
  const file = join(mkdtempSync(join(tmpdir(), "clinic-db-")), "clinic.db");
  const first = buildClinicData({ ...fixture, today: TODAY, file });
  const by = { username: "ysi.tramyte", displayName: "Y sĩ Lê Thị Hoa" };
  first.createPatient({ patientName: "Lê Văn Cường", birthYear: 1990, sex: "male", ward: "Hòa Khánh Bắc" }, by);
  first.close();
  const second = buildClinicData({ ...fixture, clinic: { ...fixture.clinic, patients: [] }, today: TODAY, file });
  assert.equal(second.list().length, 3);
  assert.equal(second.audit()[0].action, "patient.create");
  assert.equal(second.facility, fixture.clinic.facility);
  second.close();
});
