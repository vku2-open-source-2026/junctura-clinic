// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, PageHeader, PermissionState, TextField, useToast } from "@junctura/health-ui";
import { useState } from "react";
import { addStation, ApiError, renameStation } from "./api";
import { useSession } from "./session";

/** A commune can run more than one working point (for example the main station and a branch clinic). Each has its own waiting line and ticket numbers; patient records are shared. */
export function Stations() {
  const { settings, can, stations, setStations, stationId, setStationId, expire } = useSession();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!can("settings.write")) return <PermissionState title="Chỉ quản lý trạm xem được trang này">Quản lý các điểm khám của trạm. Nhờ người quản lý trạm giúp.</PermissionState>;

  const run = async (action: () => Promise<typeof stations>, done: string) => {
    setBusy(true);
    try { setStations(await action()); notify(done, "ok"); setName(""); setEditing(null); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) return expire();
      notify(error instanceof ApiError && error.code === "station-exists" ? "Đã có điểm khám tên này." : error instanceof ApiError && error.status === 422 ? Object.values(error.fields).join(" ") : "Chưa lưu được. Hãy thử lại.", "danger");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Quản lý điểm khám" description="Mỗi điểm khám có hàng chờ và số thứ tự riêng, hồ sơ người bệnh dùng chung. Chọn điểm đang làm việc ở góc trái trên cùng." />
      <Card title="Các điểm khám">
        <ul className="divide-y divide-line">
          {stations.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              {editing?.id === item.id ? (
                <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void run(() => renameStation(settings, item.id, editing.name), "Đã đổi tên điểm khám"); }}>
                  <div className="min-w-64 flex-1"><TextField label="Tên điểm khám" value={editing.name} onChange={event => setEditing({ id: item.id, name: event.target.value })} /></div>
                  <Button type="submit" loading={busy}>Lưu</Button><Button variant="ghost" onClick={() => setEditing(null)}>Hủy</Button>
                </form>
              ) : (
                <>
                  <span className="font-medium text-ink">{item.name}{item.id === stationId && <span className="ml-2 text-sm font-normal text-muted">(đang làm việc ở đây)</span>}</span>
                  <span className="flex gap-2">{item.id !== stationId && <Button variant="secondary" onClick={() => setStationId(item.id)}>Làm việc ở đây</Button>}<Button variant="ghost" onClick={() => setEditing({ id: item.id, name: item.name })}>Đổi tên</Button></span>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Thêm điểm khám">
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void run(() => addStation(settings, name), "Đã thêm điểm khám"); }}>
          <div className="min-w-64 flex-1"><TextField label="Tên điểm khám" hint="Ví dụ: Điểm khám thôn Hòa Phước" value={name} onChange={event => setName(event.target.value)} /></div>
          <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Thêm điểm khám</Button>
        </form>
      </Card>
    </div>
  );
}
