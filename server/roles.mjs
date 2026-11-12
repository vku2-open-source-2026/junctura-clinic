// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// What each station role may do. A role that is not listed here gets no access at all, so a new
// role added to the identity provider cannot reach patient data by accident.
const ALL = ["read", "register", "queue", "exam", "vaccinate", "refer", "audit.read", "report", "settings.write"];

export const ROLES = Object.freeze({
  // The demo account (ysi.tramyte) is the only station account, so it holds every permission.
  "clinic-staff": ALL,
  "clinic-manager": ALL,
  // Front desk: finds and registers people and manages the queue, but writes nothing clinical.
  "clinic-reception": ["read", "register", "queue"],
});

export const can = (role, permission) => (ROLES[role] ?? []).includes(permission);
export const knownRole = role => Object.hasOwn(ROLES, role);
