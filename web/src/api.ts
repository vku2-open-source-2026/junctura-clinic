// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { freshAccessToken, type OidcSettings } from "./auth";
import type { AuditEntry, DueItem, JunctureCall, Me, Overview, PatientRecord, PatientSummary, PublicConfig, QueueEntry, ReferralRow, StationSettings } from "./types";

/** `code` is the server's error name (for example "allergy-conflict"); `body` is the whole answer. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body: Record<string, unknown> = {}) {
    super(message);
  }
  get code(): string | undefined { return typeof this.body.error === "string" ? this.body.error : undefined; }
  /** Field messages of a 422 answer, keyed by field name. */
  get fields(): Record<string, string> { return (this.body.fields as Record<string, string> | undefined) ?? {}; }
}

async function request<T>(path: string, settings?: OidcSettings, signal?: AbortSignal, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (settings) {
    const token = await freshAccessToken(settings);
    if (!token) throw new ApiError(401, "unauthenticated");
    headers.authorization = `Bearer ${token}`;
  }
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, { method: init.method, headers, signal, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, `request failed (${response.status})`, body && typeof body === "object" ? body : {});
  }
  return response.json();
}

const send = <T>(settings: OidcSettings, method: "POST" | "PUT", path: string, body?: unknown) => request<T>(path, settings, undefined, { method, body });
const enc = encodeURIComponent;

export const getConfig = () => request<PublicConfig>("/api/config");
export const getMe = (settings: OidcSettings) => request<Me>("/api/me", settings);
export const listPatients = (settings: OidcSettings, query: string, signal?: AbortSignal) =>
  request<{ patients: PatientSummary[] }>(`/api/patients?q=${enc(query)}`, settings, signal).then(body => body.patients);
export const getPatient = (settings: OidcSettings, patientId: string, signal?: AbortSignal) => request<PatientRecord>(`/api/patients/${enc(patientId)}`, settings, signal);
export const getOverview = (settings: OidcSettings, signal?: AbortSignal) => request<Overview>("/api/overview", settings, signal);
export const getVaccinations = (settings: OidcSettings, signal?: AbortSignal) => request<{ today: string; due: DueItem[] }>("/api/vaccinations", settings, signal);
export const getReferrals = (settings: OidcSettings, signal?: AbortSignal) => request<{ referrals: ReferralRow[] }>("/api/referrals", settings, signal).then(body => body.referrals);
export const getQueue = (settings: OidcSettings, signal?: AbortSignal) => request<{ today: string; queue: QueueEntry[] }>("/api/queue", settings, signal).then(body => body.queue);
export const getJunctureCalls = (settings: OidcSettings, signal?: AbortSignal) => request<{ calls: JunctureCall[] }>("/api/junctura-calls?limit=200", settings, signal).then(body => body.calls);
export const getAudit = (settings: OidcSettings, signal?: AbortSignal) => request<{ entries: AuditEntry[] }>("/api/audit?limit=200", settings, signal).then(body => body.entries);
export const getSettings = (settings: OidcSettings) => request<StationSettings>("/api/settings", settings);
export const getSummary = (settings: OidcSettings, patientId: string) => request<{ kind: "template"; lines: string[] }>(`/api/patients/${enc(patientId)}/summary`, settings);

export const createPatient = (settings: OidcSettings, body: unknown) => send<PatientRecord>(settings, "POST", "/api/patients", body);
export const enqueue = (settings: OidcSettings, body: unknown) => send<QueueEntry>(settings, "POST", "/api/queue", body);
export const moveQueue = (settings: OidcSettings, id: number, action: "call" | "done" | "cancel") => send<QueueEntry>(settings, "POST", `/api/queue/${id}/${action}`);
export const saveAllergies = (settings: OidcSettings, patientId: string, body: unknown) => send<PatientRecord>(settings, "PUT", `/api/patients/${enc(patientId)}/allergies`, body);
export const addCondition = (settings: OidcSettings, patientId: string, body: unknown) => send<PatientRecord>(settings, "POST", `/api/patients/${enc(patientId)}/conditions`, body);
export const addMedication = (settings: OidcSettings, patientId: string, body: unknown) => send<PatientRecord>(settings, "POST", `/api/patients/${enc(patientId)}/medications`, body);
export const stopMedication = (settings: OidcSettings, patientId: string, id: number) => send<PatientRecord>(settings, "POST", `/api/patients/${enc(patientId)}/medications/${id}/stop`);
export const addEncounter = (settings: OidcSettings, patientId: string, body: unknown) => send<PatientRecord>(settings, "POST", `/api/patients/${enc(patientId)}/encounters`, body);
export const addVaccination = (settings: OidcSettings, patientId: string, body: unknown) => send<PatientRecord>(settings, "POST", `/api/patients/${enc(patientId)}/vaccinations`, body);
export const addReferral = (settings: OidcSettings, patientId: string, body: unknown) => send<{ referralId: string; record: PatientRecord }>(settings, "POST", `/api/patients/${enc(patientId)}/referrals`, body);
export const saveSettings = (settings: OidcSettings, body: Partial<StationSettings>) => send<StationSettings>(settings, "PUT", "/api/settings", body);
