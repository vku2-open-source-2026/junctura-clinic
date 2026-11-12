<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Đóng góp cho Junctura Clinic

## Quy trình

1. Mở hoặc nhận một Issue.
2. Tạo nhánh từ `main`: `feat/<việc>`, `fix/<việc>`, `docs/<việc>` hoặc `chore/<việc>`.
3. Commit theo [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
4. Trước khi push, chạy `npm run check`, `npm run check:reuse` và `npm test`.
5. Mở Pull Request vào `main`. Title viết tiếng Anh theo Conventional Commits, mô tả viết tiếng Việt theo mẫu. Cần CI xanh và một người khác duyệt.

## Quy tắc bắt buộc

- **Header SPDX ở đầu mọi file nguồn** (comment theo cú pháp của file):

  <!-- REUSE-IgnoreStart -->
  ```js
  // SPDX-FileCopyrightText: 2026 Junctura Contributors
  // SPDX-License-Identifier: Apache-2.0
  ```
  <!-- REUSE-IgnoreEnd -->

  File không ghi được chú thích (JSON, dữ liệu) thì khai trong `REUSE.toml`.
- **Không chép thư viện vào repo.** Khai báo trong `package.json` và commit lockfile; `node_modules/` không bao giờ được commit.
- **Không dùng dữ liệu người bệnh thật.** Chỉ dùng dữ liệu giả lập (xem `junctura-health/seed`).
- **Không commit bí mật** (`.env`, khóa, token). Dùng `.env.example` để mô tả biến môi trường.
- Hợp đồng năng lực dùng chung nằm ở `junctura-health/contracts`; đổi hợp đồng phải sửa ở đó trước.
- Ghi thay đổi đáng chú ý vào mục `Unreleased` của `CHANGELOG.md`.
- **Lỗ hổng bảo mật** báo riêng theo [SECURITY.md](SECURITY.md), không mở Issue công khai. Mọi người tham gia theo [Quy tắc ứng xử](CODE_OF_CONDUCT.md).

## Lưu ý khi chạy `npm run check:reuse`

Công cụ `reuse` (6.2.0) đoán bảng mã của file từ 2048 byte đầu. File tài liệu có nhiều tiếng Việt ngay phần đầu (README, tài liệu) đôi khi bị đoán sai và báo thiếu header SPDX dù header vẫn có. Cách xử lý: thêm một dấu cách thừa ở cuối dòng chú thích SPDX hoặc xen vài ký tự ASCII vào phần đầu file, rồi chạy lại. Đừng xóa header.
