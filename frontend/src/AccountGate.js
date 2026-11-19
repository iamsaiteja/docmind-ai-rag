import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API, API_TIMEOUT, authenticatedApi } from "./apiClient";
import App from "./App";
import PlansDialog from "./PlansDialog";

const TOKEN_KEY = "docmind-account-token";
const freeHostingNotice = "Free hosting uses temporary storage. A server restart clears accounts, saved chats, and uploaded documents.";
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
const field = "mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const action = "min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-65";
const FirebaseSignIn = lazy(() => import("./FirebaseSignIn"));
const firebaseConfigured = Boolean(process.env.REACT_APP_FIREBASE_API_KEY &&
  process.env.REACT_APP_FIREBASE_AUTH_DOMAIN && process.env.REACT_APP_FIREBASE_PROJECT_ID &&
  process.env.REACT_APP_FIREBASE_APP_ID);

function accountLabel(user) {
  return user.email || `Phone account (${user.id.slice(0, 8)})`;
}

export function errorMessage(error) {
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) return "DocMind took too long to respond. Please try again.";
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : "Request failed. Check your details or try again.";
}

function AdminUsers({ api, close }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [activating, setActivating] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.get("/admin/users", { params: { offset }, signal: controller.signal })
      .then(({ data }) => setData(data))
      .catch((err) => { if (!axios.isCancel(err)) setError(errorMessage(err)); });
    return () => controller.abort();
  }, [api, offset, refresh]);

  async function activate(user) {
    if (!window.confirm(`Confirm ₹600 payment was received from ${accountLabel(user)} before activating Pro.`)) return;
    setActivating(user.id);
    setError("");
    try {
      await api.post(`/admin/users/${user.id}/activate-pro`);
      setOffset(0);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActivating(null);
    }
  }

  const date = (timestamp) => timestamp ? new Date(timestamp * 1000).toLocaleString() : "Never";
  return (
    <main className="min-h-screen bg-[#0b0a0d] p-6 text-white">
      <button className={button} onClick={close}>Back to DocMind</button>
      <h1 className="my-4 text-2xl font-bold">DocMind users</h1>
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p className="my-4">Registered accounts: {data.registered} · Active in the last 24 hours: {data.active_24h} · Guest sessions: {data.guest_sessions}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr>{["Email", "Role", "Joined", "Last active", "Plan"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.users.map((user) => <tr className="border-t border-white/10" key={user.id}>
              <td className="p-2">{accountLabel(user)}</td><td className="p-2">{user.is_admin ? "Admin" : "User"}</td>
              <td className="p-2">{date(user.created_at)}</td><td className="p-2">{date(user.last_seen)}</td>
              <td className="p-2">{user.plan.tier === "pro" ? `Pro until ${date(user.plan.paid_until)}`
                : user.plan.requested_at ? <button className={button} disabled={!!activating} onClick={() => activate(user)}>Activate Pro</button>
                : "Free"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={button} disabled={!offset} onClick={() => setOffset(offset - 100)}>Previous</button>
          <button className={button} disabled={offset + 100 >= data.registered} onClick={() => setOffset(offset + 100)}>Next</button>
        </div>
      </>}
      {!data && !error && <p>Loading users…</p>}
    </main>
  );
}

export default function AccountGate() {
  const [session, setSession] = useState(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return token ? { token } : null;
  });
  const [workspace, setWorkspace] = useState(null);
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState("");
  const [slow, setSlow] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const token = session?.token;
  const initialProfile = session?.profile;
  const api = useMemo(() => token ? authenticatedApi(token) : null, [token]);
  const opening = Boolean(token && !workspace);
  const waiting = Boolean(pending || opening);

  useEffect(() => {
    if (sessionStorage.getItem(TOKEN_KEY)) return;
    const controller = new AbortController();
    // Wake the free backend while the visitor reads the form or enters credentials.
    fetch(`${API}/`, { signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!waiting) {
      setSlow(false);
      return;
    }
    const timeout = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timeout);
  }, [waiting]);

  useEffect(() => {
    if (!api) return;
    if (initialProfile?.role === "guest") {
      setWorkspace({ profile: initialProfile, chats: [], files: [], revision: 0 });
      return;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function load() {
      try {
        const profile = initialProfile ?? (await api.get("/auth/me", options)).data;
        if (profile.role === "guest") {
          if (!controller.signal.aborted) setWorkspace({ profile, chats: [], files: [], revision: 0 });
          return;
        }
        const [{ data: history }, { data: documents }] = await Promise.all([
          api.get("/chats", options), api.get("/documents", options),
        ]);
        if (!controller.signal.aborted) setWorkspace({ profile, ...history, files: documents.files });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err));
        sessionStorage.removeItem(TOKEN_KEY);
        setSession(null);
      }
    }
    load();
    return () => controller.abort();
  }, [api, initialProfile]);

  function startWorkspace(data) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    setSession({ token: data.token, profile: data.profile });
  }

  async function enter(endpoint, body) {
    if (pending) return;
    setPending(endpoint);
    setError("");
    try {
      const { data } = await axios.post(`${API}${endpoint}`, body, { timeout: API_TIMEOUT });
      startWorkspace(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending("");
    }
  }

  async function enterFirebase(idToken) {
    const { data } = await axios.post(`${API}/auth/firebase`, { id_token: idToken }, { timeout: API_TIMEOUT });
    startWorkspace(data);
  }

  async function leave() {
    setLeaving(true);
    setShowPlans(false);
    try {
      await api.post("/auth/logout", null, { timeout: 5000 });
    } catch (err) {
      if (err.response?.status !== 401) setError(errorMessage(err));
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      setWorkspace(null);
      setMode("login");
      setAdmin(false);
      setSession(null);
      setLeaving(false);
    }
  }

  if (workspace && admin) return <AdminUsers api={api} close={() => window.location.reload()} />;
  const plansDialog = showPlans && <PlansDialog api={api} close={() => setShowPlans(false)} signIn={() => {
    if (workspace?.profile.role === "guest") leave();
    else setShowPlans(false);
  }} />;
  if (workspace) return <>
    <App token={token} api={api} workspace={workspace} onExit={leave} leaving={leaving} onPlans={() => setShowPlans(true)}
      onAdmin={workspace.profile.role === "admin" ? () => setAdmin(true) : null} reload={() => window.location.reload()}
      storageNotice={freeHostingNotice} />
    {plansDialog}
  </>;
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4 py-8 text-ink">
      <section className="w-full max-w-md rounded-3xl border border-rose-200/80 bg-paper p-6 shadow-xl shadow-rose-900/10 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-xl font-bold text-white">D</span>
          <h1 className="text-2xl font-bold tracking-tight">DocMind by Saiteja</h1>
        </div>
        {opening ? <p role="status">Opening your workspace…</p> : <>
          <h2 className="mb-4 text-lg font-semibold">{mode === "login" ? "Sign in to DocMind" : "Create your account"}</h2>
          <form aria-busy={Boolean(pending)} className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            enter(`/auth/${mode}`, { email: data.get("email"), password: data.get("password") });
          }}>
            <label className="block text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className={field} /></label>
            <label className="block text-sm font-medium">Password<input key={mode} name="password" type="password" required minLength={12} maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"} className={field} /></label>
            {mode === "register" && <p className="text-sm text-ink/75">Use at least 12 characters.</p>}
            <button type="submit" className={`${action} w-full bg-brand text-white enabled:hover:bg-rose-800`} disabled={Boolean(pending)}>
              {mode === "login" ? (pending === "/auth/login" ? "Signing in…" : "Sign in")
                : (pending === "/auth/register" ? "Creating account…" : "Create account")}
            </button>
          </form>
          {firebaseConfigured && <Suspense fallback={null}>
            <FirebaseSignIn pending={pending} setPending={setPending} clearError={() => setError("")}
              exchange={enterFirebase} apiError={errorMessage} fieldClass={field} actionClass={action} />
          </Suspense>}
          <button type="button" className={`${action} mt-3 w-full border border-rose-300 bg-rose-50 text-rose-900 enabled:hover:bg-rose-100`}
            disabled={Boolean(pending)} onClick={() => enter("/sessions")}>
            {pending === "/sessions" ? "Starting guest session…" : "Continue as guest"}
          </button>
          <p className="mt-2 text-sm text-ink/75">Guests can ask five questions about the sample library guide. Sign in to upload PDFs and save chats privately.</p>
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-rose-100 pt-3 text-sm font-semibold text-brand">
            <button type="button" className="min-h-11 enabled:hover:underline disabled:opacity-65" disabled={Boolean(pending)} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Back to sign in"}
            </button>
            <button type="button" className="min-h-11 enabled:hover:underline disabled:opacity-65" disabled={Boolean(pending)} onClick={() => setShowPlans(true)}>View plans</button>
          </div>
        </>}
        {waiting && slow && <p className="mt-3 text-sm text-ink/75" role="status">Still waiting for DocMind. The free server can take a moment to wake up.</p>}
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-ink/75">{freeHostingNotice}</p>
      </section>
      {plansDialog}
    </main>
  );
}
