// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { ApiError, listPatients } from "./api";
import type { OidcSettings } from "./auth";
import { formatDate, sexLabel } from "./format";
import { Link } from "./router";
import type { PatientSummary } from "./types";
import { Empty, Notice } from "./ui";

export function PatientList({ settings, onExpired }: { settings: OidcSettings; onExpired: () => void }) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listPatients(settings, query, controller.signal)
        .then(setPatients)
        .catch(error => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) onExpired();
          else setFailed(true);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [settings, query, onExpired]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Người bệnh</h1>
          <p className="text-sm text-slate-500">{patients ? `${patients.length} hồ sơ` : "Đang tải…"}</p>
        </div>
        <label className="block w-full sm:w-80">
          <span className="sr-only">Tìm người bệnh</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc mã (P0001)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      {failed && <Notice tone="error">Không tải được danh sách người bệnh. Thử lại sau.</Notice>}

      {patients && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Họ và tên</th>
                <th className="px-4 py-3 font-medium">Năm sinh</th>
                <th className="px-4 py-3 font-medium">Giới</th>
                <th className="px-4 py-3 font-medium">Phường</th>
                <th className="px-4 py-3 font-medium">Dị ứng</th>
                <th className="px-4 py-3 font-medium">Khám gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map(patient => (
                <tr key={patient.patientId} className="hover:bg-brand-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{patient.patientId}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/patients/${patient.patientId}`} className="text-brand-700 hover:underline">{patient.patientName}</Link>
                  </td>
                  <td className="px-4 py-3">{patient.birthYear}</td>
                  <td className="px-4 py-3">{sexLabel(patient.sex)}</td>
                  <td className="px-4 py-3">{patient.ward}</td>
                  <td className="px-4 py-3">
                    {patient.allergyCount === 0 ? (
                      <span className="text-slate-400">Không</span>
                    ) : (
                      <span className={patient.severeAllergy ? "font-medium text-red-700" : "text-amber-700"}>
                        {patient.severeAllergy ? "Dị ứng nặng" : `${patient.allergyCount} dị ứng`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatDate(patient.lastVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {patients.length === 0 && <div className="p-6"><Empty>Không có người bệnh nào khớp.</Empty></div>}
        </div>
      )}
    </div>
  );
}
