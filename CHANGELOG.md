<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to Junctura Clinic are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- **Web UI aligned with the Junctura Console** (`@junctura/health-ui` 0.3.0): floating side bar, top bar with
  breadcrumbs (the open patient's name is the last level) and a demo-data pill, stat cards with icons and hints
  on the Today screen, `rounded-lg` everywhere.
- Public page: a full landing page (benefits, how it works, who it is for, trust, questions, call to action).
  "Đăng nhập" goes straight to the Junctura sign-in page (no extra step); a Console-style notice page appears
  only when a sign-in fails or a session expires. Credentials are still entered only on the Junctura page.

### Added

- **Clinic provides its four capabilities through Junctura**: `pre-visit-summary`, `allergy-list`,
  `vaccination-history` and `referral-summary` (`POST /capabilities/<slug>`, HTTPS). Each call redeems the
  one-use ticket (`@junctura/server-client`), checks purpose and emergency rules and the person named by the
  ticket, and answers exactly `{ output }` shaped by `@junctura/health-contracts` 1.1.0. Empty allergy lists are
  reported as `not-recorded` unless staff confirmed "no known allergies" (`none-known`). Every call is written
  to the audit log with its purpose, never with medical content. Enabled by `PROVIDER_TLS_CERT`/`PROVIDER_TLS_KEY`
  plus the demo credentials; without them the app runs as before.
- First runtime dependencies: `@junctura/server-client` and `@junctura/health-contracts`, locked in
  `package-lock.json` (`npm ci`).
- **Clinic is now a working station** (Issue #5): data is saved in SQLite (`node:sqlite`, no new dependency;
  `CLINIC_DB`), seeded once; reception queue (new patient with duplicate warning, daily ticket numbers, call,
  cancel); exam records (vitals, diagnosis, prescriptions, advice) with an allergy-conflict guard that needs a
  reason to override; allergy, chronic condition and medication editing ("not recorded" is never shown as
  "none"); vaccination recording with automatic dose number; referral creation with a printable slip; an audit
  log (who, when, what, which record) and its page; settings (AI summary off by default, rule-based
  summary, no model); role permissions (reception cannot write exams); Vietnamese validation errors; server
  and UI tests.
- **Clinic web rebuilt on `@junctura/health-ui`**: landing page, app shell with quick patient
  search (`/` or Ctrl+K), a **Today** screen (counts, things to act on, recent visits and
  referrals), a filterable patient list (allergy, elderly, young children), a patient record
  with tabs (overview, medications, vaccinations, referrals, history) and the allergy banner
  always on top, plus Vaccinations and Referrals lists. Light and dark themes, text size,
  phone layout.
- **Read APIs** `GET /api/overview`, `/api/vaccinations`, `/api/referrals`. Vaccinations due
  follow a small demo schedule (not clinical guidance).
- **Allergy rule**: an empty allergy list is shown as "not recorded", never as "no allergies".

- **Clinic server and web UI**: Junctura sign-in (OpenID Connect with PKCE, RS256 token
  verification against the issuer's keys, clinic staff only), patient list with
  diacritic-insensitive search and patient record (allergies with severe-allergy alert,
  chronic conditions, medications, encounters, vaccinations, referrals). Reads the
  synthetic dataset from a junctura-health checkout and moves its dates to today. The
  server has no runtime dependencies; the UI uses React 19, Vite and Tailwind CSS, installed
  from `web/package-lock.json`.

- **Repository foundation**: Apache-2.0 license with SPDX headers and REUSE metadata,
  NOTICE, hygiene checks (`npm run check`, `npm run check:reuse`), CI, issue and
  pull request templates, contribution guide.
