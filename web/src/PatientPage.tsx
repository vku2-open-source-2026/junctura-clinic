// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { ApiError, getPatient } from "./api";
import type { OidcSettings } from "./auth";
import { formatDate, sexLabel, urgencyLabel } from "./format";
import { Link } from "./router";
import type { PatientRecord } from "./types";
import { Card, Empty, Notice, SeverityBadge } from "./ui";

export function PatientPage({ settings, patientId, onExpired }: { settings: OidcSettings; patientId: string; onExpired: () => void }) {
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [error, setError] = useState<"missing" | "failed" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPatient(null);
    setError(null);
    getPatient(settings, patientId, controller.signal)
      .then(setPatient)
      .catch(failure => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(failure instanceof ApiError && failure.status === 404 ? "missing" : "failed");
      });
    return () => controller.abort();
  }, [settings, patientId, onExpired]);

  const back = <Link to="/" className="text-sm text-brand-700 hover:underline">← Danh sách người bệnh</Link>;
  if (error) return <div className="space-y-4">{back}<Notice tone="error">{error === "missing" ? "Không tìm thấy hồ sơ này." : "Không tải được hồ sơ. Thử lại sau."}</Notice></div>;
  if (!patient) return <div className="space-y-4">{back}<Notice tone="info">Đang tải…</Notice></div>;

  const severe = patient.allergies.filter(item => item.severity === "severe");
  return (
    <div className="space-y-4">
      {back}
      <div>
        <h1 className="text-2xl font-semibold">{patient.patientName}</h1>
        <p className="text-sm text-slate-500">
          <span className="font-mono">{patient.patientId}</span> · Sinh {patient.birthYear} · {sexLabel(patient.sex)} · {patient.ward}
        </p>
      </div>

      {severe.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Dị ứng nặng:</strong> {severe.map(item => `${item.substance} (${item.reaction})`).join("; ")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dị ứng" count={patient.allergies.length}>
          {patient.allergies.length === 0 ? <Empty>Chưa ghi nhận dị ứng.</Empty> : (
            <ul className="space-y-3">
              {patient.allergies.map(item => (
                <li key={item.substance} className="flex items-start justify-between gap-3">
                  <div><p className="font-medium">{item.substance}</p><p className="text-sm text-slate-500">{item.reaction}</p></div>
                  <SeverityBadge severity={item.severity} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Bệnh mạn tính" count={patient.chronicConditions.length}>
          {patient.chronicConditions.length === 0 ? <Empty>Không có.</Empty> : (
            <ul className="space-y-3">
              {patient.chronicConditions.map(item => (
                <li key={item.code}><p className="font-medium">{item.name} <span className="font-mono text-xs text-slate-400">{item.code}</span></p><p className="text-sm text-slate-500">Từ {formatDate(item.since)}</p></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Thuốc đang dùng" count={patient.currentMedications.length}>
          {patient.currentMedications.length === 0 ? <Empty>Không có.</Empty> : (
            <ul className="space-y-3">
              {patient.currentMedications.map(item => (
                <li key={item.name}><p className="font-medium">{item.name}</p><p className="text-sm text-slate-500">{item.dose} · từ {formatDate(item.since)}</p></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tiêm chủng" count={patient.vaccinations.length}>
          {patient.vaccinations.length === 0 ? <Empty>Chưa có mũi tiêm nào.</Empty> : (
            <ul className="space-y-3">
              {patient.vaccinations.map(item => (
                <li key={`${item.code}-${item.date}`}><p className="font-medium">{item.vaccine}</p><p className="text-sm text-slate-500">Mũi {item.doseNumber} · {formatDate(item.date)}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Lượt khám" count={patient.encounters.length}>
        {patient.encounters.length === 0 ? <Empty>Chưa có lượt khám.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {[...patient.encounters].reverse().map(item => (
              <li key={item.date + item.reason} className="flex flex-wrap justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div><p className="font-medium">{item.reason}</p>{item.diagnosis && <p className="text-sm text-slate-500">{item.diagnosis.name} <span className="font-mono text-xs text-slate-400">{item.diagnosis.code}</span></p>}</div>
                <span className="text-sm text-slate-500">{formatDate(item.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Chuyển tuyến" count={patient.referrals.length}>
        {patient.referrals.length === 0 ? <Empty>Chưa có phiếu chuyển tuyến.</Empty> : (
          <ul className="space-y-4">
            {patient.referrals.map(item => (
              <li key={item.referralId}>
                <p className="font-medium">{item.toFacility} <span className="font-mono text-xs text-slate-400">{item.referralId}</span></p>
                <p className="text-sm text-slate-500">{formatDate(item.issuedAt)} · {urgencyLabel(item.urgency)}</p>
                <p className="mt-1 text-sm">{item.reason}</p>
                {item.provisionalDiagnosis && <p className="text-sm text-slate-500">Chẩn đoán sơ bộ: {item.provisionalDiagnosis.name}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
