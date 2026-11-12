// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { ToastProvider } from "@junctura/health-ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addStation, ApiError, downloadReportCsv, getReport, publicBoard, publicInfo, takeTicket } from "./api";
import { Board } from "./Board";
import { ReferralProgress } from "./parts";
import { Reports } from "./Reports";
import { SelfService } from "./SelfService";
import { SessionProvider, type SessionValue } from "./session";
import { Stations } from "./Stations";
import type { Permission, Report } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getReport: vi.fn(), downloadReportCsv: vi.fn(), addStation: vi.fn(), publicBoard: vi.fn(), publicInfo: vi.fn(), takeTicket: vi.fn(),
}));

const ALL: Permission[] = ["read", "register", "queue", "exam", "vaccinate", "refer", "audit.read", "report", "settings.write"];
const session = (permissions: Permission[], extra: Partial<SessionValue> = {}): SessionValue => ({
  settings: { issuer: "https://id.test", clientId: "c" }, facility: "Trạm test", expire: () => {}, setCrumbs: () => {},
  me: { username: "u", displayName: "Nhân viên", role: "clinic-manager", permissions }, can: permission => permissions.includes(permission),
  station: { aiSummary: false, aiModel: false, aiConfigured: false }, setStation: () => {},
  stations: [{ id: "main", name: "Trạm test" }], stationId: "main", setStations: () => {}, setStationId: () => {}, ...extra,
});
const wrap = (node: React.ReactNode, permissions: Permission[] = ALL, extra: Partial<SessionValue> = {}) => render(<ToastProvider><SessionProvider value={session(permissions, extra)}>{node}</SessionProvider></ToastProvider>);

afterEach(() => { cleanup(); vi.clearAllMocks(); history.replaceState(null, "", "/"); });

const report: Report = {
  from: "2026-10-01", to: "2026-10-31", totals: { encounters: 12, vaccinations: 5, referrals: 2, queue: 9, patients: 10 },
  daily: [{ date: "2026-10-28", encounters: 3, vaccinations: 1, referrals: 0, queue: 2 }],
  diagnoses: [{ code: "I10", name: "Tăng huyết áp vô căn", count: 4 }], wards: [{ ward: "Hòa Khánh Bắc", encounters: 7, patients: 6 }],
  ages: [{ band: "18–59 tuổi", count: 8 }], vaccines: [{ vaccine: "Vắc xin cúm mùa", doses: 3, patients: 3 }],
};

describe("reports", () => {
  it("shows counts only and downloads a table as CSV", async () => {
    vi.mocked(getReport).mockResolvedValue(report);
    wrap(<Reports />);
    expect(await screen.findByText("Tăng huyết áp vô căn")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: /Tải CSV/ })[1]);
    await waitFor(() => expect(vi.mocked(downloadReportCsv)).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "diagnoses"));
  });
  it("refuses roles without the report permission", async () => {
    wrap(<Reports />, ["read"]);
    expect(await screen.findByText(/Chỉ quản lý trạm xem được báo cáo/)).toBeTruthy();
    expect(vi.mocked(getReport)).not.toHaveBeenCalled();
  });
});

describe("stations", () => {
  it("adds a working point", async () => {
    vi.mocked(addStation).mockResolvedValue([{ id: "main", name: "Trạm test" }, { id: "st-2", name: "Điểm khám thôn" }]);
    const setStations = vi.fn();
    wrap(<Stations />, ALL, { setStations });
    await userEvent.type(screen.getByLabelText(/Tên điểm khám/), "Điểm khám thôn");
    await userEvent.click(screen.getByRole("button", { name: "Thêm điểm khám" }));
    await waitFor(() => expect(setStations).toHaveBeenCalledWith([{ id: "main", name: "Trạm test" }, { id: "st-2", name: "Điểm khám thôn" }]));
  });
  it("is for managers only", () => {
    wrap(<Stations />, ["read", "queue"]);
    expect(screen.getByText(/Chỉ quản lý trạm xem được trang này/)).toBeTruthy();
  });
});

describe("self service", () => {
  it("gives a ticket number and nothing else", async () => {
    vi.mocked(publicInfo).mockResolvedValue({ facility: "Trạm Y tế thử nghiệm", today: "2026-11-11", stations: [] });
    vi.mocked(takeTicket).mockResolvedValue({ ticket: "007", state: "waiting", ahead: 3, station: "main", already: false });
    render(<SelfService />);
    await userEvent.type(screen.getByLabelText(/Họ và tên/), "Nguyễn Văn An");
    await userEvent.type(screen.getByLabelText(/Năm sinh/), "1968");
    await userEvent.click(screen.getByRole("button", { name: "Lấy số" }));
    expect(await screen.findByLabelText("Số 007")).toBeTruthy();
    expect(screen.getByText("Còn 3 người trước bạn.")).toBeTruthy();
    expect(vi.mocked(takeTicket)).toHaveBeenCalledWith({ patientName: "Nguyễn Văn An", birthYear: "1968", reason: undefined, stationId: "main" });
  });
  it("sends a person without a record to the front desk", async () => {
    vi.mocked(publicInfo).mockResolvedValue({ facility: "Trạm", today: "2026-11-11", stations: [] });
    vi.mocked(takeTicket).mockRejectedValue(new ApiError(404, "not found", { error: "record-not-found" }));
    render(<SelfService />);
    await userEvent.type(screen.getByLabelText(/Họ và tên/), "Không Có Ai");
    await userEvent.type(screen.getByLabelText(/Năm sinh/), "1990");
    await userEvent.click(screen.getByRole("button", { name: "Lấy số" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/quầy tiếp đón/);
  });
});

describe("waiting-room board", () => {
  it("shows ticket numbers for those called and those waiting", async () => {
    vi.mocked(publicBoard).mockResolvedValue({ today: "2026-11-11", station: "Trạm test", calling: ["004"], waiting: [{ ticket: "005", priority: "urgent" }, { ticket: "006", priority: "normal" }], waitingCount: 2 });
    render(<Board />);
    expect(await screen.findByText("004")).toBeTruthy();
    expect(screen.getByText("005")).toBeTruthy();
    expect(screen.getByText("ưu tiên")).toBeTruthy();
  });
});

describe("referral progress", () => {
  const base = { referralId: "CT-1", issuedAt: "2026-11-01T08:00:00Z", toFacility: "BV", urgency: "urgent" as const, reason: "Đau ngực" };
  it("says whether the hospital has read the referral through Junctura", () => {
    wrap(<ReferralProgress referral={{ ...base, status: "issued" }} />);
    expect(screen.getByText("Bệnh viện chưa xem qua Junctura")).toBeTruthy();
    cleanup();
    wrap(<ReferralProgress referral={{ ...base, status: "received", viewCount: 2, viewedAt: "2026-11-02T03:00:00Z" }} />);
    expect(screen.getByText(/đã xem qua Junctura 2 lần/)).toBeTruthy();
    expect(screen.getByText("Bệnh viện đã tiếp nhận")).toBeTruthy();
  });
});
