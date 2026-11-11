// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getConfig, getMe } from "./api";
import { buildLogoutUrl, clearSession, completeLogin, loadSession, startLogin } from "./auth";
import { PatientList } from "./PatientList";
import { PatientPage } from "./PatientPage";
import { Link, usePath } from "./router";
import type { Me, PublicConfig } from "./types";
import { Notice } from "./ui";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "forbidden"; user?: string }
  | { kind: "ready"; me: Me }
  | { kind: "error" };

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const path = usePath();
  const settings = useMemo(() => (config ? { issuer: config.issuer, clientId: config.clientId } : null), [config]);

  const expire = useCallback(() => { clearSession(); setState({ kind: "signed-out", message: "Phiên đăng nhập đã hết hạn." }); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getConfig();
        if (cancelled) return;
        setConfig(loaded);
        const oidc = { issuer: loaded.issuer, clientId: loaded.clientId };
        let signedIn = loadSession() !== null;
        if (location.search.includes("code=") || location.search.includes("error=")) {
          try {
            signedIn = (await completeLogin(oidc, location.search)) !== null;
          } catch {
            history.replaceState(null, "", "/");
            return setState({ kind: "signed-out", message: "Đăng nhập không thành công. Hãy thử lại." });
          }
          history.replaceState(null, "", "/");
        }
        if (!signedIn) return setState({ kind: "signed-out" });
        setState({ kind: "ready", me: await getMe(oidc) });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) setState({ kind: "forbidden" });
        else if (error instanceof ApiError && error.status === 401) { clearSession(); setState({ kind: "signed-out" }); }
        else setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signOut = () => {
    if (!settings) return;
    const idToken = loadSession()?.idToken;
    clearSession();
    location.assign(buildLogoutUrl(settings, `${location.origin}/`, idToken));
  };

  const patientId = /^\/patients\/([^/]+)$/.exec(path)?.[1];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">+</span>
            <span>
              <span className="block text-sm font-semibold leading-tight">Junctura Clinic</span>
              <span className="block text-xs leading-tight text-slate-500">{config?.facility ?? ""}</span>
            </span>
          </Link>
          {state.kind === "ready" && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-600 sm:inline">{state.me.displayName}</span>
              <button onClick={signOut} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Đăng xuất</button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {state.kind === "loading" && <Notice tone="info">Đang tải…</Notice>}
        {state.kind === "error" && <Notice tone="error">Không kết nối được máy chủ Clinic hoặc Junctura. Thử lại sau.</Notice>}
        {state.kind === "forbidden" && (
          <div className="space-y-4">
            <Notice tone="error">Tài khoản này không thuộc nhân viên trạm y tế nên không xem được hồ sơ.</Notice>
            <button onClick={signOut} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Đăng xuất</button>
          </div>
        )}
        {state.kind === "signed-out" && settings && (
          <div className="mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold">Đăng nhập nhân viên trạm y tế</h1>
            <p className="text-sm text-slate-500">Dùng tài khoản Junctura của bạn để xem hồ sơ người bệnh.</p>
            {state.message && <Notice tone="error">{state.message}</Notice>}
            <button onClick={() => startLogin(settings)} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700">Đăng nhập với Junctura</button>
          </div>
        )}
        {state.kind === "ready" && settings && (patientId
          ? <PatientPage settings={settings} patientId={decodeURIComponent(patientId)} onExpired={expire} />
          : <PatientList settings={settings} onExpired={expire} />)}
      </main>
    </div>
  );
}
