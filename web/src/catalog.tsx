// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { TextField } from "@junctura/health-ui";
import { useEffect, useId, useState } from "react";
import { searchCatalog } from "./api";
import { useSession } from "./session";
import type { CatalogItem } from "./types";

/** Suggestions from the station's short ICD-10 or medicine list while typing; typing anything else is still allowed. */
export function useCatalog(kind: "icd10" | "medicines", query: string): CatalogItem[] {
  const { settings } = useSession();
  const [items, setItems] = useState<CatalogItem[]>([]);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setItems([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchCatalog(settings, kind, text).then(found => { if (!cancelled) setItems(found); }, () => { if (!cancelled) setItems([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, query, settings]);
  return items;
}

/** Diagnosis name with ICD-10 suggestions; choosing a suggestion also fills the code. The code can still be typed by hand. */
export function DiagnosisInputs({ code, name, onChange, error, nameLabel = "Chẩn đoán" }: { code: string; name: string; onChange: (value: { code: string; name: string }) => void; error?: string; nameLabel?: string }) {
  const listId = useId();
  const items = useCatalog("icd10", name);
  return (
    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
      <TextField label="Mã bệnh" hint="ICD-10" value={code} onChange={event => onChange({ code: event.target.value, name })} />
      <TextField label={nameLabel} hint="Gõ tên hoặc mã để chọn từ danh mục" value={name} list={listId} autoComplete="off" error={error}
        onChange={event => { const picked = items.find(item => item.name === event.target.value); onChange({ code: picked?.code ?? code, name: event.target.value }); }} />
      <datalist id={listId}>{items.map(item => <option key={item.code} value={item.name}>{item.code}</option>)}</datalist>
    </div>
  );
}

/** Medicine name with suggestions; choosing one proposes its usual dose when the dose is still empty. */
export function MedicineInput({ label = "Tên thuốc", value, dose, onChange, error }: { label?: string; value: string; dose: string; onChange: (value: { name: string; dose: string }) => void; error?: string }) {
  const listId = useId();
  const items = useCatalog("medicines", value);
  return (
    <>
      <TextField label={label} value={value} list={listId} autoComplete="off" error={error}
        onChange={event => { const picked = items.find(item => item.name === event.target.value); onChange({ name: event.target.value, dose: dose || picked?.dose || "" }); }} />
      <datalist id={listId}>{items.map(item => <option key={item.name} value={item.name}>{item.group}</option>)}</datalist>
    </>
  );
}
