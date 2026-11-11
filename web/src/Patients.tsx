// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, DataTable, PageHeader, SegmentedControl, TextField } from "@junctura/health-ui";
import { useMemo, useState } from "react";
import { listPatients } from "./api";
import { filterPatients, type PatientFilter } from "./domain";
import { ageOf, formatDate, sexLabel } from "./format";
import { PatientLink } from "./parts";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { PatientSummary } from "./types";

const FILTERS: PatientFilter[] = ["all", "allergy", "elder", "child"];

export function Patients({ search }: { search: string }) {
  const { settings } = useSession();
  const initial = new URLSearchParams(search).get("f");
  const [filter, setFilter] = useState<PatientFilter>(FILTERS.includes(initial as PatientFilter) ? (initial as PatientFilter) : "all");
  const [text, setText] = useState("");
  const { state, reload } = useRemote(signal => listPatients(settings, "", signal), [settings]);
  const rows = useMemo(() => (state.status === "ready" ? filterPatients(state.data, filter, text) : []), [state, filter, text]);

  return (
    <div className="space-y-5">
      <PageHeader title="Bệnh nhân" description="Tìm và mở hồ sơ. Bấm tên để vào hồ sơ; phím / để tìm nhanh từ bất kỳ màn hình nào." />
      <Remote state={state} reload={reload}>
        {all => (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <SegmentedControl label="Lọc nhóm" value={filter} onChange={setFilter} options={[
                { value: "all", label: "Tất cả", count: all.length },
                { value: "allergy", label: "Có dị ứng", count: filterPatients(all, "allergy", "").length },
                { value: "elder", label: "Cao tuổi" }, { value: "child", label: "Trẻ nhỏ" },
              ]} />
              <div className="w-full sm:w-72"><TextField label="Lọc theo tên, mã hồ sơ, phường" value={text} onChange={event => setText(event.target.value)} /></div>
              {(filter !== "all" || text) && <Button variant="ghost" onClick={() => { setFilter("all"); setText(""); }}>Bỏ lọc</Button>}
            </div>
            <p role="status" className="text-sm text-muted">{rows.length} / {all.length} người bệnh</p>
            <DataTable<PatientSummary> caption="Danh sách bệnh nhân" rows={rows} rowKey={row => row.patientId} onRowClick={row => navigate(`/patients/${encodeURIComponent(row.patientId)}`)}
              empty="Không có người bệnh phù hợp với bộ lọc."
              columns={[
                { key: "name", header: "Họ tên", sortValue: row => row.patientName, render: row => <PatientLink id={row.patientId} name={row.patientName} /> },
                { key: "patientId", header: "Mã hồ sơ", mono: true, sortValue: row => row.patientId },
                { key: "age", header: "Tuổi", sortValue: row => ageOf(row.birthYear), render: row => ageOf(row.birthYear) },
                { key: "sex", header: "Giới", render: row => sexLabel(row.sex) },
                { key: "ward", header: "Phường", sortValue: row => row.ward },
                { key: "allergy", header: "Dị ứng", render: row => row.allergyState === "recorded"
                  ? <Badge tone="danger">{row.severeAllergy ? "Dị ứng nặng" : "Có dị ứng"}</Badge> : <Badge tone="warn">Chưa ghi nhận dị ứng</Badge> },
                { key: "lastVisit", header: "Khám gần nhất", sortValue: row => row.lastVisit ?? "", render: row => formatDate(row.lastVisit) },
              ]} />
          </>
        )}
      </Remote>
    </div>
  );
}
