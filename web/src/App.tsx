// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Badge, Button, ErrorState, PermissionState, SignInPage, Skeleton, type NavGroup } from "@junctura/health-ui";
import { CalendarDays, FileOutput, Syringe, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getConfig, getMe, listPatients } from "./api";
import { buildLogoutUrl, clearSession, completeLogin, loadSession, startLogin } from "./auth";
import { tabFromPath } from "./domain";
import { ageOf, sexLabel } from "./format";
import { Landing } from "./Landing";
import { Referrals, Vaccinations } from "./Lists";
import { Patients } from "./Patients";
import { PatientRecordPage } from "./Record";
import { navigate, useLocation } from "./router";
import { NotFound, SessionProvider } from "./session";
import { Today } from "./Today";
import type { Me, PublicConfig } from "./types";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "forbidden" }
  | { kind: "ready"; me: Me }
  | { kind: "error" };

const NAV: NavGroup[] = [
  { label: "Hôm nay", items: [{ id: "/", label: "Hôm nay", icon: <CalendarDays aria-hidden className="size-4" /> }] },
  { label: "Người bệnh", items: [
    { id: "/patients", label: "Bệnh nhân", icon: <Users aria-hidden className="size-4" /> },
    { id: "/vaccinations", label: "Tiêm chủng", icon: <Syringe aria-hidden className="size-4" /> },
    { id: "/referrals", label: "Chuyển tuyến", icon: <FileOutput aria-hidden className="size-4" /> },
  ] },
];

const currentNav = (path: string) => (path === "/" ? "/" : NAV.flatMap(group => group.items).find(item => item.id !== "/" && path.startsWith(item.id))?.id ?? "");

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const { path, search } = useLocation();
  const [crumbs, setCrumbs] = useState<string[]>([]);
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

  if (state.kind === "loading") return <div className="mx-auto max-w-3xl p-8"><Skeleton lines={4} /></div>;
  if (state.kind === "error") return <div className="mx-auto max-w-xl p-8"><ErrorState onRetry={() => location.reload()}>Không kết nối được máy chủ Clinic hoặc Junctura. Thử lại sau.</ErrorState></div>;
  if (state.kind === "forbidden") {
    return <div className="mx-auto max-w-xl space-y-4 p-8"><PermissionState>Tài khoản này không thuộc nhân viên trạm y tế nên không xem được hồ sơ.</PermissionState><Button variant="secondary" onClick={signOut}>Đăng xuất</Button></div>;
  }
  if (state.kind === "signed-out") {
    const signIn = () => settings && startLogin(settings);
    if (state.message) {
      return <SignInPage product="Clinic" subtitle="Đăng nhập bằng tài khoản Junctura của trạm y tế." onSignIn={signIn} onBack={() => navigate("/")} message={state.message}
        note={config ? `${config.facility}. Mật khẩu chỉ nhập trên trang của Junctura.` : undefined} />;
    }
    return <Landing facility={config?.facility} onSignIn={signIn} />;
  }

  const me = state.me;
  const tabsPath = /^\/patients\/([^/]+)(?:\/([^/]+))?\/?$/.exec(path);
  let page;
  if (path === "/") page = <Today />;
  else if (path === "/patients") page = <Patients search={search} />;
  else if (tabsPath) page = <PatientRecordPage patientId={decodeURIComponent(tabsPath[1])} tab={tabFromPath(tabsPath[2])} />;
  else if (path === "/vaccinations") page = <Vaccinations />;
  else if (path === "/referrals") page = <Referrals />;
  else page = <NotFound />;

  return (
    <SessionProvider value={{ settings: settings!, facility: config!.facility, expire, setCrumbs }}>
      <AppShell product="Clinic" nav={NAV} current={currentNav(path)} onNavigate={navigate} breadcrumbs={crumbs}
        status={<Badge tone="neutral">Bản demo · dữ liệu giả lập</Badge>}
        unit={{ name: "Junctura Clinic", stations: [{ id: "main", name: config!.facility }] }}
        user={{ name: me.displayName, role: me.role }} onSignOut={signOut}
        search={{ placeholder: "Tìm theo họ tên hoặc mã hồ sơ", onSearch: async query => {
          if (query.trim().length < 2) return [];
          const rows = await listPatients(settings!, query);
          return rows.slice(0, 8).map(row => ({ id: row.patientId, title: row.patientName, subtitle: `${row.patientId} · ${ageOf(row.birthYear)} tuổi · ${sexLabel(row.sex)}` }));
        }, onSelect: result => navigate(`/patients/${encodeURIComponent(result.id)}`) }}>
        {page}
      </AppShell>
    </SessionProvider>
  );
}
