// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInPage } from "@junctura/health-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./Landing";

afterEach(cleanup);

describe("public pages", () => {
  it("landing page shows the product sections and sends the user to sign-in", async () => {
    const onSignIn = vi.fn();
    render(<Landing facility="Trạm y tế test" onSignIn={onSignIn} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Hồ sơ người bệnh/);
    expect(screen.getAllByText(/Dị ứng luôn ở đầu hồ sơ/)[0]).toBeTruthy();
    expect(screen.getAllByText(/Câu hỏi thường gặp/)[0]).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: /Đăng nhập/ })[0]);
    expect(onSignIn).toHaveBeenCalled();
  });

  it("sign-in page explains a failed attempt and can go back", async () => {
    const onSignIn = vi.fn();
    const onBack = vi.fn();
    render(<SignInPage product="Clinic" onSignIn={onSignIn} onBack={onBack} message="Phiên đăng nhập đã hết hạn." />);
    expect(screen.getByText("Phiên đăng nhập đã hết hạn.")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: /Đăng nhập/ })[0]);
    expect(onSignIn).toHaveBeenCalled();
  });
});
