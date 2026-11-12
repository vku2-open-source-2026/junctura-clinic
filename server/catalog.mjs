// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fold } from "./data.mjs";

/**
 * Short demo catalogs (common ICD-10 codes and common medicines at a commune health station).
 * They only suggest entries: staff can still type anything, and the allergy guard works on the
 * medicine name whichever way it was entered. Not a drug reference.
 */
const load = name => JSON.parse(readFileSync(new URL(`./catalog/${name}.json`, import.meta.url), "utf8"));
const CATALOGS = Object.freeze({
  icd10: load("icd10").map(item => ({ ...item, key: fold(`${item.code} ${item.name}`) })),
  medicines: load("medicines").map(item => ({ ...item, key: fold(`${item.name} ${item.group}`) })),
});

export const catalogKinds = Object.freeze(Object.keys(CATALOGS));

/** Entries whose code, name or group contains every word of the query; names that start with it come first. */
export function searchCatalog(kind, query = "", limit = 8) {
  const entries = CATALOGS[kind];
  if (!entries) return null;
  const words = fold(String(query).trim()).split(/\s+/).filter(Boolean);
  const max = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const hits = entries.filter(item => words.every(word => item.key.includes(word)));
  const first = fold(String(query).trim());
  const head = item => Number(item.key.startsWith(first));
  hits.sort((a, b) => head(b) - head(a) || (a.name ?? a.code).length - (b.name ?? b.code).length || a.key.localeCompare(b.key));
  return hits.slice(0, words.length ? max : 0).map(({ key, ...item }) => item);
}
