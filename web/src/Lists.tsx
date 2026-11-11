// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, DataTable, IdChip, PageHeader, SegmentedControl } from "@junctura/health-ui";
import { useState } from "react";
import { ApiError, getPatient, getReferrals, getVaccinations } from "./api";
import { VaccinateDialog } from "./Forms";
import { formatDate } from "./format";
import { PatientLink, UrgencyBadge } from "./parts";
import { Link, navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { DueItem, PatientRecord, ReferralRow } from "./types";

export const dueLabel = (item: Pick<DueItem, "state" | "daysLate">) => (item.state === "overdue" ? `Quá hạn ${item.daysLate} ngày` : `Còn ${-item.daysLate} ngày`);

export function Vaccinations() {
  const { settings, can, expire } = useSession();
  const [target, setTarget] = useState<{ record: PatientRecord; code: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const pick = async (row: DueItem) => {
    setFailed(false);
    try { setTarget({ record: await getPatient(settings, row.patientId), code: row.code }); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return expire(); setFailed(true); }
  };
  const [filter, setFilter] = useState<"all" | "overdue" | "soon">("all");
  const { state, reload } = useRemote(signal => getVaccinations(settings, signal), [settings]);
  return (
    <div className="space-y-5">
      <PageHeader title="Tiêm chủng" description="Mũi tiêm quá hạn hoặc sắp đến hạn theo lịch tiêm mẫu của bản demo (không thay hướng dẫn chuyên môn)." />
      <Remote state={state} reload={reload}>
        {({ due }) => {
          const rows = due.filter(item => filter === "all" || item.state === filter);
          return (
            <>
              <SegmentedControl label="Lọc trạng thái" value={filter} onChange={setFilter} options={[
                { value: "all", label: "Tất cả", count: due.length }, { value: "overdue", label: "Quá hạn", count: due.filter(i => i.state === "overdue").length }, { value: "soon", label: "Sắp đến hạn", count: due.filter(i => i.state === "soon").length },
              ]} />
              {failed && <p role="alert" className="text-sm text-danger">Chưa mở được hồ sơ để ghi mũi tiêm. Hãy thử lại.</p>}
              {target && <VaccinateDialog record={target.record} code={target.code} open onClose={() => setTarget(null)} onSaved={() => { setTarget(null); reload(); }} />}
              <DataTable<DueItem> caption="Mũi tiêm cần nhắc" rows={rows} rowKey={row => `${row.patientId}-${row.code}`} onRowClick={row => navigate(`/patients/${encodeURIComponent(row.patientId)}/vaccinations`)} empty="Không có mũi tiêm nào cần nhắc."
                columns={[
                  { key: "name", header: "Người bệnh", sortValue: row => row.patientName, render: row => <PatientLink id={row.patientId} name={row.patientName} /> },
                  { key: "vaccine", header: "Vắc xin", sortValue: row => row.vaccine },
                  { key: "nextDose", header: "Mũi", render: row => `Mũi ${row.nextDose}` },
                  { key: "due", header: "Hạn tiêm", sortValue: row => row.due, render: row => formatDate(row.due) },
                  { key: "state", header: "Trạng thái", sortValue: row => row.daysLate, render: row => <Badge tone={row.state === "overdue" ? "danger" : "warn"}>{dueLabel(row)}</Badge> },
                  ...(can("vaccinate") ? [{ key: "act", header: "Thao tác", render: (row: DueItem) => <Button variant="secondary" onClick={() => void pick(row)}>Ghi mũi tiêm</Button> }] : []),
                ]} />
            </>
          );
        }}
      </Remote>
    </div>
  );
}

export function Referrals() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getReferrals(settings, signal), [settings]);
  return (
    <div className="space-y-5">
      <PageHeader title="Chuyển tuyến" description="Phiếu chuyển tuyến đã lập tại trạm. Bệnh viện nhận qua Junctura khi người bệnh đồng ý." />
      <Remote state={state} reload={reload}>
        {rows => (
          <DataTable<ReferralRow> caption="Phiếu chuyển tuyến" rows={rows} rowKey={row => row.referralId} onRowClick={row => navigate(`/patients/${encodeURIComponent(row.patientId)}/referrals`)} empty="Chưa có phiếu chuyển tuyến."
            columns={[
              { key: "referralId", header: "Mã phiếu", render: row => <IdChip value={row.referralId} label="mã phiếu" /> },
              { key: "name", header: "Người bệnh", sortValue: row => row.patientName, render: row => <PatientLink id={row.patientId} name={row.patientName} /> },
              { key: "toFacility", header: "Chuyển đến", sortValue: row => row.toFacility },
              { key: "urgency", header: "Mức khẩn", render: row => <UrgencyBadge urgency={row.urgency} /> },
              { key: "issuedAt", header: "Ngày lập", sortValue: row => row.issuedAt, render: row => formatDate(row.issuedAt) },
              { key: "reason", header: "Lý do" },
              { key: "slip", header: "Phiếu", render: row => <Link to={`/phieu-chuyen-tuyen/${encodeURIComponent(row.patientId)}/${encodeURIComponent(row.referralId)}`} className="font-medium text-brand underline-offset-2 hover:underline">Xem và in</Link> },
            ]} />
        )}
      </Remote>
    </div>
  );
}
