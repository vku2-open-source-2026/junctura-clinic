// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, TextAreaField, TextField } from "@junctura/health-ui";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, publicInfo, takeTicket } from "./api";
import type { SelfTicket } from "./types";

/**
 * The page behind the QR code on the wall: a person at the station types their name and birth year and gets a ticket number.
 * No sign-in. It only works for people who already have a record, and the answer is just a number: it never shows anything about anyone.
 */
export function SelfService() {
  const station = new URLSearchParams(location.search).get("station") || "main";
  const [facility, setFacility] = useState("");
  const [form, setForm] = useState({ patientName: "", birthYear: "", reason: "" });
  const [state, setState] = useState<{ kind: "form"; error?: string } | { kind: "busy" } | { kind: "done"; ticket: SelfTicket }>({ kind: "form" });
  useEffect(() => { publicInfo().then(info => setFacility(info.facility), () => undefined); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ kind: "busy" });
    try {
      setState({ kind: "done", ticket: await takeTicket({ patientName: form.patientName, birthYear: form.birthYear, reason: form.reason || undefined, stationId: station }) });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      setState({ kind: "form", error: code === "record-not-found" ? "Chưa thấy hồ sơ khớp họ tên và năm sinh này. Hãy đến quầy tiếp đón, nhân viên sẽ lập hồ sơ cho bạn." : code === "too-many-requests" ? "Bạn đã thử quá nhiều lần. Hãy đến quầy tiếp đón." : error instanceof ApiError && error.status === 422 ? Object.values(error.fields).join(" ") : "Chưa lấy được số. Hãy thử lại hoặc đến quầy tiếp đón." });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header className="space-y-1 text-center">
        <p className="text-sm text-muted">{facility || "Trạm y tế"}</p>
        <h1 className="text-2xl font-semibold text-ink">Lấy số thứ tự khám</h1>
      </header>
      {state.kind === "done" ? (
        <section aria-live="polite" className="space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
          <p className="text-sm text-muted">{state.ticket.already ? "Bạn đã có số, vẫn đang trong hàng chờ" : "Số thứ tự của bạn"}</p>
          <p className="text-7xl font-semibold tracking-wide text-brand" aria-label={`Số ${state.ticket.ticket}`}>{state.ticket.ticket}</p>
          <p className="text-ink-2">{state.ticket.state === "called" ? "Đã gọi vào khám. Hãy đến phòng khám." : state.ticket.ahead === 0 ? "Bạn là người tiếp theo." : `Còn ${state.ticket.ahead} người trước bạn.`}</p>
          <p className="text-sm text-muted">Theo dõi số trên màn hình ở phòng chờ. Người cao tuổi, trẻ nhỏ và ca khẩn được gọi trước.</p>
        </section>
      ) : (
        <form className="space-y-4 rounded-lg border border-line bg-surface p-6" onSubmit={event => void submit(event)} noValidate>
          <p className="text-sm text-ink-2">Dành cho người đã có hồ sơ tại trạm. Chưa có hồ sơ thì đến quầy tiếp đón.</p>
          <TextField label="Họ và tên" required autoComplete="off" value={form.patientName} onChange={event => setForm(value => ({ ...value, patientName: event.target.value }))} />
          <TextField label="Năm sinh" required inputMode="numeric" maxLength={4} value={form.birthYear} onChange={event => setForm(value => ({ ...value, birthYear: event.target.value }))} />
          <TextAreaField label="Lý do đến khám" rows={2} hint="Không bắt buộc" value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} />
          {state.kind === "form" && state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" loading={state.kind === "busy"} disabled={form.patientName.trim().length < 2 || form.birthYear.trim().length !== 4}>Lấy số</Button>
          <p className="text-xs text-muted">Bạn chỉ nhận được số thứ tự. Trang này không hiển thị thông tin sức khỏe của ai.</p>
        </form>
      )}
    </main>
  );
}
