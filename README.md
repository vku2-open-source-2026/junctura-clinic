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
- **Danh sách và hồ sơ người bệnh**: tìm theo tên (không cần gõ dấu) hoặc mã; hồ sơ gồm dị ứng (cảnh báo nặng), bệnh mạn tính, thuốc đang dùng, lượt khám, tiêm chủng, chuyển tuyến.
- Dữ liệu là **dữ liệu giả lập** của [junctura-health](https://github.com/vku2-open-source-2026/junctura-health), đọc trực tiếp từ thư mục đó (không chép vào repo); ngày tháng được dời để ngày demo là hôm nay.

Chưa có: ghi tiêm chủng, tạo phiếu chuyển tuyến và cung cấp năng lực qua Junctura (xem [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues)).

## Yêu cầu

- Node.js 24 (xem `.node-version`). Máy chủ chỉ dùng tính năng có từ Node 22.
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

Khi sửa giao diện, chạy hai tiến trình: `npm run dev:server` (API ở cổng 5191) và `npm run dev` (giao diện ở cổng 5181, tự chuyển `/api` sang cổng 5191).

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi và đề xuất ở [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues).

## Giấy phép

Mã nguồn phát hành theo [Apache License 2.0](LICENSE); xem thêm [NOTICE](NOTICE). Mỗi file nguồn ghi giấy phép bằng header SPDX; file không ghi chú thích được (JSON, dữ liệu) được khai trong [REUSE.toml](REUSE.toml). Repo tuân thủ [REUSE 3.3](https://reuse.software/spec-3.3/).
