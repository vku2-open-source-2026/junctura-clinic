// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPatient, listPatients } from "./api";
import { Patients } from "./Patients";
import { PatientRecordPage } from "./Record";
import { SessionProvider } from "./session";
import type { PatientRecord, PatientSummary } from "./types";

const base: PatientRecord = { patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1980, sex: "male", ward: "Hòa Khánh Bắc", allergyState: "not-recorded", allergies: [], chronicConditions: [], currentMedications: [], encounters: [], vaccinations: [], vaccinesDue: [], referrals: [] };
const summaries: PatientSummary[] = [
  { patientId: "P0001", patientName: "Nguyễn Văn An", birthYear: 1980, sex: "male", ward: "A", allergyState: "not-recorded", allergyCount: 0, severeAllergy: false, lastVisit: null },
  { patientId: "P0002", patientName: "Trần Thị Bình", birthYear: 1975, sex: "female", ward: "B", allergyState: "recorded", allergyCount: 1, severeAllergy: true, lastVisit: null },
];

vi.mock("./api", async importOriginal => ({ ...(await importOriginal<typeof import("./api")>()), getPatient: vi.fn(), listPatients: vi.fn() }));
const mocked = { getPatient: vi.mocked(getPatient), listPatients: vi.mocked(listPatients) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Trạm test", expire: () => {} };
const wrap = (node: React.ReactNode) => render(<SessionProvider value={session}>{node}</SessionProvider>);

afterEach(() => { vi.clearAllMocks(); });

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
