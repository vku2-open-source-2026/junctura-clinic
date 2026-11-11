// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, DataTable, PageHeader, PermissionState, SelectField, TextField } from "@junctura/health-ui";
import { useMemo, useState } from "react";
import { getAudit } from "./api";
import { actionLabel, fold, formatDateTime } from "./format";
import { PatientLink } from "./parts";
import { Remote, useRemote, useSession } from "./session";
import type { AuditEntry } from "./types";

export function Audit() {
  const { settings, can } = useSession();
  const [text, setText] = useState("");
  const [action, setAction] = useState("");
  const { state, reload } = useRemote(signal => (can("audit.read") ? getAudit(settings, signal) : Promise.resolve([])), [settings, can]);
  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    const needle = fold(text.trim());
    return state.data.filter(entry => (!action || entry.action === action) && (!needle || fold([entry.displayName, entry.patientName, entry.patientId, entry.detail].filter(Boolean).join(" ")).includes(needle)));
  }, [state, text, action]);
  if (!can("audit.read")) return <PermissionState title="Chỉ quản lý trạm xem được nhật ký">Nhật ký ghi ai đã xem hoặc sửa hồ sơ nào. Nhờ người quản lý trạm xem giúp.</PermissionState>;
  return (
    <div className="space-y-5">
      <PageHeader title="Nhật ký thao tác" description="Mọi lần xem hồ sơ và mọi thay đổi đều được ghi lại: ai làm, lúc nào, với hồ sơ nào. Nhật ký không chứa nội dung khám bệnh." />
      <Remote state={state} reload={reload}>
        {all => (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-72"><TextField label="Tìm theo người làm, người bệnh, nội dung" value={text} onChange={event => setText(event.target.value)} /></div>
              <div className="w-full sm:w-64"><SelectField label="Loại thao tác" value={action} onChange={event => setAction(event.target.value)} placeholder="Tất cả"
                options={[...new Set(all.map(entry => entry.action))].sort().map(value => ({ value, label: actionLabel(value) }))} /></div>
            </div>
            <p role="status" className="text-sm text-muted">{rows.length} / {all.length} dòng gần nhất</p>
            <DataTable<AuditEntry> caption="Nhật ký thao tác" rows={rows} rowKey={row => String(row.id)} empty="Chưa có thao tác nào phù hợp."
              columns={[
                { key: "at", header: "Lúc", sortValue: row => row.at, render: row => formatDateTime(row.at) },
                { key: "who", header: "Người làm", sortValue: row => row.displayName, render: row => row.displayName },
                { key: "action", header: "Thao tác", sortValue: row => row.action, render: row => <Badge tone={row.action.endsWith(".view") ? "neutral" : "brand"}>{actionLabel(row.action)}</Badge> },
                { key: "patient", header: "Hồ sơ", sortValue: row => row.patientName ?? "", render: row => (row.patientId ? <PatientLink id={row.patientId} name={row.patientName ?? row.patientId} /> : "—") },
                { key: "detail", header: "Chi tiết", render: row => row.detail ?? "" },
              ]} />
          </>
        )}
      </Remote>
    </div>
  );
}
