// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { getContract, validateValue } from "@junctura/health-contracts";
import { PROVIDED, createCapabilityHandler } from "../server/capabilities.mjs";
import { TODAY, fixture, startApp } from "./helpers.mjs";
import { buildClinicData } from "../server/data.mjs";

const TICKET = `Bearer ${"a".repeat(43)}`;
const NOW = new Date("2026-11-01T08:00:00.000Z");

/** Starts the real handler; `context` is what the fake Junctura says the ticket allows. */
async function start({ context = { purpose: "treatment", dataSubject: "s-1" }, redeem } = {}) {
  const data = buildClinicData({ ...fixture, today: TODAY });
  const calls = [];
  const junctura = {
    redeemTicket: redeem ?? (async call => { calls.push(call); return { active: true, context: { tenantId: "t", executionId: "e", ...context } }; }),
  };
  const server = createServer(createCapabilityHandler({ data, junctura, now: () => NOW }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (slug, input = {}, { headers = {}, method = "POST", body } = {}) => {
    const response = await fetch(`${base}/capabilities/${slug}`, {
      method, headers: { "content-type": "application/json", authorization: TICKET, ...headers },
      body: method === "GET" ? undefined : (body ?? JSON.stringify({ invocationId: "inv-1", capability: slug, input })),
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, calls, data, close: () => new Promise(resolve => server.close(resolve).on("close", () => data.close())) };
}

test("Clinic provides exactly the four capabilities whose contract names it", () => {
  assert.deepEqual(PROVIDED.map(item => item.slug).sort(), ["allergy-list", "pre-visit-summary", "referral-summary", "vaccination-history"]);
});

test("an allowed call redeems the ticket and answers exactly { output } that fits the contract", async () => {
  const app = await start();
  try {
    const { status, body } = await app.call("allergy-list");
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body), ["output"]);
    assert.deepEqual(validateValue(getContract("allergy-list").outputSchema, body.output), []);
    assert.equal(body.output.allergyState, "recorded");
    assert.equal(body.output.allergies[0].substance, "Penicillin");
    assert.deepEqual(app.calls, [{ authorization: TICKET, invocationId: "inv-1", input: {} }]);
  } finally { await app.close(); }
});

test("an empty allergy list is never reported as none unless staff confirmed it", async () => {
  const app = await start({ context: { purpose: "dispensing", dataSubject: "s-2" } });
  try {
    assert.equal((await app.call("allergy-list")).body.output.allergyState, "not-recorded");
    app.data.setAllergies("P0002", { items: [], noKnownAllergies: true }, { username: "ysi.tramyte" });
    const confirmed = (await app.call("allergy-list")).body.output;
    assert.deepEqual([confirmed.allergies, confirmed.allergyState], [[], "none-known"]);
  } finally { await app.close(); }
});

test("pre-visit-summary lists the newest encounters first and never leaves a required field out", async () => {
  const app = await start();
  try {
    const { body } = await app.call("pre-visit-summary");
    assert.deepEqual(validateValue(getContract("pre-visit-summary").outputSchema, body.output), []);
    assert.deepEqual(body.output.recentEncounters.map(item => item.date), ["2026-10-28", "2026-03-18"]);
    assert.deepEqual(body.output.recentEncounters[0].diagnosis, { code: "", name: "Chưa ghi chẩn đoán" });
    assert.equal(body.output.patientName, "Nguyễn Văn An");
  } finally { await app.close(); }
});

test("vaccination-history answers for the person named by the ticket only", async () => {
  const app = await start({ context: { purpose: "treatment", dataSubject: "s-2" } });
  try {
    const { status, body } = await app.call("vaccination-history");
    assert.equal(status, 200);
    assert.deepEqual(validateValue(getContract("vaccination-history").outputSchema, body.output), []);
    assert.equal(body.output.vaccinations.length, 3);
  } finally { await app.close(); }
});

test("referral-summary finds the person's own referral and nobody else's", async () => {
  const app = await start({ context: { purpose: "referral_intake", dataSubject: "s-1" } });
  try {
    const own = await app.call("referral-summary", { referralId: "CT-1" });
    assert.equal(own.status, 200);
    assert.deepEqual(validateValue(getContract("referral-summary").outputSchema, own.body.output), []);
    assert.equal(own.body.output.fromFacility, "Trạm Y tế thử nghiệm");
    assert.equal((await app.call("referral-summary", { referralId: "CT-404" })).status, 404);
  } finally { await app.close(); }
  const other = await start({ context: { purpose: "referral_intake", dataSubject: "s-2" } });
  try {
    assert.deepEqual((await other.call("referral-summary", { referralId: "CT-1" })).body, { error: "no_record" });
  } finally { await other.close(); }
});

test("a ticket that is not active gets 403 and no data", async () => {
  const app = await start({ redeem: async () => ({ active: false }) });
  try {
    assert.deepEqual(await app.call("allergy-list"), { status: 403, body: { error: "ticket_not_active" } });
  } finally { await app.close(); }
});

test("the purpose and emergency rules of the contract are enforced", async () => {
  const wrongPurpose = await start({ context: { purpose: "claim_review", dataSubject: "s-1" } });
  const emergency = await start({ context: { purpose: "treatment", dataSubject: "s-1", emergency: true } });
  const noSubject = await start({ context: { purpose: "treatment" } });
  try {
    assert.deepEqual(await wrongPurpose.call("allergy-list"), { status: 403, body: { error: "purpose_not_allowed" } });
    assert.deepEqual(await emergency.call("vaccination-history"), { status: 403, body: { error: "emergency_not_allowed" } });
    assert.equal((await emergency.call("allergy-list")).status, 200, "allergy-list allows emergency access");
    assert.deepEqual(await noSubject.call("allergy-list"), { status: 403, body: { error: "data_subject_required" } });
  } finally { await Promise.all([wrongPurpose.close(), emergency.close(), noSubject.close()]); }
});

test("bad input is refused before the ticket is spent", async () => {
  const app = await start({ context: { purpose: "referral_intake", dataSubject: "s-1" } });
  try {
    assert.equal((await app.call("referral-summary", {})).status, 400);
    assert.equal((await app.call("allergy-list", { extra: 1 })).status, 400);
    assert.equal((await app.call("allergy-list", {}, { body: "{not json" })).body.error, "invalid_json");
    assert.equal((await app.call("allergy-list", {}, { body: JSON.stringify({ input: {} }) })).body.error, "invocation_id_required");
    assert.equal((await app.call("allergy-list", {}, { headers: { "content-type": "text/plain" } })).status, 415);
    assert.deepEqual(app.calls, []);
  } finally { await app.close(); }
});

test("unknown capabilities, other methods and an unreachable Junctura are refused plainly", async () => {
  const down = await start({ redeem: async () => { throw new Error("connect ECONNREFUSED"); } });
  const app = await start();
  try {
    assert.equal((await app.call("prescription-verify")).status, 404);
    assert.equal((await app.call("allergy-list", {}, { method: "GET" })).status, 405);
    assert.deepEqual(await down.call("allergy-list"), { status: 502, body: { error: "junctura_unavailable" } });
  } finally { await Promise.all([app.close(), down.close()]); }
});

test("a person this station never registered with Junctura has no record to share", async () => {
  const app = await start({ context: { purpose: "treatment", dataSubject: "s-unknown" } });
  try {
    assert.deepEqual(await app.call("allergy-list"), { status: 404, body: { error: "no_record" } });
  } finally { await app.close(); }
});

test("every call is audited with its purpose but never with medical content", async () => {
  const app = await start({ context: { purpose: "treatment", dataSubject: "s-1", emergency: true } });
  try {
    await app.call("allergy-list");
    const [entry] = app.data.audit({ limit: 1 });
    assert.equal(entry.action, "capability.call");
    assert.equal(entry.username, "junctura");
    assert.equal(entry.patientId, "P0001");
    assert.deepEqual(JSON.parse(entry.detail), { capability: "allergy-list", purpose: "treatment", emergency: true, outcome: "answered" });
    assert.ok(!JSON.stringify(entry).includes("Penicillin"));
    assert.equal(app.data.audit({ calls: false }).length, 0, "calls stay out of the staff log");
  } finally { await app.close(); }
});

test("station managers see Junctura calls in their own list, separate from staff actions", async () => {
  const app = await startApp();
  try {
    app.data.log({ username: "junctura", displayName: "Junctura" }, "capability.call", "P0001", JSON.stringify({ capability: "allergy-list", purpose: "treatment", emergency: true, outcome: "answered" }));
    app.data.log({ username: "junctura", displayName: "Junctura" }, "capability.call", null, "not json");
    const read = async path => {
      const response = await fetch(app.base + path, { headers: { authorization: `Bearer ${app.signer.sign()}` } });
      return { status: response.status, body: await response.json() };
    };
    const calls = await read("/api/junctura-calls");
    assert.equal(calls.status, 200);
    assert.deepEqual(calls.body.calls.map(({ id, at, ...rest }) => rest), [
      { emergency: false },
      { capability: "allergy-list", purpose: "treatment", emergency: true, outcome: "answered", patientId: "P0001", patientName: "Nguyễn Văn An" },
    ]);
    const staff = await read("/api/audit");
    assert.ok(staff.body.entries.every(entry => entry.action !== "capability.call"));
    const reception = await fetch(app.base + "/api/junctura-calls", { headers: { authorization: `Bearer ${app.signer.sign({ preferred_username: "letan.tram" })}` } });
    assert.equal(reception.status, 403);
  } finally { await app.close(); }
});
