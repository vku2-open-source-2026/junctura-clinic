// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, DataTable, PageHeader, PermissionState, StatStrip, TextField, useToast } from "@junctura/health-ui";
import { Download } from "lucide-react";
import { useState } from "react";
import { ApiError, downloadReportCsv, getReport } from "./api";
import { formatDate } from "./format";
import { Remote, useRemote, useSession } from "./session";
import type { ReportKind } from "./types";

const dayText = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const daysBack = (n: number) => { const date = new Date(); date.setDate(date.getDate() - n); return dayText(date); };

/** Counts for the station's own reports. Nobody is named here, and each table can be saved as a CSV for Excel. */
export function Reports() {
  const { settings, can, expire } = useSession();
  const { notify } = useToast();
  const [range, setRange] = useState({ from: daysBack(29), to: dayText(new Date()) });
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
  const { state, reload } = useRemote(signal => (can("report") && valid ? getReport(settings, range.from, range.to, signal) : new Promise<never>(() => undefined)), [settings, range.from, range.to, valid]);
  if (!can("report")) return <PermissionState title="Chỉ quản lý trạm xem được báo cáo">Báo cáo tổng hợp số ca của trạm. Nhờ người quản lý trạm xem giúp.</PermissionState>;

  const save = async (kind: ReportKind) => {
    try { await downloadReportCsv(settings, range.from, range.to, kind); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return expire(); notify("Chưa tải được file CSV. Hãy thử lại.", "danger"); }
  };
  const csv = (kind: ReportKind) => <Button variant="ghost" icon={<Download aria-hidden className="size-4" />} onClick={() => void save(kind)}>Tải CSV</Button>;
  const preset = (label: string, from: string) => <Button key={label} variant="secondary" onClick={() => setRange({ from, to: dayText(new Date()) })}>{label}</Button>;

  return (
    <div className="space-y-5">
      <PageHeader title="Báo cáo" description="Số lượt khám, tiêm chủng và chuyển tuyến của trạm trong một khoảng ngày. Báo cáo chỉ có số đếm, không có tên người bệnh." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><TextField label="Từ ngày" type="date" value={range.from} onChange={event => setRange(value => ({ ...value, from: event.target.value }))} /></div>
        <div className="w-40"><TextField label="Đến ngày" type="date" value={range.to} onChange={event => setRange(value => ({ ...value, to: event.target.value }))} /></div>
        {preset("7 ngày", daysBack(6))}{preset("30 ngày", daysBack(29))}{preset("90 ngày", daysBack(89))}
      </div>
      {!valid && <p role="alert" className="text-sm text-danger">Chọn khoảng ngày hợp lệ (từ ngày không sau đến ngày, tối đa một năm).</p>}
      {valid && (
        <Remote state={state} reload={reload}>
          {report => (
            <div className="space-y-6">
              <StatStrip items={[
                { label: "Lượt khám", value: report.totals.encounters, hint: `${report.totals.patients} người bệnh` },
                { label: "Mũi tiêm", value: report.totals.vaccinations },
                { label: "Chuyển tuyến", value: report.totals.referrals },
                { label: "Số đã khám", value: report.totals.queue, hint: "Từ hàng chờ" },
              ]} />
              <Card title="Theo ngày" actions={csv("daily")}>
                <DataTable caption="Số liệu theo ngày" rows={report.daily.filter(row => row.encounters + row.vaccinations + row.referrals + row.queue > 0)} rowKey={row => row.date} empty="Không có hoạt động nào trong khoảng này."
                  columns={[
                    { key: "date", header: "Ngày", sortValue: row => row.date, render: row => formatDate(row.date) },
                    { key: "encounters", header: "Lượt khám", sortValue: row => row.encounters },
                    { key: "vaccinations", header: "Mũi tiêm", sortValue: row => row.vaccinations },
                    { key: "referrals", header: "Chuyển tuyến", sortValue: row => row.referrals },
                    { key: "queue", header: "Số đã khám", sortValue: row => row.queue },
                  ]} />
              </Card>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Chẩn đoán thường gặp" actions={csv("diagnoses")}>
                  <DataTable caption="Chẩn đoán thường gặp" rows={report.diagnoses} rowKey={row => `${row.code}-${row.name}`} empty="Chưa có chẩn đoán trong khoảng này."
                    columns={[{ key: "code", header: "Mã" }, { key: "name", header: "Chẩn đoán", sortValue: row => row.name }, { key: "count", header: "Số lượt", sortValue: row => row.count }]} />
                </Card>
                <Card title="Theo xã/phường" actions={csv("wards")}>
                  <DataTable caption="Theo xã/phường" rows={report.wards} rowKey={row => row.ward} empty="Chưa có lượt khám."
                    columns={[{ key: "ward", header: "Xã/phường", sortValue: row => row.ward }, { key: "encounters", header: "Lượt khám", sortValue: row => row.encounters }, { key: "patients", header: "Người bệnh", sortValue: row => row.patients }]} />
                </Card>
                <Card title="Theo nhóm tuổi" actions={csv("ages")}>
                  <DataTable caption="Theo nhóm tuổi" rows={report.ages} rowKey={row => row.band} empty="Chưa có lượt khám."
                    columns={[{ key: "band", header: "Nhóm tuổi" }, { key: "count", header: "Lượt khám", sortValue: row => row.count }]} />
                </Card>
                <Card title="Tiêm chủng theo vắc xin" actions={csv("vaccines")}>
                  <DataTable caption="Tiêm chủng theo vắc xin" rows={report.vaccines} rowKey={row => row.vaccine} empty="Chưa có mũi tiêm trong khoảng này."
                    columns={[{ key: "vaccine", header: "Vắc xin", sortValue: row => row.vaccine }, { key: "doses", header: "Số mũi", sortValue: row => row.doses }, { key: "patients", header: "Số người", sortValue: row => row.patients }]} />
                </Card>
              </div>
            </div>
          )}
        </Remote>
      )}
    </div>
  );
}
