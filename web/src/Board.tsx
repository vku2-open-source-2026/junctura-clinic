// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { publicBoard } from "./api";
import type { Board as BoardData } from "./types";

/** The waiting-room screen: ticket numbers only, no names. Open it full screen on a TV or tablet; it refreshes every few seconds. */
export function Board() {
  const station = new URLSearchParams(location.search).get("station") || "main";
  const [board, setBoard] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () => publicBoard(station).then(value => { if (!cancelled) { setBoard(value); setOffline(false); } }, () => { if (!cancelled) setOffline(true); });
    void load();
    const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [station]);

  return (
    <main className="min-h-screen bg-app px-6 py-8 text-ink">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-semibold">{board?.station ?? "Trạm y tế"}</h1>
        <p className="text-muted">{offline ? "Mất kết nối, đang thử lại…" : "Số đang chờ khám"}</p>
      </header>
      <section aria-live="polite" aria-label="Đang gọi vào khám" className="mb-10">
        <h2 className="mb-3 text-xl text-ink-2">Mời vào khám</h2>
        {board && board.calling.length > 0
          ? <ul className="flex flex-wrap gap-4">{board.calling.map(ticket => <li key={ticket} className="rounded-lg bg-brand px-8 py-4 text-6xl font-semibold text-white">{ticket}</li>)}</ul>
          : <p className="text-2xl text-muted">Chưa gọi số nào.</p>}
      </section>
      <section aria-label="Số đang chờ">
        <h2 className="mb-3 text-xl text-ink-2">Đang chờ ({board?.waitingCount ?? 0})</h2>
        {board && board.waiting.length > 0
          ? <ul className="flex flex-wrap gap-3">{board.waiting.map(item => (
            <li key={item.ticket} className={`rounded-lg border px-5 py-2 text-3xl font-medium ${item.priority === "normal" ? "border-line bg-surface" : "border-warn bg-warn/10"}`}>
              {item.ticket}{item.priority === "urgent" ? <span className="ml-2 text-base">ưu tiên</span> : item.priority === "group" ? <span className="ml-2 text-base">ưu tiên tuổi</span> : null}
            </li>))}</ul>
          : <p className="text-2xl text-muted">Không có ai đang chờ.</p>}
        {board && board.waitingCount > board.waiting.length && <p className="mt-3 text-muted">và {board.waitingCount - board.waiting.length} số nữa</p>}
      </section>
    </main>
  );
}
