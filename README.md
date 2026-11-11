<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Junctura Clinic

[![Checks](https://github.com/vku2-open-source-2026/junctura-clinic/actions/workflows/ci.yml/badge.svg)](https://github.com/vku2-open-source-2026/junctura-clinic/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![REUSE](https://img.shields.io/badge/REUSE-3.3-green.svg)](REUSE.toml)

**Phần mềm cho trạm y tế xã: tiếp đón, khám, tiêm chủng và chuyển tuyến, với hồ sơ chỉ được chia sẻ khi người bệnh đồng ý.**

Junctura Clinic là một ứng dụng trong [Junctura Health](https://github.com/vku2-open-source-2026/junctura-health), Tầng 2 của [Junctura DX-OS](https://github.com/vku2-open-source-2026/junctura-dxos). Trạm lưu hồ sơ ban đầu; khi bệnh viện hoặc nhà thuốc cần dữ liệu, trạm trả lời qua Junctura, đúng mục đích và chỉ với phần cần thiết.

## Mục lục

- [Tính năng](#tính-năng)
- [Vai trò trong hệ thống](#vai-trò-trong-hệ-thống)
- [Kiến trúc](#kiến-trúc)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình](#cấu-hình)
- [Kiểm thử](#kiểm-thử)
- [Hiện trạng](#hiện-trạng)
- [Đóng góp](#đóng-góp)
- [Giấy phép](#giấy-phép)

## Tính năng

| Nhóm | Chức năng |
| --- | --- |
| Tiếp đón | Hàng chờ khám theo ngày: thêm người đến khám (tìm hồ sơ cũ hoặc tạo mới, có cảnh báo trùng), số thứ tự từ 001, ưu tiên khẩn, gọi khám, hủy lượt |
| Hồ sơ | Tìm không cần gõ dấu, lọc theo nhóm (có dị ứng, cao tuổi, trẻ nhỏ); thanh dị ứng luôn ở đầu hồ sơ |
| Khám bệnh | Ghi lý do, sinh hiệu, chẩn đoán, đơn thuốc, dặn dò; cập nhật dị ứng, bệnh mạn tính, thuốc đang dùng |
| An toàn thuốc | Kê thuốc trùng nhóm với dị ứng đã ghi nhận bị chặn, chỉ vượt được khi nhập lý do |
| Tiêm chủng | Ghi mũi tiêm, tự tính số mũi, chặn tiêm trùng hoặc đủ mũi, danh sách nhắc tiêm toàn trạm |
| Chuyển tuyến | Lập phiếu chuyển tuyến, trang xem và in |
| Nhật ký | Ai, lúc nào, làm gì, với hồ sơ nào (kể cả lượt xem); không chứa nội dung khám |
| Phân quyền | `clinic-staff`, `clinic-manager` làm mọi việc; `clinic-reception` chỉ tiếp đón và xem hồ sơ; vai trò khác bị từ chối |
| Giao diện | Dựng trên [`@junctura/health-ui`](https://www.npmjs.com/package/@junctura/health-ui): sáng/tối, cỡ chữ, tìm nhanh (`/` hoặc Ctrl+K), dùng được trên điện thoại |

Danh sách dị ứng rỗng luôn hiện là "chưa ghi nhận", không bao giờ là "không dị ứng".

## Vai trò trong hệ thống

Clinic là **bên cung cấp** bốn năng lực theo [hợp đồng dùng chung](https://github.com/vku2-open-source-2026/junctura-health/tree/main/contracts):

| Năng lực | Bên gọi | Mục đích | Cấp cứu |
| --- | --- | --- | --- |
| `pre-visit-summary` | Hospital | `treatment` | Có |
| `allergy-list` | Hospital, Pharmacy | `treatment`, `dispensing` | Có |
| `vaccination-history` | Hospital | `treatment` | Không |
| `referral-summary` | Hospital | `referral_intake` | Không |

Clinic không gọi thẳng ứng dụng khác và không đọc database của ứng dụng khác; mọi trao đổi đi qua Junctura.

## Kiến trúc

| Thành phần | Công nghệ |
| --- | --- |
| Máy chủ | Node.js 24, không framework; API trong `server/` |
| Lưu trữ | SQLite qua `node:sqlite` (có sẵn trong Node, không thêm thư viện), file `data/clinic.db` |
| Đăng nhập | Junctura (OpenID Connect, PKCE); phiên ký RS256 |
| Giao diện | React 19, Vite, `@junctura/health-ui` |
| Dữ liệu mẫu | Dữ liệu giả lập của [junctura-health](https://github.com/vku2-open-source-2026/junctura-health), nạp một lần đầu, ngày tháng dời để ngày demo là hôm nay |

```text
server/   API, SQLite, phân quyền, nhật ký
web/      giao diện React
tests/    kiểm thử máy chủ
scripts/  kiểm tra cú pháp và REUSE
```

## Bắt đầu nhanh

**Yêu cầu**

- Node.js 24 (xem `.node-version`)
- [junctura-dxos](https://github.com/vku2-open-source-2026/junctura-dxos) đang chạy và [junctura-health](https://github.com/vku2-open-source-2026/junctura-health) đã chạy `npm run demo:setup`. Hai repo này nằm cạnh thư mục Clinic; nếu ở nơi khác, đặt `JUNCTURA_HEALTH_DIR`.

**Build từ mã nguồn**

```sh
git clone https://github.com/vku2-open-source-2026/junctura-clinic.git
cd junctura-clinic
npm run web:install   # cài thư viện giao diện từ lockfile
npm run build         # build giao diện vào web/dist
```

**Chạy**

```sh
npm start
```

Mở <http://localhost:5181> và đăng nhập bằng `ysi.tramyte`. Mật khẩu demo nằm trong `.junctura/demo/accounts.env` của junctura-health.

**Phát triển giao diện:** chạy `npm run dev:server` (API, cổng 5191) và `npm run dev` (giao diện, cổng 5181, tự chuyển `/api` sang 5191).

## Cấu hình

Máy chủ đọc kết nối từ `.junctura/demo/junctura-clinic.env` do `demo:setup` tạo (mẫu: [`.env.example`](.env.example)); thiếu biến nào nó báo rõ biến đó.

| Biến | Ý nghĩa | Mặc định |
| --- | --- | --- |
| `JUNCTURA_HEALTH_DIR` | Vị trí repo junctura-health | `../junctura-health` |
| `CLINIC_DB` | File SQLite; xóa file để nạp lại dữ liệu mẫu | `data/clinic.db` |

## Kiểm thử

```sh
npm run check         # cú pháp
npm run check:reuse   # REUSE 3.3 (pip install -r requirements-reuse.txt)
npm test              # máy chủ
npm run web:test      # giao diện
```

Cả bốn lệnh chạy tự động trong [CI](.github/workflows/ci.yml) cho mỗi PR.

## Hiện trạng

Ứng dụng trạm y tế (đăng nhập, tiếp đón, khám, tiêm chủng, chuyển tuyến, nhật ký) đã chạy được. **Chưa có:** cung cấp bốn năng lực qua Junctura và tab nhật ký truy cập từ Junctura. Tiến độ ở [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues) và [CHANGELOG](CHANGELOG.md).

Bản demo soạn tóm tắt theo quy tắc cố định, không dùng AI. Lịch nhắc tiêm theo bộ lịch mẫu của demo, không phải hướng dẫn chuyên môn.

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi và đề xuất tại [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues).

## Giấy phép

[Apache License 2.0](LICENSE), xem thêm [NOTICE](NOTICE). Mỗi file nguồn có header SPDX; file không ghi chú thích được (JSON, dữ liệu) được khai trong [REUSE.toml](REUSE.toml). Repo tuân thủ [REUSE 3.3](https://reuse.software/spec-3.3/).
