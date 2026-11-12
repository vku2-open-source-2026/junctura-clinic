// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, DataTable, PageHeader, PermissionState, SelectField } from "@junctura/health-ui";
import { useMemo, useState } from "react";
import { getJunctureCalls } from "./api";
import { capabilityLabel, formatDateTime, outcomeLabel, purposeLabel } from "./format";
import { PatientLink } from "./parts";
import { Remote, useRemote, useSession } from "./session";
import type { JunctureCall } from "./types";

/** Who asked this station for patient data through Junctura, for what, and what the station answered. */
export function JunctureCalls() {
  const { settings, can } = useSession();
  const [purpose, setPurpose] = useState("");
  const { state, reload } = useRemote(signal => (can("audit.read") ? getJunctureCalls(settings, signal) : Promise.resolve([])), [settings, can]);
  const rows = useMemo(() => (state.status === "ready" ? state.data.filter(call => !purpose || call.purpose === purpose) : []), [state, purpose]);
  if (!can("audit.read")) return <PermissionState title="Chỉ quản lý trạm xem được nhật ký Junctura">Nhật ký này ghi những lần ứng dụng khác xin dữ liệu của trạm. Nhờ người quản lý trạm xem giúp.</PermissionState>;
  return (
    <div className="space-y-5">
      <PageHeader title="Nhật ký Junctura" description="Những lần bệnh viện hoặc nhà thuốc xin dữ liệu của trạm qua Junctura: dùng cho mục đích gì, về hồ sơ nào, trạm đã trả lời hay từ chối. Nhật ký không chứa nội dung hồ sơ." />
      <Remote state={state} reload={reload}>
        {all => (
          <>
            <div className="w-full sm:w-64"><SelectField label="Mục đích" value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="Tất cả"
              options={[...new Set(all.map(call => call.purpose).filter((value): value is string => Boolean(value)))].sort().map(value => ({ value, label: purposeLabel(value) }))} /></div>
            <p role="status" className="text-sm text-muted">{rows.length} / {all.length} lượt gần nhất</p>
            <DataTable<JunctureCall> caption="Nhật ký Junctura" rows={rows} rowKey={row => String(row.id)} empty="Chưa có ứng dụng nào xin dữ liệu của trạm."
              columns={[
                { key: "at", header: "Lúc", sortValue: row => row.at, render: row => formatDateTime(row.at) },
                { key: "capability", header: "Dữ liệu được xin", sortValue: row => row.capability ?? "", render: row => (row.capability ? capabilityLabel(row.capability) : "—") },
                { key: "purpose", header: "Mục đích", sortValue: row => row.purpose ?? "", render: row => (
                  <span className="inline-flex items-center gap-2">{row.purpose ? purposeLabel(row.purpose) : "—"}{row.emergency && <Badge tone="danger">Cấp cứu</Badge>}</span>) },
                { key: "patient", header: "Hồ sơ", sortValue: row => row.patientName ?? "", render: row => (row.patientId ? <PatientLink id={row.patientId} name={row.patientName ?? row.patientId} /> : "—") },
                { key: "outcome", header: "Kết quả", sortValue: row => row.outcome ?? "", render: row => {
                  if (!row.outcome) return "—";
                  const [label, tone] = outcomeLabel(row.outcome);
                  return <Badge tone={tone}>{label}</Badge>;
                } },
              ]} />
          </>
        )}
      </Remote>
    </div>
  );
}
