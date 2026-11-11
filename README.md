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

## Yêu cầu

- Node.js 24 (xem `.node-version`)
- Một Junctura DX-OS đang chạy; chuẩn bị môi trường bằng `npm run demo:setup` ở [junctura-health](https://github.com/vku2-open-source-2026/junctura-health)

## Build từ mã nguồn

```sh
git clone https://github.com/vku2-open-source-2026/junctura-clinic.git
cd junctura-clinic
npm run check
npm test
```

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi và đề xuất ở [Issues](https://github.com/vku2-open-source-2026/junctura-clinic/issues).

## Giấy phép

Mã nguồn phát hành theo [Apache License 2.0](LICENSE); xem thêm [NOTICE](NOTICE). Mỗi file nguồn ghi giấy phép bằng header SPDX; file không ghi chú thích được (JSON, dữ liệu) được khai trong [REUSE.toml](REUSE.toml). Repo tuân thủ [REUSE 3.3](https://reuse.software/spec-3.3/).
