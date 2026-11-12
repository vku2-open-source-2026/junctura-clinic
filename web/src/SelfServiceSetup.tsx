// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, PageHeader, Section } from "@junctura/health-ui";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { navigate } from "./router";
import { useSession } from "./session";

/** A printable sheet with the QR code people scan to take a ticket, and a link to the waiting-room screen. */
export function SelfServiceSetup() {
  const { stationId, stations, facility } = useSession();
  const stationName = stations.find(item => item.id === stationId)?.name ?? facility;
  const link = `${location.origin}/lay-so?station=${encodeURIComponent(stationId)}`;
  const board = `${location.origin}/bang-so?station=${encodeURIComponent(stationId)}`;
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => { let live = true; QRCode.toDataURL(link, { margin: 2, width: 360, errorCorrectionLevel: "M" }).then(url => { if (live) setImage(url); }, () => undefined); return () => { live = false; }; }, [link]);
  return (
    <div className="space-y-5">
      <div className="print:hidden"><PageHeader title="Mã QR lấy số và bảng số" description="Dán mã QR ở cửa trạm: người đã có hồ sơ quét mã, nhập họ tên và năm sinh để lấy số. Mở bảng số trên màn hình ở phòng chờ."
        actions={<Button variant="secondary" icon={<Printer aria-hidden className="size-4" />} onClick={() => window.print()}>In tờ này</Button>} /></div>
      <section className="mx-auto max-w-sm space-y-3 rounded-lg border border-line bg-surface p-6 text-center">
        <h2 className="text-xl font-semibold text-ink">{stationName}</h2>
        <p className="text-ink-2">Quét mã để lấy số thứ tự khám</p>
        {image ? <img src={image} alt={`Mã QR dẫn tới ${link}`} className="mx-auto size-64" /> : <p className="text-muted">Đang tạo mã…</p>}
        <p className="break-all text-xs text-muted">{link}</p>
      </section>
      <div className="print:hidden">
        <Section title="Bảng số cho phòng chờ" description="Chỉ hiện số thứ tự, không hiện tên người bệnh. Mở trang này trên màn hình ở phòng chờ.">
          <div className="flex flex-wrap items-center gap-3"><Button onClick={() => window.open(board, "_blank", "noopener")}>Mở bảng số</Button><code className="break-all rounded bg-surface-2 px-2 py-1 text-sm">{board}</code></div>
        </Section>
        <div className="mt-4"><Button variant="ghost" onClick={() => navigate("/reception")}>Quay lại hàng chờ khám</Button></div>
      </div>
    </div>
  );
}
