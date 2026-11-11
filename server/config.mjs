// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "./env.mjs";

const DEFAULT_PORT = 5181;
const DEFAULT_PROVIDER_PORT = 8443;

/**
 * Configuration comes from the environment. For the local demo, the credentials file
 * that `npm run demo:setup` (junctura-health) wrote for this app is read too; real
 * environment variables win over the file. Nothing here is ever sent to a browser
 * except the public issuer and the public web client id.
 */
export function loadConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const healthDir = resolve(cwd, env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
  const envFile = resolve(cwd, env.JUNCTURA_CLINIC_ENV ?? `${healthDir}/.junctura/demo/junctura-clinic.env`);
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const get = key => env[key] ?? fromFile[key];

  const issuer = get("JUNCTURA_ISSUER");
  const webClientId = get("JUNCTURA_WEB_CLIENT_ID");
  if (!issuer || !webClientId) {
    throw new Error("JUNCTURA_ISSUER and JUNCTURA_WEB_CLIENT_ID are required. Run `npm run demo:setup` in junctura-health, or set them in the environment.");
  }
  const port = Number(get("PORT") ?? get("WEB_PORT") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("PORT must be a valid port number");
  const baseUrl = get("JUNCTURA_URL");
  const clientId = get("JUNCTURA_APP_CLIENT_ID");
  const clientSecret = get("JUNCTURA_APP_CLIENT_SECRET");
  const certFile = get("PROVIDER_TLS_CERT");
  const keyFile = get("PROVIDER_TLS_KEY");
  const providerPort = Number(get("PROVIDER_PORT") ?? DEFAULT_PROVIDER_PORT);
  if (!Number.isInteger(providerPort) || providerPort < 0 || providerPort > 65535) throw new RangeError("PROVIDER_PORT must be a valid port number");
  if (Boolean(certFile) !== Boolean(keyFile)) throw new Error("PROVIDER_TLS_CERT and PROVIDER_TLS_KEY must be set together.");
  return Object.freeze({
    /** What Clinic needs to answer Junctura's capability calls; null when any part is missing (the app still runs without it). */
    junctura: baseUrl && clientId && clientSecret ? Object.freeze({ baseUrl, clientId, clientSecret }) : null,
    provider: certFile ? Object.freeze({ port: providerPort, host: get("PROVIDER_BIND") ?? "127.0.0.1", certFile: resolve(cwd, certFile), keyFile: resolve(cwd, keyFile) }) : null,
    issuer: issuer.replace(/\/+$/, ""),
    webClientId,
    port,
    host: get("HOST") ?? "127.0.0.1",
    healthDir,
    dbFile: resolve(cwd, get("CLINIC_DB") ?? "data/clinic.db"),
    staticDir: resolve(cwd, get("CLINIC_STATIC_DIR") ?? "web/dist"),
  });
}
