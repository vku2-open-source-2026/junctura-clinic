// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { DomainError } from "./data.mjs";
import { AuthError } from "./jwt.mjs";
import { can, knownRole } from "./roles.mjs";
import { ValidationError, bool, check, date, decimal, integer, list, object, oneOf, text } from "./validate.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

const securityHeaders = config => ({
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": [
    "default-src 'self'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
    `connect-src 'self' ${new URL(config.issuer).origin}`, "img-src 'self' data:", "style-src 'self' 'unsafe-inline'",
  ].join("; "),
});

const MAX_BODY = 64 * 1024;

/** An audit line written by capabilities.mjs, as the Junctura call it records. */
function callOf({ id, at, patientId, patientName, detail }) {
  let call = {};
  try { call = JSON.parse(detail ?? "{}"); } catch { /* an unreadable line is still listed, without details */ }
  return Object.fromEntries(Object.entries({ id, at, capability: call.capability, purpose: call.purpose, emergency: call.emergency === true, outcome: call.outcome, patientId, patientName }).filter(([, v]) => v !== undefined && v !== null));
}
const SEVERITY = ["mild", "moderate", "severe"];
const URGENCY = ["routine", "urgent", "emergency"];

const diagnosis = label => object({ code: text("Mã bệnh", { max: 12, required: false }), name: text(label, { min: 2, max: 120 }) });
const override = { overrideAllergy: bool, overrideReason: text("Lý do kê thuốc dù có cảnh báo dị ứng", { min: 5, max: 200, required: false }) };
const needReason = input => {
  if (input.overrideAllergy && !input.overrideReason) throw new ValidationError({ overrideReason: "Nhập lý do kê thuốc dù có cảnh báo dị ứng." });
  return input;
};

/**
 * Request handler of the Clinic server: a small JSON API behind Junctura sign-in plus the
 * built web UI. Staff are the accounts of this application; every other signed-in person is
 * refused. What each role may do is in roles.mjs, and every write is recorded in the audit log.
 */
export function createApp({ config, data, verifier }) {
  const base = securityHeaders(config);

  const send = (res, status, body, headers = {}) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { ...base, "cache-control": "no-store", ...(payload && { "content-type": "application/json; charset=utf-8" }), ...headers });
    res.end(payload);
  };

  async function authenticate(req) {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");
    if (!match) throw new AuthError("sign in required");
    const claims = await verifier(match[1]);
    const user = data.staff.get(claims.preferred_username);
    return user && knownRole(user.role) ? { username: user.username, displayName: user.displayName, role: user.role } : null;
  }

  /** JSON body of a write; empty when the request has none (queue and stop actions send nothing). */
  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new DomainError("payload-too-large", 413);
      chunks.push(chunk);
    }
    if (size === 0) return null;
    if (!/^application\/json(;|$)/i.test(req.headers["content-type"] ?? "")) throw new DomainError("unsupported-media-type", 415);
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ValidationError({ _: "Dữ liệu gửi lên không đọc được." });
    }
  }

  const today = () => data.today;
  const future = (label, required = false) => date(label, { max: today(), required });

  const patientRules = {
    patientName: text("Họ tên", { min: 2, max: 80 }),
    birthYear: v => integer("Năm sinh", 1900, Number(today().slice(0, 4)))(v),
    sex: oneOf("giới tính", ["male", "female"]),
    ward: text("Xã/phường", { min: 1, max: 60 }),
    phone: v => text("Số điện thoại", { min: 8, max: 15, required: false })(typeof v === "string" ? v.replace(/[\s.-]/g, "") : v),
    confirmDuplicate: bool,
  };
  const encounterRules = () => ({
    date: future("Ngày khám"),
    reason: text("Lý do khám", { min: 2, max: 200 }),
    vitals: object({
      temperatureC: decimal("Nhiệt độ", 30, 45), pulse: integer("Mạch", 20, 250, { required: false }), systolic: integer("Huyết áp tâm thu", 50, 260, { required: false }),
      diastolic: integer("Huyết áp tâm trương", 30, 160, { required: false }), spo2: integer("SpO2", 50, 100, { required: false }), weightKg: decimal("Cân nặng", 0.5, 300),
    }),
    diagnosis: diagnosis("Chẩn đoán"),
    notes: text("Ghi chú khám", { max: 2000, required: false }),
    advice: text("Dặn dò", { max: 1000, required: false }),
    prescriptions: list("Thuốc kê", { name: text("Tên thuốc", { min: 2, max: 80 }), dose: text("Liều dùng", { max: 80 }), ongoing: bool }, { max: 10 }),
    queueId: v => integer("Số thứ tự", 1, 1e9, { required: false })(v),
    ...override,
  });

  const need = (user, permission) => {
    if (!can(user.role, permission)) throw new DomainError("forbidden", 403, { need: permission });
  };

  /** Routes behind sign-in. Returns [status, body] or undefined when nothing matches. */
  async function route(req, url, user) {
    const { method } = req;
    const path = url.pathname;
    const reading = method === "GET" || method === "HEAD";
    let match;

    if (reading) {
      if (path === "/api/me") return [200, { ...user, permissions: ["read", "register", "queue", "exam", "vaccinate", "refer", "audit.read", "settings.write"].filter(item => can(user.role, item)) }];
      need(user, "read");
      if (path === "/api/patients") return [200, { patients: data.list(url.searchParams.get("q") ?? "") }];
      if (path === "/api/overview") return [200, data.overview()];
      if (path === "/api/vaccinations") return [200, { today: data.today, due: data.vaccinesDue() }];
      if (path === "/api/referrals") return [200, { referrals: data.referrals() }];
      if (path === "/api/queue") return [200, { today: data.today, queue: data.queueToday() }];
      if (path === "/api/settings") return [200, data.settings()];
      if (path === "/api/audit") {
        need(user, "audit.read");
        return [200, { entries: data.audit({ limit: url.searchParams.get("limit") ?? 100, patientId: url.searchParams.get("patient") || undefined, calls: false }) }];
      }
      if (path === "/api/junctura-calls") {
        need(user, "audit.read");
        return [200, { calls: data.audit({ limit: url.searchParams.get("limit") ?? 100, calls: true }).map(callOf) }];
      }
      if ((match = /^\/api\/patients\/([A-Za-z0-9-]{1,32})\/summary$/.exec(path))) {
        if (!data.settings().aiSummary) throw new DomainError("summary-disabled", 409);
        const lines = data.summaryOf(match[1]);
        if (!lines) throw new DomainError("patient-not-found", 404);
        data.log(user, "summary.view", match[1], "Tóm tắt tự động");
        return [200, { kind: "template", lines }];
      }
      if ((match = /^\/api\/patients\/([A-Za-z0-9-]{1,32})$/.exec(path))) {
        const patient = data.get(match[1]);
        if (!patient) throw new DomainError("patient-not-found", 404);
        data.log(user, "patient.view", match[1]);
        return [200, patient];
      }
      return undefined;
    }

    if (method !== "POST" && method !== "PUT") return [405, { error: "method-not-allowed" }];
    const body = await readBody(req);

    if (path === "/api/patients") {
      need(user, "register");
      const input = check(body, patientRules);
      return [201, data.createPatient(input, user)];
    }
    if (path === "/api/queue") {
      need(user, "queue");
      const input = check(body, { patientId: text("Người bệnh", { max: 32 }), reason: text("Lý do đến khám", { min: 2, max: 200 }), priority: oneOf("mức ưu tiên", ["normal", "urgent"], { required: false }) });
      return [201, data.enqueue(input, user)];
    }
    if ((match = /^\/api\/queue\/(\d+)\/(call|done|cancel)$/.exec(path))) {
      need(user, match[2] === "done" ? "exam" : "queue");
      const id = Number(match[1]);
      return [200, match[2] === "call" ? data.callQueue(id, user) : match[2] === "done" ? data.finishQueue(id, user) : data.cancelQueue(id, user)];
    }
    if (path === "/api/settings") {
      need(user, "settings.write");
      return [200, data.updateSettings(check(body, { aiSummary: v => (v === undefined ? undefined : bool(v)) }), user)];
    }

    if ((match = /^\/api\/patients\/([A-Za-z0-9-]{1,32})\/(allergies|conditions|medications|encounters|vaccinations|referrals)$/.exec(path))) {
      const [, id, part] = match;
      if (part === "allergies") {
        if (method !== "PUT") return [405, { error: "method-not-allowed" }];
        need(user, "exam");
        const input = check(body, {
          noKnownAllergies: bool,
          items: list("Dị ứng", { substance: text("Chất gây dị ứng", { min: 2, max: 80 }), severity: oneOf("mức độ", SEVERITY), reaction: text("Phản ứng", { min: 2, max: 160 }) }, { max: 20 }),
        });
        return [200, data.setAllergies(id, input, user)];
      }
      if (method !== "POST") return [405, { error: "method-not-allowed" }];
      if (part === "conditions") {
        need(user, "exam");
        return [201, data.addCondition(id, check(body, { code: text("Mã bệnh", { max: 12, required: false }), name: text("Tên bệnh", { min: 2, max: 120 }), since: future("Ngày bắt đầu", true) }), user)];
      }
      if (part === "medications") {
        need(user, "exam");
        const input = needReason(check(body, { name: text("Tên thuốc", { min: 2, max: 80 }), dose: text("Liều dùng", { max: 80 }), since: future("Ngày bắt đầu"), ...override }));
        return [201, data.addMedication(id, input, user)];
      }
      if (part === "encounters") {
        need(user, "exam");
        return [201, data.addEncounter(id, needReason(check(body, encounterRules())), user)];
      }
      if (part === "vaccinations") {
        need(user, "vaccinate");
        return [201, data.addVaccination(id, check(body, { code: text("Vắc xin", { max: 12 }), date: future("Ngày tiêm"), lot: text("Số lô", { max: 40, required: false }) }), user)];
      }
      need(user, "refer");
      const input = check(body, {
        toFacility: text("Nơi nhận", { min: 2, max: 100 }), urgency: oneOf("mức độ", URGENCY), reason: text("Lý do chuyển tuyến", { min: 5, max: 500 }),
        provisionalDiagnosis: diagnosis("Chẩn đoán sơ bộ"), treatmentGiven: text("Xử trí đã làm", { max: 500, required: false }),
      });
      return [201, data.addReferral(id, input, user)];
    }
    if ((match = /^\/api\/patients\/([A-Za-z0-9-]{1,32})\/medications\/(\d+)\/stop$/.exec(path)) && method === "POST") {
      need(user, "exam");
      return [200, data.stopMedication(match[1], Number(match[2]), user)];
    }
    return undefined;
  }

  async function api(req, res, url) {
    if (url.pathname === "/api/config") {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method-not-allowed" }, { allow: "GET, HEAD" });
      return send(res, 200, { issuer: config.issuer, clientId: config.webClientId, facility: data.facility });
    }
    let user;
    try {
      user = await authenticate(req);
    } catch (error) {
      if (!(error instanceof AuthError)) console.error(`token check failed: ${error.message}`);
      return send(res, 401, { error: "unauthenticated" }, { "www-authenticate": "Bearer" });
    }
    if (!user) return send(res, 403, { error: "not-clinic-staff" });
    try {
      const result = await route(req, url, user);
      return result ? send(res, result[0], result[1]) : send(res, 404, { error: "not-found" });
    } catch (error) {
      if (error instanceof ValidationError) return send(res, 422, { error: "invalid", fields: error.fields });
      if (error instanceof DomainError) {
        const { fields, ...extra } = error.extra;
        return send(res, error.status, { error: error.code, ...(fields && { fields }), ...extra });
      }
      throw error;
    }
  }

  function serveStatic(res, pathname) {
    const target = normalize(join(config.staticDir, pathname === "/" ? "index.html" : pathname));
    const root = config.staticDir + sep;
    let file = target.startsWith(root) && existsSync(target) && statSync(target).isFile() ? target : null;
    // Unknown paths without an extension belong to the single-page app.
    if (!file && !extname(pathname)) file = join(config.staticDir, "index.html");
    if (!file || !existsSync(file)) return send(res, 404, { error: "not-found" });
    const immutable = pathname.startsWith("/assets/");
    res.writeHead(200, { ...base, "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    createReadStream(file).pipe(res);
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz") return send(res, 200, { status: "ok" });
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method-not-allowed" }, { allow: "GET, HEAD" });
      return serveStatic(res, decodeURIComponent(url.pathname));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: "internal-error" });
      else res.end();
    }
  };
}
