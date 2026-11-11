// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// A plain summary of a record built from fixed rules. It uses no AI model: it only restates what the
// record holds, in the same order every time, so staff can check each line against the record.
const SEX = { male: "nam", female: "nữ" };
const dmy = date => date.split("-").reverse().join("/");

export function summarize(record, today) {
  const age = Number(today.slice(0, 4)) - record.birthYear;
  const lines = [`${record.patientName}, ${age} tuổi, ${SEX[record.sex] ?? record.sex}, ${record.ward}.`];
  if (record.allergyState === "recorded") lines.push(`Dị ứng đã ghi nhận: ${record.allergies.map(item => `${item.substance} (${item.severity === "severe" ? "nặng" : item.severity === "moderate" ? "vừa" : "nhẹ"})`).join("; ")}.`);
  else if (record.allergyState === "none-known") lines.push("Dị ứng: nhân viên đã xác nhận chưa biết dị ứng nào.");
  else lines.push("Dị ứng: chưa ghi nhận (chưa được hỏi hoặc chưa nhập), không có nghĩa là không dị ứng.");
  if (record.chronicConditions.length) lines.push(`Bệnh mạn tính: ${record.chronicConditions.map(item => item.name).join("; ")}.`);
  if (record.currentMedications.length) lines.push(`Thuốc đang dùng: ${record.currentMedications.map(item => `${item.name} ${item.dose}`).join("; ")}.`);
  const last = record.encounters.at(-1);
  if (last) lines.push(`Lần khám gần nhất ${dmy(last.date)}: ${last.reason}${last.diagnosis ? ` (${last.diagnosis.name})` : ""}.`);
  if (record.vaccinesDue.length) lines.push(`Mũi tiêm cần làm: ${record.vaccinesDue.map(item => `${item.vaccine} mũi ${item.nextDose} (${item.state === "overdue" ? "quá hạn" : "sắp đến hạn"})`).join("; ")}.`);
  if (record.referrals.length) lines.push(`Chuyển tuyến gần nhất ${dmy(record.referrals.at(-1).issuedAt.slice(0, 10))}: ${record.referrals.at(-1).toFacility}.`);
  return lines;
}
