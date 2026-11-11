// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, ErrorState, Skeleton } from "@junctura/health-ui";
import { ArrowLeft, Printer } from "lucide-react";
import { getPatient } from "./api";
import { allergyView } from "./domain";
import { ageOf, formatDate, severityLabel, sexLabel, urgencyLabel } from "./format";
import { navigate } from "./router";
import { useRemote, useSession } from "./session";

/** A plain page to print or save as PDF: no menus, black on white. */
export function ReferralSlip({ patientId, referralId }: { patientId: string; referralId: string }) {
  const { settings, facility } = useSession();
  const { state, reload } = useRemote(signal => getPatient(settings, patientId, signal), [settings, patientId]);
  if (state.status === "loading") return <div className="mx-auto max-w-3xl p-8"><Skeleton lines={6} /></div>;
  if (state.status === "error") return <div className="mx-auto max-w-xl p-8"><ErrorState onRetry={reload}>Không tải được phiếu. Thử lại sau.</ErrorState></div>;
  const record = state.data;
  const referral = record.referrals.find(item => item.referralId === referralId);
  const back = `/patients/${encodeURIComponent(patientId)}/referrals`;
  if (!referral) return <div className="mx-auto max-w-xl space-y-4 p-8"><ErrorState>Không có phiếu {referralId} trong hồ sơ này.</ErrorState><Button variant="secondary" onClick={() => navigate(back)}>Về hồ sơ</Button></div>;
  const allergy = allergyView(record);
  return (
    <div className="min-h-screen bg-app p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-between gap-3 print:hidden">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => navigate(back)}>Về hồ sơ</Button>
        <Button icon={<Printer aria-hidden className="size-4" />} onClick={() => window.print()}>In phiếu</Button>
      </div>
      <article aria-label="Phiếu chuyển tuyến" className="mx-auto max-w-3xl space-y-5 rounded-lg border border-line bg-surface p-8 text-ink print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-black">
        <header className="space-y-1 border-b border-line pb-4 text-center">
          <p className="text-sm uppercase tracking-wide text-muted">{facility}</p>
          <h1 className="text-2xl font-semibold">Phiếu chuyển tuyến</h1>
          <p className="text-sm text-muted">Mã phiếu <span className="font-mono">{referral.referralId}</span> · Ngày lập {formatDate(referral.issuedAt)}</p>
        </header>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Người bệnh</dt><dd className="font-medium">{record.patientName}</dd></div>
          <div><dt className="text-muted">Mã hồ sơ</dt><dd className="font-mono">{record.patientId}</dd></div>
          <div><dt className="text-muted">Tuổi · giới</dt><dd>{ageOf(record.birthYear)} tuổi · {sexLabel(record.sex)} (sinh {record.birthYear})</dd></div>
          <div><dt className="text-muted">Địa chỉ</dt><dd>{record.ward}</dd></div>
          <div><dt className="text-muted">Chuyển đến</dt><dd className="font-medium">{referral.toFacility}</dd></div>
          <div><dt className="text-muted">Mức khẩn</dt><dd>{urgencyLabel(referral.urgency)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">Lý do chuyển</dt><dd>{referral.reason}</dd></div>
          {referral.provisionalDiagnosis && <div className="sm:col-span-2"><dt className="text-muted">Chẩn đoán sơ bộ</dt><dd>{referral.provisionalDiagnosis.name} ({referral.provisionalDiagnosis.code})</dd></div>}
          {referral.treatmentGiven && <div className="sm:col-span-2"><dt className="text-muted">Đã xử trí tại trạm</dt><dd>{referral.treatmentGiven}</dd></div>}
          <div className="sm:col-span-2">
            <dt className="text-muted">Dị ứng</dt>
            <dd className={allergy.state === "recorded" ? "font-semibold" : ""}>
              {allergy.state === "recorded" ? record.allergies.map(item => `${item.substance}: ${item.reaction} (${severityLabel(item.severity).toLowerCase()})`).join("; ")
                : allergy.state === "none-known" ? "Nhân viên đã xác nhận chưa biết dị ứng nào." : "Chưa ghi nhận. Không có nghĩa là không dị ứng; hỏi lại người bệnh."}
            </dd>
          </div>
          {record.currentMedications.length > 0 && <div className="sm:col-span-2"><dt className="text-muted">Thuốc đang dùng</dt><dd>{record.currentMedications.map(item => `${item.name} ${item.dose}`).join("; ")}</dd></div>}
        </dl>
        <footer className="grid grid-cols-2 gap-6 pt-10 text-center text-sm"><p>Người bệnh hoặc người nhà<br /><span className="text-muted">(ký, ghi rõ họ tên)</span></p><p>Nhân viên y tế lập phiếu<br /><span className="text-muted">(ký, ghi rõ họ tên)</span></p></footer>
        <p className="text-center text-xs text-muted">Phiếu từ bản demo Junctura Clinic, dữ liệu giả lập.</p>
      </article>
    </div>
  );
}
