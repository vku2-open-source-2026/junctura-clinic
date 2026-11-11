// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, EmptyState, PageHeader, QueueList, Section, StatStrip, TextAreaField, TextField, WorkspaceLayout, useToast } from "@junctura/health-ui";
import { Clock, DoorOpen, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, enqueue, getQueue, listPatients, moveQueue } from "./api";
import { NewPatientDialog } from "./Forms";
import { ageOf, sexLabel } from "./format";
import { toQueueItem } from "./parts";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { PatientSummary, QueueEntry } from "./types";

/** Find a person and put them in today's line. */
function AddToQueue({ picked, onPicked, onAdded }: { picked: PatientSummary | null; onPicked: (patient: PatientSummary | null) => void; onAdded: () => void }) {
  const { settings, can, expire } = useSession();
  const { notify } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [reason, setReason] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (picked || query.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      listPatients(settings, query).then(rows => { if (!cancelled) setResults(rows.slice(0, 5)); }, () => { if (!cancelled) setResults([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, picked, settings]);

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const entry = await enqueue(settings, { patientId: picked.patientId, reason, priority: urgent ? "urgent" : "normal" });
      notify(`Đã thêm ${picked.patientName}, số ${entry.ticket}`, "ok");
      onPicked(null); setQuery(""); setReason(""); setUrgent(false);
      onAdded();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) return expire();
      if (failure instanceof ApiError && failure.code === "already-in-queue") setError("Người này đang trong hàng chờ hôm nay.");
      else if (failure instanceof ApiError && failure.status === 422) setError(Object.values(failure.fields).join(" "));
      else setError("Chưa thêm được vào hàng chờ. Hãy thử lại.");
    } finally {
      setSaving(false);
    }
  };

  if (!can("queue")) return <p className="text-sm text-muted">Vai trò của bạn không được sắp hàng chờ.</p>;
  return (
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {picked ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <p className="text-sm"><span className="font-medium text-ink">{picked.patientName}</span><br /><span className="text-muted">{picked.patientId} · {ageOf(picked.birthYear)} tuổi · {sexLabel(picked.sex)}</span></p>
          <Button variant="ghost" onClick={() => onPicked(null)}>Đổi người</Button>
        </div>
      ) : (
        <>
          <TextField label="Tìm người bệnh" hint="Gõ ít nhất 2 chữ của họ tên hoặc mã hồ sơ" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
          {query.trim().length >= 2 && (
            <ul aria-label="Kết quả tìm" className="divide-y divide-line rounded-lg border border-line bg-surface">
              {results.map(row => (
                <li key={row.patientId}>
                  <button type="button" className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2" onClick={() => onPicked(row)}>
                    <span className="font-medium text-ink">{row.patientName}</span>
                    <span className="text-sm text-muted">{row.patientId} · {ageOf(row.birthYear)} tuổi · {row.ward}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Không thấy ai. Bấm "Người bệnh mới" nếu đây là lần đầu họ đến trạm.</li>}
            </ul>
          )}
        </>
      )}
      <TextAreaField label="Lý do đến khám" rows={2} required value={reason} onChange={event => setReason(event.target.value)} />
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="size-4" checked={urgent} onChange={event => setUrgent(event.target.checked)} />Ưu tiên khẩn</label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={saving} disabled={!picked || reason.trim().length < 2}>Thêm vào hàng chờ</Button>
    </form>
  );
}

export function Reception() {
  const { settings, can, expire } = useSession();
  const { notify } = useToast();
  const { state, reload } = useRemote(signal => getQueue(settings, signal), [settings]);
  const [picked, setPicked] = useState<PatientSummary | null>(null);
  const [creating, setCreating] = useState(false);

  // The line is shared by everyone at the station, so it refreshes on its own.
  useEffect(() => {
    const timer = setInterval(reload, 30_000);
    return () => clearInterval(timer);
  }, [reload]);

  const act = async (entry: QueueEntry, action: "call" | "cancel") => {
    try {
      await moveQueue(settings, entry.id, action);
      if (action === "call") navigate(`/patients/${encodeURIComponent(entry.patientId)}?queue=${entry.id}`);
      else { notify(`Đã hủy số ${entry.ticket}`, "ok"); reload(); }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) return expire();
      notify(failure instanceof ApiError && failure.status === 409 ? "Số này đã được xử lý ở máy khác. Đã tải lại hàng chờ." : "Chưa thực hiện được. Hãy thử lại.", "danger");
      reload();
    }
  };
  const open = (entry: QueueEntry) => navigate(`/patients/${encodeURIComponent(entry.patientId)}?queue=${entry.id}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Hàng chờ khám" description="Tiếp đón người đến trạm, xếp số thứ tự và gọi khám. Gọi khám sẽ mở hồ sơ; lưu lượt khám là xong số."
        actions={can("register") ? <Button icon={<UserPlus aria-hidden className="size-4" />} onClick={() => setCreating(true)}>Người mới đến, lấy số</Button> : undefined} />
      <Remote state={state} reload={reload}>
        {queue => {
          const waiting = queue.filter(entry => entry.state === "waiting");
          const called = queue.filter(entry => entry.state === "called");
          const done = queue.filter(entry => entry.state === "done");
          return (
            <div className="space-y-6">
              <StatStrip items={[
                { label: "Đang chờ", value: waiting.length, icon: <Clock aria-hidden className="size-4" />, hint: "Chưa được gọi", tone: waiting.length > 5 ? "warn" : "neutral" },
                { label: "Đang khám", value: called.length, icon: <DoorOpen aria-hidden className="size-4" />, hint: "Đã gọi vào" },
                { label: "Đã khám hôm nay", value: done.length, hint: "Đã lưu lượt khám", tone: "ok" },
              ]} />
              <WorkspaceLayout asideLabel="Thêm vào hàng chờ"
                aside={<Section title="Thêm vào hàng chờ" description="Tìm người đã có hồ sơ, hoặc tạo hồ sơ mới."><AddToQueue picked={picked} onPicked={setPicked} onAdded={reload} /></Section>}>
                <Section title="Đang khám" count={called.length}>
                  <QueueList label="Đang khám" items={called.map(entry => toQueueItem(entry))} onOpen={item => open(called.find(entry => String(entry.id) === item.id)!)} openLabel="Mở hồ sơ" empty={<p className="text-sm text-muted">Chưa ai trong phòng khám.</p>} />
                </Section>
                <Section title="Đang chờ" count={waiting.length}>
                  {waiting.length === 0 && called.length === 0 && done.length === 0 ? (
                    <EmptyState title="Chưa có ai trong hàng chờ">Thêm người đến khám ở khung bên phải. Số thứ tự tính lại từ 001 mỗi ngày.</EmptyState>
                  ) : (
                    <QueueList label="Đang chờ" items={waiting.map(entry => toQueueItem(entry, can("queue") ? <Button variant="ghost" onClick={() => void act(entry, "cancel")}>Hủy lượt</Button> : null))}
                      onCall={can("queue") ? item => void act(waiting.find(entry => String(entry.id) === item.id)!, "call") : undefined} callLabel="Gọi khám"
                      onOpen={item => open(waiting.find(entry => String(entry.id) === item.id)!)} openLabel="Xem hồ sơ" warnAfter={30} empty={<p className="text-sm text-muted">Không còn ai đang chờ.</p>} />
                  )}
                </Section>
              </WorkspaceLayout>
            </div>
          );
        }}
      </Remote>
      <NewPatientDialog withQueue open={creating} onClose={() => setCreating(false)} onCreated={() => reload()} />
    </div>
  );
}
