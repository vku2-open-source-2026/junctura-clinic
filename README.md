<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Junctura Clinic

[![Checks](https://github.com/vku2-open-source-2026/junctura-clinic/actions/workflows/ci.yml/badge.svg)](https://github.com/vku2-open-source-2026/junctura-clinic/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![REUSE](https://img.shields.io/badge/REUSE-3.3-green.svg)](REUSE.toml)

**Junctura Clinic** là ứng dụng **trạm y tế xã** trong [Junctura Health](https://github.com/vku2-open-source-2026/junctura-health), Tầng 2 của [Junctura DX-OS](https://github.com/vku2-open-source-2026/junctura-dxos). Trạm lưu hồ sơ ban đầu, tiêm chủng và gửi chuyển tuyến; khi bệnh viện cần dữ liệu, trạm trả lời qua Junctura, chỉ khi người bệnh đồng ý và đúng mục đích.

> Trạng thái: đang xây dựng. Theo dõi tiến độ ở [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues) và [CHANGELOG](CHANGELOG.md).

## Vai trò trong hệ thống

Clinic là **bên cung cấp** bốn năng lực theo [hợp đồng dùng chung](https://github.com/vku2-open-source-2026/junctura-health/tree/main/contracts):

| Năng lực | Bên gọi | Mục đích | Cấp cứu |
| --- | --- | --- | --- |
| `pre-visit-summary` | Hospital | `treatment` | Có |
| `allergy-list` | Hospital, Pharmacy | `treatment`, `dispensing` | Có |
| `vaccination-history` | Hospital | `treatment` | Không |
| `referral-summary` | Hospital | `referral_intake` | Không |

Clinic không gọi thẳng ứng dụng khác và không đọc database của ứng dụng khác; mọi trao đổi đi qua Junctura.

## Hiện có

- **Đăng nhập bằng Junctura** (OpenID Connect, PKCE): chỉ nhân viên trạm y tế (tài khoản của ứng dụng này) xem được hồ sơ; người khác nhận 403.
- **Giao diện dựng trên [`@junctura/health-ui`](https://www.npmjs.com/package/@junctura/health-ui)**: trang giới thiệu, khung ứng dụng có tìm nhanh (phím `/` hoặc Ctrl+K), sáng/tối, cỡ chữ, dùng được trên điện thoại.
- **Hôm nay**: số liệu, việc cần xử lý (dị ứng nặng, mũi tiêm quá hạn, phiếu chuyển tuyến), khám gần đây.
- **Bệnh nhân và hồ sơ**: lọc theo nhóm (có dị ứng, cao tuổi, trẻ nhỏ), tìm không cần gõ dấu; hồ sơ có thanh dị ứng luôn ở đầu, các tab tổng quan, thuốc, tiêm chủng, chuyển tuyến, lịch sử. Danh sách dị ứng rỗng hiện là "chưa ghi nhận dị ứng", không bao giờ là "không dị ứng".
- **Hàng chờ khám (Tiếp đón)**: thêm người đến khám (tìm hồ sơ cũ hoặc tạo hồ sơ mới, có cảnh báo trùng), xếp số thứ tự từ 001 mỗi ngày, ưu tiên khẩn, gọi khám, hủy lượt. Lưu lượt khám thì số tự chuyển sang "đã khám".
- **Khám bệnh**: ghi lượt khám (lý do, sinh hiệu, chẩn đoán, đơn thuốc, dặn dò), cập nhật dị ứng, bệnh mạn tính, thuốc đang dùng. Kê thuốc trùng nhóm với dị ứng đã ghi nhận bị chặn, chỉ vượt được khi nhập lý do. Dị ứng "chưa ghi nhận" khác "đã xác nhận chưa biết dị ứng".
- **Ghi mũi tiêm** (tự tính số mũi, chặn tiêm trùng hoặc đủ mũi) và **lập phiếu chuyển tuyến** có trang xem/in.
- **Nhật ký thao tác**: ai, lúc nào, làm gì, với hồ sơ nào (cả lượt xem hồ sơ). Không chứa nội dung khám.
- **Cài đặt**: thông tin trạm, quyền của tài khoản, bật/tắt tóm tắt tự động (mặc định tắt; bản demo soạn theo quy tắc cố định, không dùng AI).
- **Phân quyền**: `clinic-staff`/`clinic-manager` làm mọi việc; `clinic-reception` chỉ thêm người bệnh, xếp hàng chờ và xem hồ sơ; vai trò khác bị từ chối.
- **Lưu dữ liệu** vào SQLite (`node:sqlite`, không thêm thư viện) tại `data/clinic.db`, nạp dữ liệu mẫu một lần đầu; file này không đưa vào git.
- **Tiêm chủng** và **Chuyển tuyến**: danh sách toàn trạm. Lịch nhắc tiêm theo bộ lịch mẫu của bản demo, không phải hướng dẫn chuyên môn.
- Dữ liệu là **dữ liệu giả lập** của [junctura-health](https://github.com/vku2-open-source-2026/junctura-health), đọc trực tiếp từ thư mục đó (không chép vào repo); ngày tháng được dời để ngày demo là hôm nay.

Chưa có: cung cấp năng lực qua Junctura (xem [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues)).

## Yêu cầu

- Node.js 24 (xem `.node-version`). Máy chủ dùng `node:sqlite` nên cần Node 22.5 trở lên.
- [junctura-dxos](https://github.com/vku2-open-source-2026/junctura-dxos) đang chạy và [junctura-health](https://github.com/vku2-open-source-2026/junctura-health) đã chạy `npm run demo:setup`. Cả hai nằm cạnh thư mục này; nếu ở nơi khác, đặt `JUNCTURA_HEALTH_DIR`.

## Build từ mã nguồn

```sh
git clone https://github.com/vku2-open-source-2026/junctura-clinic.git
cd junctura-clinic
npm run check
npm test                # kiểm thử máy chủ
npm run web:install     # cài thư viện giao diện từ lockfile
npm run web:test        # kiểm thử giao diện
npm run build           # build giao diện vào web/dist
```

## Chạy

```sh
npm start
```

Mở <http://localhost:5181> và đăng nhập bằng `ysi.tramyte`. Mật khẩu demo nằm trong `.junctura/demo/accounts.env` của junctura-health. Máy chủ đọc thông tin kết nối từ `.junctura/demo/junctura-clinic.env` do `demo:setup` tạo (xem [`.env.example`](.env.example)); chạy mà thiếu thì nó báo rõ biến nào cần.

Biến `CLINIC_DB` đổi nơi lưu dữ liệu (mặc định `data/clinic.db`). Xóa file này để nạp lại dữ liệu mẫu.

Khi sửa giao diện, chạy hai tiến trình: `npm run dev:server` (API ở cổng 5191) và `npm run dev` (giao diện ở cổng 5181, tự chuyển `/api` sang cổng 5191).

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi và đề xuất ở [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues).

## Giấy phép

Mã nguồn phát hành theo [Apache License 2.0](LICENSE); xem thêm [NOTICE](NOTICE). Mỗi file nguồn ghi giấy phép bằng header SPDX; file không ghi chú thích được (JSON, dữ liệu) được khai trong [REUSE.toml](REUSE.toml). Repo tuân thủ [REUSE 3.3](https://reuse.software/spec-3.3/).
