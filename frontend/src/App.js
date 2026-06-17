import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = "https://docmind-12ms.onrender.com"; // live backend (Render)

/* ---------------- markdown (no dependency) ---------------- */
function inline(text, k0 = 0) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, key = k0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={key++} className="font-semibold text-white">{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-[#c8c8ff] text-[13px]">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = []; let list = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={"u" + blocks.length} className="list-disc pl-5 space-y-1.5 my-2.5 marker:text-white/30">{list}</ul>); list = []; } };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^[*-]\s+/.test(t)) list.push(<li key={i} className="pl-1">{inline(t.replace(/^[*-]\s+/, ""), i * 100)}</li>);
    else if (t === "") flush();
    else if (/^#{1,3}\s/.test(t)) { flush(); blocks.push(<p key={i} className="font-semibold text-[15px] mt-3 mb-1.5 text-white">{inline(t.replace(/^#{1,3}\s/, ""), i * 100)}</p>); }
    else { flush(); blocks.push(<p key={i} className="mb-2.5">{inline(t, i * 100)}</p>); }
  });
  flush();
  return <div className="text-[15px] leading-7">{blocks}</div>;
}
function AssistantText({ text, animate, onTick }) {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate) { setShown(text); return; }
    let i = 0;
    const id = setInterval(() => { i += 4; setShown(text.slice(0, i)); onTick && onTick(); if (i >= text.length) { setShown(text); clearInterval(id); } }, 12);
    return () => clearInterval(id);
  }, [text, animate]); // eslint-disable-line
  const done = shown.length >= text.length;
  return done ? <Markdown text={text} /> : <div className="whitespace-pre-wrap text-[15px] leading-7">{shown}<span className="inline-block w-[2px] h-[15px] align-middle bg-indigo-400 ml-0.5 animate-pulse" /></div>;
}
function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="text-[13px] text-white/45 hover:text-white/70 transition inline-flex items-center gap-1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        {sources.length} source{sources.length > 1 ? "s" : ""}
      </button>
      {open && <div className="mt-2 space-y-1.5">{sources.map((s, i) => (
        <div key={i} className="rounded-lg bg-white/[0.03] border border-white/8 px-3 py-2 text-[13px]">
          <span className="text-indigo-300 font-medium">{s.source}</span>
          <p className="text-white/40 mt-1 leading-relaxed">{s.snippet}</p>
        </div>))}</div>}
    </div>
  );
}

export default function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attached, setAttached] = useState([]);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [model, setModel] = useState("gemini-2.5-flash-lite");
  const [chats, setChats] = useState(() => { try { return JSON.parse(localStorage.getItem("rag_chats")) || []; } catch { return []; } });
  const [chatId, setChatId] = useState(null);

  const bottomRef = useRef(null);
  const recRef = useRef(null);
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { localStorage.setItem("rag_chats", JSON.stringify(chats)); }, [chats]);
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  const saveChat = (msgs) => {
    let id = chatId;
    if (!id) { id = Date.now().toString(); setChatId(id); }
    setChats((prev) => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 40) || "New chat";
      const exists = prev.some((c) => c.id === id);
      if (exists) return prev.map((c) => (c.id === id ? { ...c, messages: msgs } : c));
      return [{ id, title, messages: msgs }, ...prev];
    });
  };
  const newChat = () => { setMessages([]); setChatId(null); setError(""); setAttached([]); };
  const loadChat = (c) => { setMessages(c.messages.map((m) => ({ ...m, animate: false }))); setChatId(c.id); setError(""); };
  const deleteChat = (id, e) => { e.stopPropagation(); setChats((p) => p.filter((c) => c.id !== id)); if (id === chatId) newChat(); };

  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files); e.target.value = "";
    if (!picked.length) return;
    setUploading(true); setError("");
    const fd = new FormData(); picked.forEach((f) => fd.append("files", f));
    try {
      const res = await axios.post(`${API}/upload-pdf`, fd);
      setAttached((prev) => [...prev, ...(res.data.files || []).map((f) => f.filename)]);
    } catch (err) { setError("Upload failed: " + (err.response?.data?.detail || err.message)); }
    finally { setUploading(false); }
  };

  const ask = async (preset) => {
    const q = (preset ?? question).trim();
    if (!q || loading) return;
    setError(""); setQuestion("");
    const base = [...messages, { role: "user", content: q, sources: [] }];
    setMessages(base); setLoading(true);
    try {
      const res = await axios.post(`${API}/ask`, { question: q, model });
      if (res.data.error) throw new Error(res.data.error);
      const final = [...base, { role: "assistant", content: res.data.answer, sources: res.data.sources || [], animate: true }];
      setMessages(final); saveChat(final);
    } catch (e) {
      let msg = e.response?.data?.detail || e.message || "Backend not reachable";
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) msg = "Rate limit reached — wait about a minute and try again.";
      setMessages([...base, { role: "assistant", content: msg, sources: [], isError: true }]);
    } finally { setLoading(false); }
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Voice not supported here (use Chrome)"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true;
    rec.onresult = (ev) => setQuestion(Array.from(ev.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  const samples = ["Summarize this document", "What are the key points?", "List the main skills mentioned"];

  return (
    <div className="flex h-screen bg-[#0d0d0f] text-[#ececee] font-sans antialiased">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-[#161618] border-r border-white/[0.06] flex flex-col p-3">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">D</div>
          <span className="font-semibold tracking-tight">DocMind</span>
        </div>
        <button onClick={newChat} className="mt-2 flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] transition text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          New chat
        </button>
        <div className="mt-4 flex-1 overflow-y-auto space-y-0.5">
          <p className="px-2 text-[11px] uppercase tracking-wider text-white/30 mb-1">Recent</p>
          {chats.length === 0 && <p className="px-2 text-sm text-white/25">No conversations yet</p>}
          {chats.map((c) => (
            <div key={c.id} onClick={() => loadChat(c)}
              className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-sm transition ${c.id === chatId ? "bg-white/[0.07] text-white" : "text-white/55 hover:bg-white/[0.04]"}`}>
              <span className="truncate">{c.title}</span>
              <button onClick={(e) => deleteChat(c.id, e)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-white/[0.06] flex items-center justify-end px-5">
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="bg-[#1a1a1d] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none cursor-pointer hover:border-white/20 transition">
            <option style={{ color: "#000" }} value="gemini-2.5-flash-lite">Flash-Lite</option>
            <option style={{ color: "#000" }} value="gemini-2.5-flash">Flash</option>
          </select>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-8">
            {messages.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center text-center mt-24">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white text-xl font-bold mb-4">D</div>
                <h1 className="text-2xl font-semibold tracking-tight">How can I help?</h1>
                <p className="text-white/40 mt-2 text-sm">Attach a PDF with <span className="text-white/70">+</span>, then ask anything.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {samples.map((s) => (
                    <button key={s} onClick={() => setQuestion(s)}
                      className="px-3.5 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/90 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  if (isUser) return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[80%] bg-[#26262c] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap">{m.content}</div>
                    </div>
                  );
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500 shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">D</div>
                      <div className="min-w-0 flex-1">
                        {m.isError
                          ? <div className="text-[15px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{m.content}</div>
                          : <AssistantText text={m.content} animate={m.animate} onTick={scrollToBottom} />}
                        {!m.isError && <Sources sources={m.sources} />}
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500 shrink-0 flex items-center justify-center text-white text-xs font-bold">D</div>
                    <div className="flex items-center gap-1 mt-2">
                      {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: `${d * 0.2}s` }} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 px-5 pb-5">
          <div className="max-w-3xl mx-auto">
            {(attached.length > 0 || uploading || error) && (
              <div className="flex flex-wrap gap-2 items-center mb-2 px-1">
                {attached.map((n, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[12px] bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded-lg text-white/70">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    {n}
                  </span>
                ))}
                {uploading && <span className="text-[12px] text-indigo-300">Indexing…</span>}
                {error && <span className="text-[12px] text-rose-300">{error}</span>}
              </div>
            )}
            <div className="flex items-end gap-2 bg-[#1a1a1d] border border-white/10 rounded-2xl px-2.5 py-2 focus-within:border-white/25 transition">
              <label className="cursor-pointer w-9 h-9 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition" title="Attach PDF">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                <input type="file" accept=".pdf" multiple hidden onChange={onPickFiles} />
              </label>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder="Message DocMind…"
                className="flex-1 bg-transparent outline-none resize-none text-[15px] py-1.5 max-h-40 placeholder:text-white/30" />
              <button onClick={toggleVoice} title="Voice input"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${listening ? "bg-indigo-500 text-white" : "text-white/50 hover:text-white hover:bg-white/[0.06]"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></svg>
              </button>
              <button onClick={() => ask()} disabled={loading || !question.trim()}
                className="w-9 h-9 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:hover:bg-indigo-500 flex items-center justify-center transition text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>
            <p className="text-center text-[11px] text-white/25 mt-2">DocMind can make mistakes. Verify important info.</p>
          </div>
        </div>
      </main>
    </div>
  );
}