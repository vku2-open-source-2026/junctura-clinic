// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "../server/app.mjs";
import { buildClinicData } from "../server/data.mjs";
import { createVerifier } from "../server/jwt.mjs";

export const ISSUER = "https://id.example.test/identity/realms/junctura";
export const CLIENT = "health-clinic-web";

export function makeSigner(kid = "k1") {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const sign = (claims = {}, { header = {}, key = privateKey } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const body = { iss: ISSUER, azp: CLIENT, exp: now + 300, preferred_username: "ysi.tramyte", ...claims };
    const head = encode({ alg: "RS256", typ: "JWT", kid, ...header });
    const input = `${head}.${encode(body)}`;
    return `${input}.${createSign("RSA-SHA256").update(input).sign(key).toString("base64url")}`;
  };
  return { jwk, sign, privateKey };
}

export const TODAY = "2026-11-01";

export const fixture = {
  clinic: {
    facility: "Trạm Y tế thử nghiệm",
    patients: [
      {
        subject: "s-1", patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1968, sex: "male", ward: "Hòa Khánh Bắc",
        allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Nổi mề đay" }], chronicConditions: [], currentMedications: [],
        encounters: [{ date: "2026-03-18", reason: "Tái khám" }, { date: "2026-10-28", reason: "Đau ngực" }], vaccinations: [],
      },
      {
        subject: "s-2", patientId: "P0002", patientName: "Trần Thị Bình", birthYear: 1975, sex: "female", ward: "Hòa Khánh Bắc",
        allergies: [], chronicConditions: [], currentMedications: [], encounters: [{ date: "2026-10-30", reason: "Ho", diagnosis: { code: "J06.9", name: "Viêm đường hô hấp trên" } }],
        vaccinations: [
          { vaccine: "Vắc xin cúm mùa", code: "141", date: "2025-09-01", doseNumber: 1 },
          { vaccine: "Vắc xin viêm gan B", code: "43", date: "2026-10-10", doseNumber: 1 },
          { vaccine: "Vắc xin COVID-19", code: "213", date: "2026-10-20", doseNumber: 1 },
        ],
      },
    ],
    referrals: [{ referralId: "CT-1", subject: "s-1", issuedAt: "2026-10-28T08:00:00.000Z", toFacility: "Bệnh viện Đà Nẵng", urgency: "urgent", reason: "Đau ngực", fromFacility: "Trạm Y tế thử nghiệm" }],
  },
  accounts: {
    users: [
      { subject: "u-1", username: "ysi.tramyte", displayName: "Y sĩ Lê Thị Hoa", role: "clinic-staff", app: "junctura-clinic" },
      { subject: "u-2", username: "bacsi.benhvien", displayName: "BS. Phạm Minh Quang", role: "physician", app: "junctura-hospital" },
    ],
  },
};

/** Starts the real app on an ephemeral port with a fake identity provider key set. */
export async function startApp({ staticDir = "/nonexistent" } = {}) {
  const signer = makeSigner();
  const config = { issuer: ISSUER, webClientId: CLIENT, staticDir };
  const verifier = createVerifier({ issuer: ISSUER, clientId: CLIENT, getJson: async () => ({ keys: [signer.jwk] }) });
  const server = createServer(createApp({ config, data: buildClinicData({ ...fixture, today: TODAY }), verifier }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { signer, base, close: () => new Promise(resolve => server.close(resolve)) };
}
