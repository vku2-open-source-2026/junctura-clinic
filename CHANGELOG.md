<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to Junctura Clinic are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

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
