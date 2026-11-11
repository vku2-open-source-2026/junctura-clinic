// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { createJuncturaClient } from "@junctura/server-client";
import { createApp } from "./app.mjs";
import { PROVIDED, createCapabilityHandler } from "./capabilities.mjs";
import { loadConfig } from "./config.mjs";
import { loadClinicData } from "./data.mjs";
import { createVerifier } from "./jwt.mjs";

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const data = await loadClinicData({ healthDir: config.healthDir, file: config.dbFile }).catch(error => {
  console.error(`Cannot load the demo data from ${config.healthDir}: ${error.message}\nClone junctura-health next to this repository or set JUNCTURA_HEALTH_DIR.`);
  process.exit(1);
});
const portFlag = process.argv.indexOf("--port");
if (portFlag !== -1) config = Object.freeze({ ...config, port: Number(process.argv[portFlag + 1]) });
const verifier = createVerifier({ issuer: config.issuer, clientId: config.webClientId });

const server = createServer(createApp({ config, data, verifier }));
server.listen(config.port, config.host, () => {
  console.log(`Junctura Clinic (${data.facility}) listening on http://${config.host}:${server.address().port}`);
});

// Provider side: Junctura calls these over HTTPS with a one-use ticket (see capabilities.mjs).
let provider;
if (config.junctura && config.provider) {
  const handler = createCapabilityHandler({ data, junctura: createJuncturaClient(config.junctura) });
  provider = createSecureServer({ cert: readFileSync(config.provider.certFile), key: readFileSync(config.provider.keyFile) }, handler);
  provider.listen(config.provider.port, config.provider.host, () => {
    console.log(`Providing ${PROVIDED.map(item => item.slug).join(", ")} on https://${config.provider.host}:${provider.address().port}`);
  });
} else {
  console.log("Capabilities are not offered: set JUNCTURA_URL, JUNCTURA_APP_CLIENT_ID/SECRET and PROVIDER_TLS_CERT/KEY to let other apps call Clinic.");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { provider?.close(); server.close(() => process.exit(0)); });
