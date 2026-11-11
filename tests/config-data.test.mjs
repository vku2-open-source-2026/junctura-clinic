// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../server/config.mjs";
import { buildClinicData, fold, loadClinicData } from "../server/data.mjs";
import { parseEnv } from "../server/env.mjs";
import { fixture } from "./helpers.mjs";

test("parseEnv reads KEY=VALUE lines and ignores comments", () => {
  assert.deepEqual(parseEnv("# c\nA=1\n B = \"two words\" \n\nC='x'\n#D=4\n"), { A: "1", B: "two words", C: "x" });
});

test("config requires the Junctura issuer and web client", () => {
  assert.throws(() => loadConfig({ env: { JUNCTURA_CLINIC_ENV: "/nonexistent.env" } }), /JUNCTURA_ISSUER/);
});

test("config reads the demo credentials file and lets the environment override it", () => {
  const dir = mkdtempSync(join(tmpdir(), "clinic-env-"));
  const file = join(dir, "clinic.env");
  writeFileSync(file, "JUNCTURA_ISSUER=https://id.example.test/identity/realms/junctura/\nJUNCTURA_WEB_CLIENT_ID=health-clinic-web\nWEB_PORT=5181\nJUNCTURA_APP_CLIENT_SECRET=never-exposed\n");
  const config = loadConfig({ env: { JUNCTURA_CLINIC_ENV: file }, cwd: dir });
  assert.equal(config.issuer, "https://id.example.test/identity/realms/junctura");
  assert.equal(config.port, 5181);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(JSON.stringify(config).includes("never-exposed"), false, "the backend client secret is not part of the configuration");
  assert.equal(loadConfig({ env: { JUNCTURA_CLINIC_ENV: file, PORT: "6000" }, cwd: dir }).port, 6000);
  assert.throws(() => loadConfig({ env: { JUNCTURA_CLINIC_ENV: file, PORT: "x" }, cwd: dir }), /PORT/);
});

test("fold ignores case and Vietnamese diacritics", () => {
  assert.equal(fold("Đặng Nguyễn Thị Bình"), "dang nguyen thi binh");
});

test("clinic data separates staff from patients and hides subjects", () => {
  const data = buildClinicData(fixture);
  assert.deepEqual([...data.staff.keys()], ["ysi.tramyte"]);
  assert.equal(data.list().length, 2);
  assert.equal(data.get("P0001").referrals[0].referralId, "CT-1");
  assert.equal(data.get("nope"), null);
});

const healthDir = resolve(process.env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
test("the shared synthetic dataset loads when junctura-health is available", { skip: !existsSync(join(healthDir, "seed/generate.mjs")) && "junctura-health checkout not found" }, async () => {
  const data = await loadClinicData({ healthDir, today: "2026-11-01" });
  assert.equal(data.list().length, 50);
  assert.ok(data.staff.has("ysi.tramyte"));
  const an = data.get("P0001");
  assert.equal(an.patientName, "Nguyễn Văn An");
  assert.equal(an.allergies[0].substance, "Penicillin");
  assert.equal(an.allergies[0].severity, "severe");
  assert.equal("subject" in an, false);
  const later = await loadClinicData({ healthDir, today: "2026-12-02" });
  assert.equal(later.get("P0001").encounters.at(-1).date, "2026-11-28", "dates move with the demo day");
});
