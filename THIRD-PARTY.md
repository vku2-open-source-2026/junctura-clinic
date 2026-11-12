<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Thành phần bên thứ ba

Junctura Clinic phát hành theo [Apache License 2.0](LICENSE). Tài liệu này liệt kê những gì dự án dùng nhưng không phải do dự án viết, kèm giấy phép. **Không có mã nguồn bên thứ ba nào được chép vào repo**: thư viện được khai trong `package.json`, khóa phiên bản bằng `package-lock.json` và cài từ registry bằng `npm ci`.

Danh sách dưới đây lấy từ trường `license` trong lockfile, ở phiên bản hiện tại. Khi thêm hoặc nâng cấp thư viện, cập nhật lại tài liệu này.

## 1. Thành phần của hệ sinh thái Junctura

Cùng giấy phép Apache-2.0, do nhóm dự án phát hành.

| Gói | Vai trò | Giấy phép |
| --- | --- | --- |
| [`@junctura/server-client`](https://www.npmjs.com/package/@junctura/server-client) | SDK gọi Junctura Tầng 1 (đổi vé, gọi API) | Apache-2.0 |
| [`@junctura/health-contracts`](https://www.npmjs.com/package/@junctura/health-contracts) | Hợp đồng năng lực dùng chung | Apache-2.0 |
| [`@junctura/health-ui`](https://www.npmjs.com/package/@junctura/health-ui) | Thư viện giao diện React dùng chung | Apache-2.0 |

## 2. Thư viện đi cùng bản build giao diện

Các gói này được đóng vào `web/dist` khi chạy `npm run build`. Máy chủ Node.js không dùng thư viện ngoài nào ngoài hai gói Junctura ở trên (SQLite lấy từ `node:sqlite` có sẵn trong Node).

| Gói | Phiên bản | Giấy phép | Dùng để |
| --- | --- | --- | --- |
| react, react-dom, scheduler | 19.3.1 / 19.3.1 / 0.28.0 | MIT | Dựng giao diện |
| lucide-react | 1.71.0 | ISC | Biểu tượng |
| qrcode | 1.5.4 | MIT | Tạo mã QR lấy số |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Phông chữ Inter |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | Phông chữ JetBrains Mono |

Phụ thuộc gián tiếp của `qrcode` (đều MIT hoặc ISC): `dijkstrajs`, `pngjs`, `yargs` và các gói con (`cliui`, `y18n`, `wrap-ansi`, `string-width`, `strip-ansi`, `ansi-regex`, `ansi-styles`, `color-convert`, `color-name`, `emoji-regex`, `find-up`, `locate-path`, `p-limit`, `p-locate`, `p-try`, `path-exists`, `camelcase`, `decamelize`, `get-caller-file`, `is-fullwidth-code-point`, `require-directory`, `require-main-filename`, `set-blocking`, `which-module`, `yargs-parser`).

**Phông chữ.** Inter và JetBrains Mono được phát hành theo [SIL Open Font License 1.1](https://openfontlicense.org/), cho phép dùng và phân phối kèm phần mềm. Phông được cài như thư viện npm và không bị sửa đổi.

## 3. Công cụ phát triển (không phân phối)

Chỉ dùng khi build và kiểm thử, không nằm trong sản phẩm chạy: TypeScript, Vite, Vitest, Testing Library, jsdom, Tailwind CSS, các công cụ đi kèm và phụ thuộc của chúng (khoảng 237 gói).

| Giấy phép | Số gói |
| --- | --- |
| MIT | 204 |
| ISC | 8 |
| MPL-2.0 | 12 |
| Apache-2.0 | 6 |
| BSD-2-Clause, BSD-3-Clause | 2 + 2 |
| MIT-0, 0BSD | 1 + 1 |
| CC-BY-4.0 | 1 |

Các gói MPL-2.0 là công cụ biên dịch (như `lightningcss`), được dùng nguyên bản, không sửa và không đóng vào sản phẩm. Gói CC-BY-4.0 là dữ liệu trình duyệt hỗ trợ (`caniuse-lite`), chỉ dùng lúc build.

## 4. Dữ liệu

| Dữ liệu | Nguồn | Ghi chú |
| --- | --- | --- |
| Hồ sơ người bệnh mẫu | Do bộ sinh [`junctura-health/seed`](https://github.com/vku2-open-source-2026/junctura-health/tree/main/seed) tạo ra | **Giả lập hoàn toàn**, không mô tả người thật |
| Danh mục ICD-10 và thuốc (`server/catalog/`) | Danh sách ngắn do dự án tự soạn cho bản demo | Mã bệnh theo ICD-10 của WHO. Không phải tài liệu tra cứu chuyên môn |

## 5. Dịch vụ bên ngoài (tùy chọn)

Tóm tắt hồ sơ bằng AI **tắt mặc định**. Khi người vận hành tự đặt `AI_SUMMARY_URL`, `AI_SUMMARY_KEY` và `AI_SUMMARY_MODEL`, Clinic gửi một yêu cầu HTTPS tới dịch vụ tương thích OpenAI mà người đó chọn (ví dụ Groq). Dịch vụ này không thuộc dự án: Clinic không chứa mã, mô hình hay khóa của họ, và việc dùng tuân theo điều khoản của nhà cung cấp mà người vận hành đã đăng ký. Dữ liệu gửi đi đã bỏ tên, số điện thoại, địa chỉ, mã hồ sơ và ngày sinh.
