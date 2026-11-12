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

/** Folds case and diacritics so "nguyen" finds "Nguyễn" (same rule as the server). */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export const ageOf = (birthYear: number, now: Date = new Date()) => Math.max(0, now.getFullYear() - birthYear);

/** "Thứ Tư, 11/11/2026" from "2026-11-11". */
export function formatLongDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const day = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).getUTCDay();
  return `${["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][day]}, ${match[3]}/${match[2]}/${match[1]}`;
}

const ACTIONS: Record<string, string> = {
  "patient.view": "Xem hồ sơ", "patient.create": "Thêm người bệnh", "allergy.update": "Cập nhật dị ứng", "condition.add": "Thêm bệnh mạn tính",
  "medication.add": "Thêm thuốc đang dùng", "medication.stop": "Ngừng thuốc", "encounter.create": "Ghi lượt khám", "vaccination.record": "Ghi mũi tiêm",
  "referral.create": "Lập phiếu chuyển tuyến", "queue.add": "Thêm vào hàng chờ", "queue.call": "Gọi khám", "queue.done": "Khám xong", "queue.cancel": "Hủy lượt chờ",
  "settings.update": "Đổi cài đặt", "summary.view": "Xem tóm tắt tự động",
};
export const actionLabel = (action: string) => ACTIONS[action] ?? action;

const CAPABILITIES: Record<string, string> = {
  "pre-visit-summary": "Tóm tắt trước khám", "allergy-list": "Danh sách dị ứng", "vaccination-history": "Lịch sử tiêm chủng", "referral-summary": "Tóm tắt chuyển tuyến",
};
export const capabilityLabel = (slug: string) => CAPABILITIES[slug] ?? slug;

const PURPOSES: Record<string, string> = { treatment: "Điều trị", dispensing: "Phát thuốc", referral_intake: "Tiếp nhận chuyển tuyến", claim_review: "Xét chi phí" };
export const purposeLabel = (purpose: string) => PURPOSES[purpose] ?? purpose;

const REFUSALS: Record<string, string> = {
  purpose_not_allowed: "Sai mục đích", emergency_not_allowed: "Không cho phép cấp cứu", data_subject_required: "Thiếu người bệnh",
};
/** How a Junctura call ended, as `[label, tone]` for a badge. */
export function outcomeLabel(outcome: string): [string, "neutral" | "brand" | "warn" | "danger"] {
  if (outcome === "answered") return ["Đã trả lời", "brand"];
  if (outcome === "no_record") return ["Không có hồ sơ", "neutral"];
  if (outcome === "data_error") return ["Lỗi dữ liệu", "danger"];
  if (outcome.startsWith("refused:")) return [`Từ chối: ${REFUSALS[outcome.slice(8)] ?? outcome.slice(8)}`, "warn"];
  return [outcome, "neutral"];
}

/** "2026-11-11T08:05:00.000Z" -> "11/11/2026 15:05" (the browser's time zone). */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
