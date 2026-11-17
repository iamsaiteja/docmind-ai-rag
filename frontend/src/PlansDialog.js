import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API } from "./apiClient";

const action = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";

export default function PlansDialog({ api, close, signIn }) {
  const dialog = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([axios.get(`${API}/plans`, options), api?.get("/auth/me", options)])
      .then(([response, account]) => {
        setCatalog(response.data);
        setPlan(account?.data.plan || null);
      })
      .catch((err) => { if (!axios.isCancel(err)) setError("Could not load plans. Please reopen this screen."); });
    return () => controller.abort();
  }, [api]);

  async function requestUpgrade() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/account/upgrade-request");
      setPlan(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not request the upgrade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} onCancel={close} aria-labelledby="docmind-plans-title"
      className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-white/20 bg-[#151318] p-5 text-white backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-3">
        <h2 id="docmind-plans-title" className="text-xl font-bold">DocMind plans</h2>
        <button className={action} onClick={close}>Close</button>
      </div>
      {catalog && <>
        <div className="my-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(catalog.plans).map(([key, tier]) => (
            <section key={key} className="rounded-xl border border-white/15 p-4">
              <h3 className="font-semibold">{tier.name}{plan?.tier === key && " · Current plan"}</h3>
              <p className="mt-1 text-lg">₹{tier.price_inr}{tier.price_inr > 0 && ` for ${catalog.billing_days} days`}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/80">
                <li>{tier.questions} questions per day</li>
                <li>{tier.pdfs} PDFs per day</li>
                <li>{tier.files_per_upload} PDF{tier.files_per_upload > 1 && "s"} per upload</li>
                <li>{tier.chunks.toLocaleString()} indexed text chunks</li>
                <li>Private PDFs and saved chats</li>
              </ul>
            </section>
          ))}
        </div>
        {plan?.tier === "pro" ? <p>Pro is active until {new Date(plan.paid_until * 1000).toLocaleDateString()}.</p>
          : plan?.requested_at ? <p role="status">Upgrade requested. The DocMind admin will activate Pro after confirming payment.</p>
          : plan ? <>
            <p className="mb-2 text-sm text-white/70">The DocMind admin confirms payment and activates Pro manually.</p>
            <button className={action} disabled={busy} onClick={requestUpgrade}>{busy ? "Requesting…" : "Request Pro upgrade"}</button>
          </> : <button className={action} onClick={signIn}>Sign in to request Pro</button>}
      </>}
      {!catalog && !error && <p className="my-3">Loading plans…</p>}
      {error && <p className="my-3 text-rose-300" role="alert">{error}</p>}
    </dialog>
  );
}
