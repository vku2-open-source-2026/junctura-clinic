// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import type { Severity } from "./types";

/** "2026-10-28" or an ISO timestamp -> "28/10/2026". */
export function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

export const sexLabel = (sex: string) => (sex === "male" ? "Nam" : sex === "female" ? "Nữ" : "—");

export const severityLabel = (severity: Severity) => ({ mild: "Nhẹ", moderate: "Vừa", severe: "Nặng" })[severity] ?? severity;

export const urgencyLabel = (urgency: string) => ({ routine: "Thường", urgent: "Khẩn", emergency: "Cấp cứu" })[urgency] ?? urgency;
