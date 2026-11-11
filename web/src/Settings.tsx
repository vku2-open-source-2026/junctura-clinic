// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, PageHeader, useToast } from "@junctura/health-ui";
import { useState } from "react";
import { ApiError, saveSettings } from "./api";
import { useSession } from "./session";
import type { Permission } from "./types";

const PERMISSION_LABEL: Record<Permission, string> = {
  read: "Xem hồ sơ", register: "Thêm người bệnh", queue: "Xếp hàng chờ", exam: "Ghi lượt khám, dị ứng, thuốc", vaccinate: "Ghi mũi tiêm",
  refer: "Lập phiếu chuyển tuyến", "audit.read": "Xem nhật ký thao tác", "settings.write": "Đổi cài đặt trạm",
};
const ROLE_LABEL: Record<string, string> = { "clinic-staff": "Nhân viên y tế", "clinic-manager": "Quản lý trạm", "clinic-reception": "Tiếp đón" };

export function Settings() {
  const { settings, facility, me, can, station, setStation, expire } = useSession();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const editable = can("settings.write");

  const toggle = async (aiSummary: boolean) => {
    setSaving(true);
    try {
      setStation(await saveSettings(settings, { aiSummary }));
      notify(aiSummary ? "Đã bật tóm tắt tự động" : "Đã tắt tóm tắt tự động", "ok");
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
            <p>Khi bật, trang hồ sơ có nút soạn bản tóm tắt ngắn từ chính dữ liệu trong hồ sơ. Bản demo soạn theo quy tắc cố định, <strong>không dùng mô hình AI</strong>, không chẩn đoán và không gợi ý điều trị. Mỗi lần xem đều được ghi vào nhật ký. Mặc định tắt.</p>
            <label className="flex items-start gap-3 text-ink">
              <input type="checkbox" className="mt-1 size-5" checked={station.aiSummary} disabled={!editable || saving} onChange={event => void toggle(event.target.checked)} />
              <span><span className="font-medium">Bật tóm tắt tự động</span><br /><span className="text-muted">{editable ? "Áp dụng cho cả trạm." : "Vai trò của bạn không được đổi cài đặt."}</span></span>
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}
