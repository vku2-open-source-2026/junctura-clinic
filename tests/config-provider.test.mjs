// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../server/config.mjs";

const base = { JUNCTURA_ISSUER: "https://id.example.test/identity/realms/junctura", JUNCTURA_WEB_CLIENT_ID: "web", JUNCTURA_HEALTH_DIR: "/nonexistent" };
const junctura = { JUNCTURA_URL: "http://localhost:8080", JUNCTURA_APP_CLIENT_ID: "id", JUNCTURA_APP_CLIENT_SECRET: "secret" };

test("without Junctura credentials and a certificate the app runs but offers no capabilities", () => {
  const config = loadConfig({ env: base, cwd: "/work" });
  assert.equal(config.junctura, null);
  assert.equal(config.provider, null);
  assert.equal(loadConfig({ env: { ...base, ...junctura }, cwd: "/work" }).provider, null);
});

test("the provider listener is configured from the demo credentials plus a certificate and key", () => {
  const config = loadConfig({ env: { ...base, ...junctura, PROVIDER_TLS_CERT: "pki/c.pem", PROVIDER_TLS_KEY: "pki/k.pem" }, cwd: "/work" });
  assert.deepEqual({ ...config.junctura }, { baseUrl: "http://localhost:8080", clientId: "id", clientSecret: "secret" });
  assert.deepEqual({ ...config.provider }, { port: 8443, host: "127.0.0.1", certFile: resolve("/work", "pki/c.pem"), keyFile: resolve("/work", "pki/k.pem") });
  assert.equal(loadConfig({ env: { ...base, ...junctura, PROVIDER_TLS_CERT: "c", PROVIDER_TLS_KEY: "k", PROVIDER_PORT: "9443", PROVIDER_BIND: "0.0.0.0" }, cwd: "/work" }).provider.port, 9443);
});

test("a certificate without its key (or a bad port) is a configuration error", () => {
  assert.throws(() => loadConfig({ env: { ...base, PROVIDER_TLS_CERT: "c" }, cwd: "/work" }), /together/);
  assert.throws(() => loadConfig({ env: { ...base, PROVIDER_PORT: "99999" }, cwd: "/work" }), /PROVIDER_PORT/);
});
