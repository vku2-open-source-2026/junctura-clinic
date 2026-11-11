// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { CONTRACTS, checkContext, validateValue } from "@junctura/health-contracts";

/**
 * Provider side of the capabilities Clinic offers through Junctura. Junctura POSTs
 * `{ invocationId, capability, input }` with a one-use ticket; Clinic redeems the ticket, checks
 * the purpose, finds the one person the call is about, and answers with exactly `{ output }`.
 * What may be returned is fixed by the shared contract (`@junctura/health-contracts`).
 */

const MAX_BODY = 64 * 1024;
const NO_DIAGNOSIS = Object.freeze({ code: "", name: "Chưa ghi chẩn đoán" });
const SERVICE = Object.freeze({ username: "junctura", displayName: "Junctura" });

const diagnosisOf = value => (value ? { code: value.code ?? "", name: value.name } : { ...NO_DIAGNOSIS });
const pick = (item, keys) => Object.fromEntries(keys.map(key => [key, item[key]]));

/** Projections from a Clinic record to each contract's output. Missing required text becomes an honest placeholder. */
const PROJECTIONS = {
  "allergy-list": (record, { now }) => ({
    allergies: record.allergies.map(item => pick(item, ["substance", "severity", "reaction"])),
    allergyState: record.allergyState,
    updatedAt: record.updatedAt ?? now,
  }),
  "pre-visit-summary": (record, { now }) => ({
    patientName: record.patientName, birthYear: record.birthYear, sex: record.sex,
    allergies: record.allergies.map(item => pick(item, ["substance", "severity", "reaction"])),
    allergyState: record.allergyState,
    chronicConditions: (record.chronicConditions ?? []).map(item => ({ code: item.code ?? "", name: item.name, since: item.since })),
    currentMedications: (record.currentMedications ?? []).map(item => pick(item, ["name", "dose", "since"])),
    recentEncounters: record.encounters.slice(-3).reverse().map(item => ({ date: item.date, reason: item.reason, diagnosis: diagnosisOf(item.diagnosis) })),
    updatedAt: record.updatedAt ?? now,
  }),
  "vaccination-history": (record, { now }) => ({
    vaccinations: record.vaccinations.map(item => pick(item, ["vaccine", "code", "date", "doseNumber"])),
    updatedAt: record.vaccinationsUpdatedAt ?? now,
  }),
  "referral-summary": (record, { input, facility }) => {
    const item = record.referrals.find(referral => referral.referralId === input.referralId);
    return item && {
      referralId: item.referralId, issuedAt: item.issuedAt, fromFacility: facility, toFacility: item.toFacility, urgency: item.urgency, reason: item.reason,
      provisionalDiagnosis: diagnosisOf(item.provisionalDiagnosis), treatmentGiven: item.treatmentGiven ?? "Chưa ghi xử trí",
    };
  },
};

/** The capabilities this app provides: the contracts that name junctura-clinic as provider. */
export const PROVIDED = Object.freeze(CONTRACTS.filter(contract => contract.provider === "junctura-clinic" && PROJECTIONS[contract.slug]));

class Refusal extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function readJson(req) {
  if (!/^application\/json(;|$)/i.test(req.headers["content-type"] ?? "")) throw new Refusal(415, "unsupported_media_type");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Refusal(413, "payload_too_large");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body;
  } catch {
    throw new Refusal(400, "invalid_json");
  }
}

/**
 * Request handler for `POST /capabilities/<slug>`. `junctura` is a Junctura client with
 * `redeemTicket`. Every answered or refused call is written to the station's audit log
 * (who asked, for what purpose; never the medical content).
 */
export function createCapabilityHandler({ data, junctura, now = () => new Date() }) {
  const bySlug = new Map(PROVIDED.map(contract => [contract.slug, contract]));

  const send = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(payload);
  };
  const record = (slug, context, patientId, outcome) =>
    data.log({ ...SERVICE, displayName: `Junctura (${context?.purpose ?? "?"})` }, "capability.call", patientId ?? null,
      `${slug}: ${outcome}${context?.emergency ? " (cấp cứu)" : ""}`);

  async function answer(req) {
    const slug = /^\/capabilities\/([a-z0-9-]+)$/.exec(new URL(req.url, "http://localhost").pathname)?.[1];
    const contract = slug && bySlug.get(slug);
    if (!contract) throw new Refusal(404, "unknown_capability");
    if (req.method !== "POST") throw new Refusal(405, "method_not_allowed");

    const body = await readJson(req);
    if (typeof body.invocationId !== "string" || !body.invocationId) throw new Refusal(400, "invocation_id_required");
    const input = body.input ?? {};
    const inputIssues = validateValue(contract.inputSchema, input);
    if (inputIssues.length) throw new Refusal(400, "invalid_input", inputIssues);

    let ticket;
    try {
      ticket = await junctura.redeemTicket({ authorization: req.headers.authorization, invocationId: body.invocationId, input });
    } catch {
      throw new Refusal(502, "junctura_unavailable");
    }
    if (!ticket?.active) throw new Refusal(403, "ticket_not_active");
    const context = ticket.context;

    const policy = checkContext(contract, context);
    if (!policy.allowed) {
      record(slug, context, null, `từ chối (${policy.reason})`);
      throw new Refusal(403, policy.reason);
    }
    const patientId = data.patientIdBySubject(context.dataSubject);
    const patient = patientId && data.get(patientId);
    const stamp = now();
    const output = patient && PROJECTIONS[slug](patient, { input, facility: data.facility, now: stamp.toISOString() });
    if (!output) {
      record(slug, context, patientId, "không có hồ sơ");
      throw new Refusal(404, "no_record");
    }
    const outputIssues = validateValue(contract.outputSchema, output);
    if (outputIssues.length) {
      record(slug, context, patientId, "lỗi dữ liệu, không trả lời");
      throw new Refusal(500, "output_does_not_fit_contract", outputIssues);
    }
    record(slug, context, patientId, "đã trả lời");
    return { output };
  }

  return async (req, res) => {
    try {
      send(res, 200, await answer(req));
    } catch (error) {
      if (error instanceof Refusal) send(res, error.status, { error: error.code });
      else {
        console.error("capability call failed:", error);
        send(res, 500, { error: "internal_error" });
      }
    }
  };
}
