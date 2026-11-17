import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API, API_TIMEOUT, authenticatedApi } from "./apiClient";
import App from "./App";
import PlansDialog from "./PlansDialog";

const TOKEN_KEY = "docmind-account-token";
const freeHostingNotice = "Free hosting uses temporary storage. A server restart clears accounts, saved chats, and uploaded documents.";
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
const field = "w-full rounded-lg border border-white/20 bg-black/30 p-3 text-white";

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
    if (!window.confirm(`Confirm ₹600 payment was received from ${user.email} before activating Pro.`)) return;
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
            <tbody>{data.users.map((user) => <tr className="border-t border-white/10" key={user.email}>
              <td className="p-2">{user.email}</td><td className="p-2">{user.is_admin ? "Admin" : "User"}</td>
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
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [workspace, setWorkspace] = useState(null);
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const api = useMemo(() => token ? authenticatedApi(token) : null, [token]);

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function load() {
      try {
        const { data: profile } = await api.get("/auth/me", options);
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
        setToken(null);
      }
    }
    load();
    return () => controller.abort();
  }, [api]);

  async function enter(endpoint, body) {
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(`${API}${endpoint}`, body, { timeout: API_TIMEOUT });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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
      setToken(null);
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
    <main className="grid min-h-screen place-items-center bg-[#0b0a0d] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6">
        <h1 className="mb-4 text-3xl font-bold">DocMind</h1>
        <p className="mb-4 rounded-lg border border-white/15 p-3 text-sm text-white/80">{freeHostingNotice}</p>
        {token ? <p>Opening your workspace…</p> : <>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            enter(`/auth/${mode}`, { email: data.get("email"), password: data.get("password") });
          }}>
            <label className="block">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className={field} /></label>
            <label className="block">Password<input key={mode} name="password" type="password" required minLength={12} maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"} className={field} /></label>
            {mode === "register" && <p className="text-sm text-white/70">Use at least 12 characters.</p>}
            <button className={button} disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={button} disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Back to sign in"}
            </button>
            <button className={button} disabled={busy} onClick={() => enter("/sessions")}>Try as guest</button>
            <button className={button} onClick={() => setShowPlans(true)}>View plans</button>
          </div>
          <p className="mt-4 text-sm text-white/70">Guests can ask five questions about the sample library guide. Sign in to upload PDFs and save chats privately.</p>
        </>}
        {error && <p className="mt-3 text-rose-300" role="alert">{error}</p>}
      </section>
      {plansDialog}
    </main>
  );
}
