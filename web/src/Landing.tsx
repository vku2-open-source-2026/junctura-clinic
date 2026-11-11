// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AlertBanner, Badge, LandingPage, PreviewFrame, StatStrip, type LandingProps } from "@junctura/health-ui";
import { BellRing, ClipboardList, FileText, Lock, Pill, ShieldCheck, Stethoscope, Syringe, Users } from "lucide-react";

/** A small, fictional picture of the Today screen (no real patient data). */
const HeroPicture = () => (
  <PreviewFrame label="Minh hoạ màn hình Hôm nay của Clinic" title="Clinic · Hôm nay">
    <div className="space-y-3">
      <StatStrip items={[
        { label: "Người bệnh", value: 50 }, { label: "Dị ứng nặng", value: 1, tone: "danger" },
        { label: "Tiêm quá hạn", value: 12, tone: "warn" }, { label: "Chuyển tuyến", value: 4 },
      ]} />
      <AlertBanner level="critical" title="1 người bệnh có dị ứng nặng">Kiểm tra trước khi kê thuốc hoặc tiêm.</AlertBanner>
      <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
        <span className="font-medium">Nguyễn Văn An</span><Badge tone="warn">Chưa ghi nhận dị ứng</Badge>
      </div>
    </div>
  </PreviewFrame>
);

const SOURCE = "https://github.com/vku2-open-source-2026/junctura-clinic";

export const landingProps = (facility?: string): Omit<LandingProps, "onSignIn"> => ({
  product: "Clinic",
  badge: "Trạm y tế, phòng khám nhỏ",
  headline: "Hồ sơ người bệnh của trạm y tế, gọn và an toàn trên một màn hình",
  lead: "Tìm người bệnh, xem dị ứng và thuốc đang dùng, nhắc mũi tiêm, lập phiếu chuyển tuyến. Dữ liệu liên thông với bệnh viện qua Junctura, chỉ khi người bệnh đồng ý.",
  note: facility ? `${facility}. Dữ liệu trong bản demo là dữ liệu giả lập.` : "Dữ liệu trong bản demo là dữ liệu giả lập.",
  hero: <HeroPicture />,
  benefits: { title: "Làm việc nhanh hơn, ít sai sót hơn", lead: "Thiết kế cho một ca trực đông người, máy yếu, người dùng không rành công nghệ.", items: [
    { icon: <ShieldCheck className="size-5" />, title: "Dị ứng luôn ở đầu hồ sơ", text: "Chưa ghi nhận không bao giờ bị hiểu là không dị ứng." },
    { icon: <ClipboardList className="size-5" />, title: "Việc cần làm hôm nay", text: "Mũi tiêm quá hạn, dị ứng nặng và phiếu chuyển tuyến gần đây hiện ngay màn hình đầu." },
    { icon: <FileText className="size-5" />, title: "Chia sẻ có đồng ý", text: "Bệnh viện chỉ xem được khi người bệnh đồng ý; mỗi lần đều để lại nhật ký." },
  ] },
  steps: { title: "Một ca khám trong ba bước", items: [
    { title: "Tìm hồ sơ", text: "Gõ họ tên hoặc mã hồ sơ; phím / mở tìm nhanh từ mọi màn hình." },
    { title: "Xem và xử trí", text: "Dị ứng, thuốc đang dùng, bệnh mạn tính và lịch sử khám trong một trang." },
    { title: "Nhắc tiêm, chuyển tuyến", text: "Thấy mũi sắp đến hạn; phiếu chuyển tuyến gửi bệnh viện qua Junctura." },
  ] },
  audiences: { title: "Mỗi người một việc, một màn hình", items: [
    { icon: <Users className="size-5" />, title: "Cán bộ tiếp đón", text: "Tìm và mở đúng hồ sơ, biết ai vừa khám gần đây." },
    { icon: <Stethoscope className="size-5" />, title: "Bác sĩ, y sĩ", text: "Hồ sơ, dị ứng, thuốc đang dùng và lịch sử khám." },
    { icon: <Syringe className="size-5" />, title: "Cán bộ tiêm chủng", text: "Mũi đã tiêm, mũi quá hạn và mũi sắp đến hạn." },
  ] },
  trust: { title: "Riêng tư là mặc định", items: [
    { icon: <Lock className="size-5" />, title: "Đăng nhập qua Junctura", text: "Mật khẩu chỉ nhập trên trang của Junctura, Clinic không lưu mật khẩu." },
    { icon: <BellRing className="size-5" />, title: "Mã nguồn mở", text: "Giấy phép Apache-2.0, kiểm tra được từng dòng." },
    { icon: <Pill className="size-5" />, title: "AI chỉ tóm tắt", text: "Mặc định tắt, không chẩn đoán, luôn dẫn về hồ sơ gốc." },
  ] },
  faq: { title: "Câu hỏi thường gặp", items: [
    { q: "Dữ liệu có rời khỏi trạm không?", a: "Chỉ khi người bệnh đồng ý và đúng mục đích, qua Junctura." },
    { q: "Ai đăng nhập được?", a: "Chỉ tài khoản nhân viên trạm y tế do đơn vị cấp trên Junctura." },
    { q: "Máy yếu có dùng được không?", a: "Có. Giao diện nhẹ, chữ có ba cỡ, tương phản cao và thao tác được bằng bàn phím." },
  ] },
  cta: { title: "Sẵn sàng cho ca trực hôm nay?", lead: "Đăng nhập bằng tài khoản Junctura của trạm." },
  footer: { links: [{ label: "Mã nguồn", href: SOURCE }, { label: "Báo lỗi", href: `${SOURCE}/issues` }, { label: "Giấy phép", href: "https://www.apache.org/licenses/LICENSE-2.0" }] },
});

export const Landing = ({ facility, onSignIn }: { facility?: string; onSignIn: () => void }) => <LandingPage {...landingProps(facility)} onSignIn={onSignIn} />;
