// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Optional record summary by a language model, off unless a station turns it on AND the operator
 * configured a model endpoint (AI_SUMMARY_URL, an OpenAI-compatible chat-completions API, which includes
 * self-hosted ones). Safety rules, all enforced here and tested:
 *  - nothing that names or locates the person is sent (no name, phone, ward, record number, birth date);
 *  - the model is told to summarise only: no diagnosis, no advice, no invented facts;
 *  - its answer is shown with the "AI-made, check against the source record" label, and a failure falls back to the fixed-rule summary.
 */

const SYSTEM = [
  "Bạn tóm tắt hồ sơ khám bệnh cho nhân viên y tế tuyến xã.",
  "Chỉ dùng đúng thông tin được cung cấp. Không chẩn đoán, không khuyên điều trị, không suy đoán, không thêm thông tin.",
  "Nếu danh sách dị ứng trống và trạng thái là 'chưa ghi nhận', nói rõ là chưa ghi nhận dị ứng, không được nói là không dị ứng.",
  "Trả lời tiếng Việt, tối đa 6 gạch đầu dòng ngắn.",
].join(" ");

const STATE = { recorded: "đã ghi nhận", "none-known": "đã xác nhận chưa biết dị ứng nào", "not-recorded": "chưa ghi nhận" };

/** The only text that ever leaves the station for the model. */
export function deidentify(record, today) {
  const age = Number(today.slice(0, 4)) - record.birthYear;
  const lines = [
    `Tuổi: ${age}. Giới: ${record.sex === "male" ? "nam" : record.sex === "female" ? "nữ" : "khác"}.`,
    `Dị ứng (${STATE[record.allergyState] ?? "chưa ghi nhận"}): ${record.allergies.length ? record.allergies.map(item => `${item.substance} (${item.severity}, ${item.reaction})`).join("; ") : "không có mục nào"}.`,
    `Bệnh mạn tính: ${(record.chronicConditions ?? []).map(item => `${item.name} (từ ${item.since.slice(0, 4)})`).join("; ") || "không có mục nào"}.`,
    `Thuốc đang dùng: ${(record.currentMedications ?? []).map(item => `${item.name} ${item.dose}`).join("; ") || "không có mục nào"}.`,
    ...record.encounters.slice(-3).reverse().map(item => `Khám ${item.date}: ${item.reason}${item.diagnosis ? `; chẩn đoán ${item.diagnosis.name}` : ""}.`),
  ];
  return lines.join("\n");
}

export class SummarizerError extends Error {}

export function aiConfig(env) {
  const url = env.AI_SUMMARY_URL;
  if (!url) return null;
  const parsed = new URL(url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local))) {
    throw new TypeError("AI_SUMMARY_URL must be HTTPS (HTTP only for localhost) and carry no credentials");
  }
  return Object.freeze({ url: parsed.href, key: env.AI_SUMMARY_KEY || undefined, model: env.AI_SUMMARY_MODEL || "default" });
}

export function createSummarizer({ url, key, model, fetcher = fetch, timeoutMs = 20_000 }) {
  return async function summarize(record, today) {
    let response;
    try {
      response = await fetcher(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", ...(key && { authorization: `Bearer ${key}` }) },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 400, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: deidentify(record, today) }] }),
      });
    } catch {
      throw new SummarizerError("unreachable");
    }
    if (!response.ok) { await response.body?.cancel(); throw new SummarizerError(`status-${response.status}`); }
    const text = (await response.json().catch(() => null))?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new SummarizerError("empty-answer");
    const lines = text.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/[*_`#]/g, "").trim()).filter(Boolean).slice(0, 8).map(line => line.slice(0, 300));
    if (!lines.length) throw new SummarizerError("empty-answer");
    return lines;
  };
}
