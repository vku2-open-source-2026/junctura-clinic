// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { SummarizerError, aiConfig, createSummarizer, deidentify } from "../server/ai.mjs";
import { startApp } from "./helpers.mjs";

const record = {
  patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1968, sex: "male", ward: "Hòa Khánh Bắc", phone: "0905123456", insuranceNo: "DN4797912345678",
  allergyState: "recorded", allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Nổi mề đay" }],
  chronicConditions: [{ name: "Tăng huyết áp", since: "2019-03-12" }], currentMedications: [{ name: "Amlodipin", dose: "5 mg" }],
  encounters: [{ date: "2026-10-28", reason: "Đau ngực", diagnosis: { code: "I20.9", name: "Cơn đau thắt ngực" } }],
};
const answer = text => async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

test("nothing that names or locates the person is sent to the model", () => {
  const sent = deidentify(record, "2026-11-11");
  for (const secret of ["Nguyễn Văn An", "Hòa Khánh", "0905123456", "P0001", "1968", "DN4797912345678"]) assert.ok(!sent.includes(secret), `leaked ${secret}`);
  assert.match(sent, /Tuổi: 58/);
  assert.match(sent, /Penicillin/);
});

test("an empty allergy list is described as not recorded, not as none", () => {
  assert.match(deidentify({ ...record, allergies: [], allergyState: "not-recorded" }, "2026-11-11"), /chưa ghi nhận\): không có mục nào/);
});

test("the request carries the key and the de-identified text, and the answer becomes short plain lines", async () => {
  let seen;
  const summarize = createSummarizer({ url: "https://model.example.test/v1/chat/completions", key: "k", model: "m", fetcher: async (url, init) => { seen = { url, init }; return answer("- **Tăng huyết áp** từ 2019\n2) Dị ứng Penicillin\n\n")(); } });
  assert.deepEqual(await summarize(record, "2026-11-11"), ["Tăng huyết áp từ 2019", "Dị ứng Penicillin"]);
  assert.equal(seen.init.headers.authorization, "Bearer k");
  assert.equal(seen.init.redirect, "error");
  assert.ok(!seen.init.body.includes("Nguyễn Văn An"));
});

test("a model that fails, or answers nothing, is reported as a failure", async () => {
  const make = fetcher => createSummarizer({ url: "https://m.example.test/", model: "m", fetcher });
  await assert.rejects(make(async () => { throw new Error("down"); })(record, "2026-11-11"), SummarizerError);
  await assert.rejects(make(async () => new Response("no", { status: 500 }))(record, "2026-11-11"), /status-500/);
  await assert.rejects(make(answer("   "))(record, "2026-11-11"), /empty-answer/);
});

test("the endpoint must be HTTPS (or local) and carry no credentials", () => {
  assert.equal(aiConfig({}), null);
  assert.equal(aiConfig({ AI_SUMMARY_URL: "http://localhost:11434/v1/chat/completions" }).model, "default");
  assert.throws(() => aiConfig({ AI_SUMMARY_URL: "http://model.example.test/" }), /HTTPS/);
  assert.throws(() => aiConfig({ AI_SUMMARY_URL: "https://user:pw@model.example.test/" }), /HTTPS/);
});

test("the station decides: off by default, the model only when configured and switched on, a failure falls back to the fixed rules", async () => {
  const calls = [];
  const summarizer = async rec => { calls.push(rec.patientId); if (calls.length === 2) throw new SummarizerError("down"); return ["Tóm tắt từ mô hình"]; };
  const app = await startApp({ summarizer });
  const call = async (path, init = {}) => {
    const response = await fetch(app.base + path, { ...init, headers: { authorization: `Bearer ${app.signer.sign()}`, "content-type": "application/json" } });
    return { status: response.status, body: await response.json() };
  };
  const put = body => call("/api/settings", { method: "PUT", body: JSON.stringify(body) });
  try {
    assert.deepEqual((await call("/api/settings")).body, { aiSummary: false, aiModel: false, aiConfigured: true });
    assert.equal((await call("/api/patients/P0001/summary")).status, 409, "off by default");
    await put({ aiSummary: true });
    assert.equal((await call("/api/patients/P0001/summary")).body.kind, "template", "fixed rules until the model is switched on");
    assert.deepEqual(calls, []);
    await put({ aiModel: true });
    assert.deepEqual((await call("/api/patients/P0001/summary")).body, { kind: "ai", lines: ["Tóm tắt từ mô hình"] });
    const fallback = (await call("/api/patients/P0001/summary")).body;
    assert.equal(fallback.kind, "template");
    assert.equal(fallback.notice, "ai-unavailable");
    assert.ok(app.data.audit({ limit: 3 }).some(entry => entry.detail === "Mô hình AI không trả lời, dùng tóm tắt theo mẫu"));
  } finally { await app.close(); }
  const plain = await startApp();
  try {
    const response = await fetch(plain.base + "/api/settings", { method: "PUT", headers: { authorization: `Bearer ${plain.signer.sign()}`, "content-type": "application/json" }, body: JSON.stringify({ aiModel: true }) });
    assert.equal(response.status, 409, "cannot switch on a model nobody configured");
  } finally { await plain.close(); }
});
