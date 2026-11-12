// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { ToastProvider } from "@junctura/health-ui";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addEncounter, createPatient, enqueue, getAudit, getJunctureCalls, getPatient, getQueue, listPatients } from "./api";
import { Patients } from "./Patients";
import { PatientRecordPage } from "./Record";
import { Audit } from "./Audit";
import { JunctureCalls } from "./JunctureCalls";
import { Reception } from "./Reception";
import { SessionProvider, type SessionValue } from "./session";
import { Settings } from "./Settings";
import type { PatientRecord, PatientSummary } from "./types";

const base: PatientRecord = { patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1980, sex: "male", ward: "Hòa Khánh Bắc", allergyState: "not-recorded", allergies: [], chronicConditions: [], currentMedications: [], encounters: [], vaccinations: [], vaccinesDue: [], referrals: [] };
const summaries: PatientSummary[] = [
  { patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1980, sex: "male", ward: "A", allergyState: "not-recorded", allergyCount: 0, severeAllergy: false, lastVisit: null },
  { patientId: "P0002", patientName: "Trần Thị Bình", birthYear: 1975, sex: "female", ward: "B", allergyState: "recorded", allergyCount: 1, severeAllergy: true, lastVisit: null },
];

vi.mock("./api", async importOriginal => ({ ...(await importOriginal<typeof import("./api")>()), getPatient: vi.fn(), listPatients: vi.fn(), getQueue: vi.fn(), getAudit: vi.fn(), getJunctureCalls: vi.fn(), addEncounter: vi.fn(), createPatient: vi.fn(), enqueue: vi.fn() }));
const mocked = { getPatient: vi.mocked(getPatient), listPatients: vi.mocked(listPatients), getQueue: vi.mocked(getQueue), getAudit: vi.mocked(getAudit), getJunctureCalls: vi.mocked(getJunctureCalls), addEncounter: vi.mocked(addEncounter), createPatient: vi.mocked(createPatient), enqueue: vi.mocked(enqueue) };
const ALL = ["read", "register", "queue", "exam", "vaccinate", "refer", "audit.read", "report", "settings.write"] as const;
const sessionFor = (permissions: readonly (typeof ALL)[number][]): SessionValue => ({
  settings: { issuer: "https://id.test", clientId: "c" }, facility: "Trạm test", expire: () => {}, setCrumbs: () => {},
  me: { username: "u", displayName: "Nhân viên", role: "clinic-staff", permissions: [...permissions] }, can: permission => permissions.includes(permission),
  station: { aiSummary: false, aiModel: false, aiConfigured: false }, setStation: () => {},
  stations: [{ id: "main", name: "Trạm test" }], stationId: "main", setStations: () => {}, setStationId: () => {},
});
const wrap = (node: React.ReactNode, permissions: readonly (typeof ALL)[number][] = ALL) => render(<ToastProvider><SessionProvider value={sessionFor(permissions)}>{node}</SessionProvider></ToastProvider>);

// jsdom does not implement <dialog> modal methods.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("record page", () => {
  it("says allergies are not recorded instead of none", async () => {
    mocked.getPatient.mockResolvedValue(base);
    wrap(<PatientRecordPage patientId="P0001" tab="summary" />);
    expect((await screen.findAllByText(/Chưa ghi nhận dị ứng/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Không (có )?dị ứng$/i)).toBeNull();
  });
  it("shows recorded allergies as critical when severe", async () => {
    mocked.getPatient.mockResolvedValue({ ...base, allergyState: "recorded", allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Phát ban" }] });
    wrap(<PatientRecordPage patientId="P0001" tab="summary" />);
    expect(await screen.findByText("Có dị ứng nặng")).toBeTruthy();
    expect(screen.getAllByText(/Penicillin/).length).toBeGreaterThan(0);
  });
});

describe("patients page", () => {
  it("filters to people with recorded allergies", async () => {
    mocked.listPatients.mockResolvedValue(summaries);
    wrap(<Patients search="" />);
    await screen.findByText("Trần Thị Bình");
    expect(screen.getByText("2 / 2 người bệnh")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: /Có dị ứng/ }));
    await waitFor(() => expect(screen.getByText("1 / 2 người bệnh")).toBeTruthy());
  });
});

describe("working the record", () => {
  it("offers exam, vaccination and referral only to roles that may write", async () => {
    mocked.getPatient.mockResolvedValue(base);
    wrap(<PatientRecordPage patientId="P0001" tab="summary" />, ["read"]);
    await screen.findByText("Nguyễn Văn An");
    expect(screen.queryByRole("button", { name: "Ghi lượt khám" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ghi mũi tiêm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lập phiếu chuyển tuyến" })).toBeNull();
  });
  it("shows a Vietnamese message and keeps the form open when the server rejects an exam", async () => {
    mocked.getPatient.mockResolvedValue(base);
    const { ApiError } = await import("./api");
    mocked.addEncounter.mockRejectedValue(new ApiError(422, "bad", { error: "invalid", fields: { reason: "Hãy nhập lý do khám." } }));
    wrap(<PatientRecordPage patientId="P0001" tab="summary" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ghi lượt khám" }));
    await userEvent.click(await screen.findByRole("button", { name: /Lưu lượt khám/ }));
    expect(await screen.findByText("Hãy nhập lý do khám.")).toBeTruthy();
    expect(document.querySelector("dialog[open]")).not.toBeNull();
  });
});

describe("reception, audit and settings", () => {
  it("lists the queue in order with a call button", async () => {
    mocked.getQueue.mockResolvedValue([{ id: 1, ticket: "001", patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1980, sex: "male", reason: "Sốt", priority: "normal", state: "waiting", since: "2026-11-11T01:00:00Z", calledAt: null, doneAt: null, severeAllergy: false, allergyState: "not-recorded", group: null, station: "main" }]);
    wrap(<Reception />);
    expect(await screen.findByText("Nguyễn Văn An")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gọi khám/ })).toBeTruthy();
  });
  it("gives a new patient a ticket in the same step", async () => {
    mocked.getQueue.mockResolvedValue([]);
    mocked.createPatient.mockResolvedValue({ ...base, patientId: "P0009", patientName: "Lê Mới" });
    mocked.enqueue.mockResolvedValue({ id: 5, ticket: "003" } as never);
    wrap(<Reception />);
    await userEvent.click(await screen.findByRole("button", { name: /Người mới đến, lấy số/ }));
    await userEvent.type(await screen.findByLabelText(/Họ và tên/), "Lê Mới");
    await userEvent.type(screen.getByLabelText(/Năm sinh/), "1990");
    await userEvent.selectOptions(screen.getByLabelText(/Giới tính/), "male");
    await userEvent.type(screen.getByLabelText(/Xã\/phường/), "Hòa Khánh");
    await userEvent.type(within(document.querySelector("dialog")!).getByLabelText(/Lý do đến khám/), "Sốt");
    await userEvent.click(screen.getByRole("button", { name: "Thêm và lấy số" }));
    await waitFor(() => expect(mocked.enqueue).toHaveBeenCalledWith(expect.anything(), { patientId: "P0009", reason: "Sốt", priority: "normal", stationId: "main" }));
  });
  it("refuses the audit page without audit.read", async () => {
    wrap(<Audit />, ["read"]);
    expect(await screen.findByText(/Chỉ quản lý trạm xem được nhật ký/)).toBeTruthy();
    expect(mocked.getAudit).not.toHaveBeenCalled();
  });
  it("lists audit rows with readable action names", async () => {
    mocked.getAudit.mockResolvedValue([{ id: 1, at: "2026-11-11T02:00:00Z", username: "u", displayName: "Nhân viên", action: "encounter.create", patientId: "P0001", patientName: "Nguyễn Văn An", detail: "Sốt" }]);
    wrap(<Audit />);
    expect(await screen.findByText("Nguyễn Văn An")).toBeTruthy();
    expect(screen.queryByText("encounter.create")).toBeNull();
  });
  it("lists Junctura calls with readable purpose, result and an emergency mark", async () => {
    mocked.getJunctureCalls.mockResolvedValue([
      { id: 2, at: "2026-11-11T02:05:00Z", capability: "allergy-list", purpose: "treatment", emergency: true, outcome: "answered", patientId: "P0001", patientName: "Nguyễn Văn An" },
      { id: 1, at: "2026-11-11T02:00:00Z", capability: "vaccination-history", purpose: "claim_review", emergency: false, outcome: "refused:purpose_not_allowed" },
    ]);
    wrap(<JunctureCalls />);
    expect(await screen.findByText("Danh sách dị ứng")).toBeTruthy();
    expect(screen.getByText("Cấp cứu")).toBeTruthy();
    expect(screen.getByText("Đã trả lời")).toBeTruthy();
    expect(screen.getByText("Từ chối: Sai mục đích")).toBeTruthy();
    expect(screen.queryByText("allergy-list")).toBeNull();
  });
  it("refuses the Junctura log without audit.read", async () => {
    wrap(<JunctureCalls />, ["read"]);
    expect(await screen.findByText(/Chỉ quản lý trạm xem được nhật ký Junctura/)).toBeTruthy();
    expect(mocked.getJunctureCalls).not.toHaveBeenCalled();
  });
  it("locks the AI summary switch for roles without settings.write", () => {
    wrap(<Settings />, ["read"]);
    for (const box of screen.getAllByRole("checkbox")) expect((box as HTMLInputElement).disabled).toBe(true);
  });
});
