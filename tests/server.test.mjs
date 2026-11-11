// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startApp } from "./helpers.mjs";

const get = async (base, path, token, init = {}) => {
  const response = await fetch(base + path, { ...init, headers: { ...(token && { authorization: `Bearer ${token}` }) } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
};

test("health and public config need no sign-in", async () => {
  const app = await startApp();
  try {
    assert.equal((await get(app.base, "/healthz")).status, 200);
    const config = await get(app.base, "/api/config");
    assert.equal(config.status, 200);
    assert.deepEqual(Object.keys(config.body).sort(), ["clientId", "facility", "issuer"]);
  } finally { await app.close(); }
});

test("patient data requires a valid token", async () => {
  const app = await startApp();
  try {
    for (const path of ["/api/me", "/api/patients", "/api/patients/P0001", "/api/overview", "/api/vaccinations", "/api/referrals"]) {
      const anonymous = await get(app.base, path);
      assert.equal(anonymous.status, 401, path);
      assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");
      assert.equal((await get(app.base, path, "garbage")).status, 401, path);
      assert.equal((await get(app.base, path, app.signer.sign({ exp: 1 }))).status, 401, path);
    }
  } finally { await app.close(); }
});

test("signed-in people who are not clinic staff are refused", async () => {
  const app = await startApp();
  try {
    for (const username of ["bacsi.benhvien", "someone.unknown", "khach.tram"]) {
      const response = await get(app.base, "/api/patients", app.signer.sign({ preferred_username: username }));
      assert.equal(response.status, 403, username);
      assert.deepEqual(response.body, { error: "not-clinic-staff" });
    }
  } finally { await app.close(); }
});

test("clinic staff list, search and open patient records", async () => {
  const app = await startApp();
  const token = app.signer.sign();
  try {
    const me = await get(app.base, "/api/me", token);
    assert.deepEqual({ ...me.body, permissions: undefined }, { username: "ysi.tramyte", displayName: "Y sĩ Lê Thị Hoa", role: "clinic-staff", permissions: undefined });
    assert.ok(me.body.permissions.includes("exam"));

    const all = await get(app.base, "/api/patients", token);
    assert.equal(all.body.patients.length, 2);
    const an = all.body.patients.find(patient => patient.patientId === "P0001");
    assert.deepEqual([an.severeAllergy, an.lastVisit], [true, "2026-10-28"]);
    assert.equal("subject" in an, false);

    assert.deepEqual((await get(app.base, "/api/patients?q=nguyen%20van", token)).body.patients.map(p => p.patientId), ["P0001"]);
    assert.deepEqual((await get(app.base, "/api/patients?q=p0002", token)).body.patients.map(p => p.patientId), ["P0002"]);
    assert.deepEqual((await get(app.base, "/api/patients?q=khong-co", token)).body.patients, []);

    const record = await get(app.base, "/api/patients/P0001", token);
    assert.equal(record.body.allergies[0].substance, "Penicillin");
    assert.equal(record.body.referrals.length, 1);
    assert.equal("subject" in record.body, false);
    assert.equal("subject" in record.body.referrals[0], false);
    assert.equal((await get(app.base, "/api/patients/P0002", token)).body.referrals.length, 0);
    assert.equal((await get(app.base, "/api/patients/P9999", token)).status, 404);
    assert.equal((await get(app.base, "/api/unknown", token)).status, 404);
  } finally { await app.close(); }
});

test("clinic staff get the overview, due vaccinations and referrals", async () => {
  const app = await startApp();
  const token = app.signer.sign();
  try {
    const overview = (await get(app.base, "/api/overview", token)).body;
    assert.equal(overview.today, "2026-11-01");
    assert.deepEqual(overview.counts, { patients: 2, severeAllergy: 1, vaccinesOverdue: 1, vaccinesSoon: 1, encounters30d: 2, referrals30d: 1, waiting: 0, inExam: 0, seenToday: 0 });
    assert.deepEqual(overview.severeAllergy.map(p => p.patientId), ["P0001"]);
    assert.deepEqual(overview.recentEncounters.map(e => e.patientId), ["P0002", "P0001", "P0001"]);
    assert.equal(overview.recentReferrals[0].patientName, "Nguyễn Văn An");

    const vaccinations = (await get(app.base, "/api/vaccinations", token)).body;
    assert.deepEqual(vaccinations.due.map(item => [item.patientId, item.code, item.state, item.nextDose]), [["P0002", "141", "overdue", 2], ["P0002", "43", "soon", 2]]);

    const referrals = (await get(app.base, "/api/referrals", token)).body.referrals;
    assert.deepEqual(referrals.map(item => [item.referralId, item.patientId]), [["CT-1", "P0001"]]);
    assert.equal("subject" in referrals[0], false);
  } finally { await app.close(); }
});

test("an empty allergy list is reported as not recorded, never as no allergy", async () => {
  const app = await startApp();
  const token = app.signer.sign();
  try {
    const list = (await get(app.base, "/api/patients", token)).body.patients;
    assert.deepEqual(list.map(p => [p.patientId, p.allergyState]), [["P0001", "recorded"], ["P0002", "not-recorded"]]);
    assert.equal((await get(app.base, "/api/patients/P0002", token)).body.allergyState, "not-recorded");
    assert.equal((await get(app.base, "/api/patients/P0001", token)).body.allergyState, "recorded");
    assert.deepEqual((await get(app.base, "/api/patients/P0002", token)).body.vaccinesDue.map(item => [item.code, item.state]), [["141", "overdue"], ["43", "soon"]]);
  } finally { await app.close(); }
});

test("unsupported methods are refused and responses carry security headers", async () => {
  const app = await startApp();
  try {
    assert.equal((await get(app.base, "/api/patients", app.signer.sign(), { method: "DELETE" })).status, 405);
    assert.equal((await get(app.base, "/", undefined, { method: "POST" })).status, 405);
    assert.equal((await get(app.base, "/api/config", undefined, { method: "POST" })).status, 405);
    const response = await get(app.base, "/healthz");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'self' https:\/\/id\.example\.test/);
  } finally { await app.close(); }
});

test("serves the built UI, falls back to the app shell and never leaves the directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clinic-ui-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Clinic</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "..", "clinic-secret.txt"), "secret");
  const app = await startApp({ staticDir: dir });
  try {
    const index = await get(app.base, "/");
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.match((await get(app.base, "/patients/P0001")).body, /<title>Clinic/);
    const asset = await get(app.base, "/assets/app.js");
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal((await get(app.base, "/assets/missing.js")).status, 404);
    for (const path of ["/../clinic-secret.txt", "/%2e%2e/clinic-secret.txt", "/..%2fclinic-secret.txt"]) {
      const response = await get(app.base, path);
      assert.ok(!String(response.body).includes("secret"), path);
    }
  } finally { await app.close(); }
});
