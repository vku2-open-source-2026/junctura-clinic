// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createVerifier } from "../server/jwt.mjs";
import { CLIENT, ISSUER, makeSigner } from "./helpers.mjs";

const setup = (signer, extra = {}) => createVerifier({ issuer: ISSUER, clientId: CLIENT, getJson: async () => ({ keys: [signer.jwk] }), ...extra });

test("accepts a valid token and returns its claims", async () => {
  const signer = makeSigner();
  const claims = await setup(signer)(signer.sign({ sub: "abc" }));
  assert.equal(claims.sub, "abc");
  assert.equal(claims.preferred_username, "ysi.tramyte");
});

test("rejects tokens that are forged, expired or meant for someone else", async () => {
  const signer = makeSigner();
  const verify = setup(signer);
  const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    "bad signature": signer.sign({}, { key: stranger }),
    "wrong algorithm": signer.sign({}, { header: { alg: "HS256" } }),
    "no algorithm": signer.sign({}, { header: { alg: "none" } }),
    expired: signer.sign({ exp: now - 600 }),
    "wrong issuer": signer.sign({ iss: "https://evil.example.test" }),
    "other application": signer.sign({ azp: "health-hospital-web" }),
    "not yet valid": signer.sign({ nbf: now + 600 }),
    "unknown key": makeSigner("other").sign(),
    garbage: "not.a.jwt",
    empty: "",
  };
  for (const [name, token] of Object.entries(cases)) {
    await assert.rejects(() => verify(token), { name: "AuthError" }, name);
  }
});

test("accepts the application as audience when azp is absent", async () => {
  const signer = makeSigner();
  const claims = await setup(signer)(signer.sign({ azp: undefined, aud: ["account", CLIENT] }));
  assert.ok(claims.aud.includes(CLIENT));
});

test("refreshes the key set once when a new key id appears", async () => {
  const first = makeSigner("k1");
  const second = makeSigner("k2");
  let calls = 0;
  let clock = 0;
  const verify = createVerifier({
    issuer: ISSUER, clientId: CLIENT, now: () => clock, refreshMs: 1000,
    getJson: async () => ({ keys: ++calls === 1 ? [first.jwk] : [first.jwk, second.jwk] }),
  });
  await verify(first.sign());
  clock = 5000;
  await verify(second.sign());
  assert.equal(calls, 2);
  await verify(first.sign());
  assert.equal(calls, 2, "known keys are served from the cache");
});

test("fetches signing keys from the internal address but still checks the public issuer", async () => {
  const signer = makeSigner();
  const asked = [];
  const verify = createVerifier({ issuer: ISSUER, keysBase: "http://gateway.internal:8080/identity/realms/junctura", clientId: CLIENT, getJson: async url => { asked.push(url); return { keys: [signer.jwk] }; } });
  assert.equal((await verify(signer.sign({ sub: "abc" }))).sub, "abc");
  assert.deepEqual(asked, ["http://gateway.internal:8080/identity/realms/junctura/protocol/openid-connect/certs"]);
  await assert.rejects(verify(signer.sign({ iss: "http://gateway.internal:8080/identity/realms/junctura" })));
});
