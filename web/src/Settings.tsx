// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, PageHeader, useToast } from "@junctura/health-ui";
import { useState } from "react";
import { ApiError, saveSettings } from "./api";
import { useSession } from "./session";
import type { Permission } from "./types";

const PERMISSION_LABEL: Record<Permission, string> = {
  read: "Xem hồ sơ", register: "Thêm người bệnh", queue: "Xếp hàng chờ", exam: "Ghi lượt khám, dị ứng, thuốc", vaccinate: "Ghi mũi tiêm",
  refer: "Lập phiếu chuyển tuyến", "audit.read": "Xem nhật ký thao tác", report: "Xem báo cáo", "settings.write": "Đổi cài đặt trạm",
};
const ROLE_LABEL: Record<string, string> = { "clinic-staff": "Nhân viên y tế", "clinic-manager": "Quản lý trạm", "clinic-reception": "Tiếp đón" };

export function Settings() {
  const { settings, facility, me, can, station, setStation, expire } = useSession();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const editable = can("settings.write");

  const toggle = async (patch: { aiSummary?: boolean; aiModel?: boolean }, message: string) => {
    setSaving(true);
    try {
      setStation(await saveSettings(settings, patch));
      notify(message, "ok");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return expire();
      notify("Chưa lưu được cài đặt. Hãy thử lại.", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt" description="Thông tin trạm, tài khoản đang dùng và các tính năng bật/tắt." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Trạm y tế">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted">Tên trạm</dt><dd className="font-medium text-ink">{facility}</dd></div>
            <div><dt className="text-muted">Dữ liệu</dt><dd className="text-ink-2">Lưu trên máy chủ của trạm. Bản demo dùng dữ liệu giả lập, không có người bệnh thật.</dd></div>
          </dl>
        </Card>
        <Card title="Tài khoản của bạn">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted">Họ tên</dt><dd className="font-medium text-ink">{me.displayName}</dd></div>
            <div><dt className="text-muted">Vai trò</dt><dd className="text-ink-2">{ROLE_LABEL[me.role] ?? me.role}</dd></div>
            <div><dt className="text-muted">Được phép</dt><dd className="mt-1 flex flex-wrap gap-1.5">{me.permissions.map(item => <Badge key={item} tone="brand">{PERMISSION_LABEL[item]}</Badge>)}</dd></div>
          </dl>
        </Card>
        <Card title="Tóm tắt hồ sơ tự động" className="lg:col-span-2">
          <div className="space-y-3 text-sm text-ink-2">
            <p>Khi bật, trang hồ sơ có nút soạn bản tóm tắt ngắn từ chính dữ liệu trong hồ sơ. Mặc định bản tóm tắt soạn theo quy tắc cố định, không chẩn đoán và không đưa lời khuyên điều trị.</p>
            <label className="flex items-start gap-3 text-ink">
              <input type="checkbox" className="mt-1 size-5" checked={station.aiSummary} disabled={!editable || saving} onChange={event => void toggle({ aiSummary: event.target.checked }, event.target.checked ? "Đã bật tóm tắt tự động" : "Đã tắt tóm tắt tự động")} />
              <span><span className="font-medium">Bật tóm tắt tự động</span><br /><span className="text-muted">{editable ? "Áp dụng cho cả trạm." : "Vai trò của bạn không được đổi cài đặt."}</span></span>
            </label>
            <label className="flex items-start gap-3 text-ink">
              <input type="checkbox" className="mt-1 size-5" checked={station.aiModel} disabled={!editable || saving || !station.aiConfigured || !station.aiSummary} onChange={event => void toggle({ aiModel: event.target.checked }, event.target.checked ? "Đã bật mô hình AI cho tóm tắt" : "Đã tắt mô hình AI, dùng tóm tắt theo mẫu")} />
              <span><span className="font-medium">Dùng mô hình AI để tóm tắt</span><br />
                <span className="text-muted">{station.aiConfigured ? "Chỉ gửi tuổi, giới và nội dung y khoa đã bỏ tên, số điện thoại, địa chỉ, mã hồ sơ. Kết quả luôn có nhãn cần kiểm tra lại với hồ sơ gốc." : "Chưa cấu hình mô hình (biến AI_SUMMARY_URL của máy chủ), nên đang dùng tóm tắt theo mẫu."}</span></span>
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}
