import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = "https://docmind-12ms.onrender.com";

/* ---------- tiny markdown renderer (no npm install) ---------- */
function inline(text, k0 = 0) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, key = k0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={key++} className="font-semibold text-white">{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={key++} className="bg-black/40 px-1.5 py-0.5 rounded text-cyan-200 text-sm">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = []; let list = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={"u" + blocks.length} className="list-disc ml-5 space-y-1 my-2">{list}</ul>); list = []; } };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^[*-]\s+/.test(t)) list.push(<li key={i}>{inline(t.replace(/^[*-]\s+/, ""), i * 100)}</li>);
    else if (t === "") flush();
    else if (/^#{1,3}\s/.test(t)) { flush(); blocks.push(<p key={i} className="font-bold text-lg mt-2 mb-1">{inline(t.replace(/^#{1,3}\s/, ""), i * 100)}</p>); }
    else { flush(); blocks.push(<p key={i} className="mb-2">{inline(t, i * 100)}</p>); }
  });
  flush();
  return <div>{blocks}</div>;
}
function AssistantText({ text, animate, onTick }) {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate) { setShown(text); return; }
    let i = 0;
    const id = setInterval(() => { i += 3; setShown(text.slice(0, i)); onTick && onTick(); if (i >= text.length) { setShown(text); clearInterval(id); } }, 10);
    return () => clearInterval(id);
  }, [text, animate]); // eslint-disable-line
  const done = shown.length >= text.length;
  return done ? <Markdown text={text} /> : <div className="whitespace-pre-wrap">{shown}<span className="caret">▌</span></div>;
}
function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="text-sm text-cyan-300 hover:text-cyan-200 transition">
        📎 {sources.length} source{sources.length > 1 ? "s" : ""} {open ? "▲" : "▼"}
      </button>
      {open && <div className="mt-2 space-y-2">{sources.map((s, i) => (
        <div key={i} className="rounded-2xl bg-black/30 border border-white/10 px-4 py-2 text-sm">
          <span className="text-pink-300 font-semibold">{s.source}</span>
          <p className="text-gray-400 mt-1">{s.snippet}</p>
        </div>))}</div>}
    </div>
  );
}

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attached, setAttached] = useState([]);   // indexed file names (chips)
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [model, setModel] = useState("gemini-2.5-flash-lite");  // model dropdown

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
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 38) || "New chat";
      const exists = prev.some((c) => c.id === id);
      if (exists) return prev.map((c) => (c.id === id ? { ...c, messages: msgs } : c));
      return [{ id, title, messages: msgs }, ...prev];
    });
  };
  const newChat = () => { setMessages([]); setChatId(null); setError(""); setAttached([]); };
  const loadChat = (c) => { setMessages(c.messages.map((m) => ({ ...m, animate: false }))); setChatId(c.id); setError(""); };
  const deleteChat = (id, e) => { e.stopPropagation(); setChats((p) => p.filter((c) => c.id !== id)); if (id === chatId) newChat(); };

  /* + button: pick files -> auto upload + index */
  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files);
    e.target.value = "";
    if (!picked.length) return;
    setUploading(true); setError("");
    const fd = new FormData();
    picked.forEach((f) => fd.append("files", f));
    try {
      const res = await axios.post(`${API}/upload-pdf`, fd);
      const names = (res.data.files || []).map((f) => f.filename);
      setAttached((prev) => [...prev, ...names]);
    } catch (err) {
      setError("Upload failed: " + (err.response?.data?.detail || err.message));
    } finally { setUploading(false); }
  };

  const askQuestion = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setError(""); setQuestion("");
    const base = [...messages, { role: "user", content: q, sources: [] }];
    setMessages(base); setLoading(true);
    try {
      const res = await axios.post(`${API}/ask`, { question: q, model });   // send model
      if (res.data.error) throw new Error(res.data.error);
      const aMsg = { role: "assistant", content: res.data.answer, sources: res.data.sources || [], animate: true };
      const final = [...base, aMsg];
      setMessages(final); saveChat(final);
    } catch (e) {
      let msg = e.response?.data?.detail || e.message || "Backend not reachable";
      if (msg.includes("429") || msg.toLowerCase().includes("quota"))
        msg = "⏳ Gemini free-tier limit reached. Wait ~1 minute and try again.";
      setMessages([...base, { role: "assistant", content: "⚠️ " + msg, sources: [], isError: true }]);
    } finally { setLoading(false); }
  };

  /* mic: voice input */
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Voice not supported here (use Chrome)"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true;
    rec.onresult = (ev) => setQuestion(Array.from(ev.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  return (
    <div className="relative min-h-screen text-white flex overflow-hidden bg-[linear-gradient(to_bottom_right,#020617,#000000,#0b1120)]">
      <style>{`
        @keyframes aurora { 0%{transform:translate(0,0) scale(1);} 33%{transform:translate(6%,4%) scale(1.15);} 66%{transform:translate(-5%,3%) scale(1.05);} 100%{transform:translate(0,0) scale(1);} }
        .aurora { position:fixed; inset:-25%; z-index:0; pointer-events:none; filter:blur(60px); opacity:.8;
          background: radial-gradient(closest-side, rgba(139,92,246,.45), transparent 70%), radial-gradient(closest-side, rgba(34,211,238,.40), transparent 70%), radial-gradient(closest-side, rgba(236,72,153,.40), transparent 70%);
          background-size:55% 55%,45% 45%,50% 50%; background-position:8% 12%,82% 18%,50% 88%; background-repeat:no-repeat; animation:aurora 16s ease-in-out infinite; }
        @keyframes shimmer { 0%{background-position:0% 50%;} 100%{background-position:200% 50%;} } .shimmer{background-size:200% auto; animation:shimmer 5s linear infinite;}
        @keyframes inLeft { from{opacity:0; transform:translateX(-26px) scale(.95);} to{opacity:1; transform:none;} }
        @keyframes inRight { from{opacity:0; transform:translateX(26px) scale(.95);} to{opacity:1; transform:none;} }
        .in-left{animation:inLeft .5s cubic-bezier(.2,.9,.25,1) both;} .in-right{animation:inRight .5s cubic-bezier(.2,.9,.25,1) both;}
        @keyframes glowpulse { 0%,100%{box-shadow:0 0 28px rgba(236,72,153,.55);} 50%{box-shadow:0 0 55px rgba(34,211,238,.75);} } .glowpulse{animation:glowpulse 2.6s ease-in-out infinite;}
        @keyframes floaty { 0%,100%{transform:translateY(0) rotate(0);} 50%{transform:translateY(-5px) rotate(-3deg);} } .floaty{animation:floaty 3.5s ease-in-out infinite; display:inline-block;}
        @keyframes blink { 50%{opacity:0;} } .caret{animation:blink 1s step-end infinite; color:#22d3ee;}
        @keyframes pulsedot { 0%,100%{transform:scale(1); opacity:1;} 50%{transform:scale(1.4); opacity:.6;} } .mic-on{animation:pulsedot 1s ease-in-out infinite;}
        .glass{background:rgba(255,255,255,.07); backdrop-filter:blur(24px);}
      `}</style>

      <div className="aurora" />

      {/* Sidebar */}
      <div className="relative z-10 w-72 glass border-r border-white/10 p-5 flex flex-col">
        <h1 className="text-3xl font-bold mb-6">Lumina<span className="floaty">🚀</span></h1>
        <button onClick={newChat} className="w-full py-3 rounded-3xl bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 hover:scale-[1.03] active:scale-95 transition font-semibold glowpulse">+ New Chat</button>
        <div className="mt-6 flex-1 overflow-y-auto space-y-1 pr-1">
          {chats.length === 0 && <p className="text-white/40 text-sm text-center mt-6">No conversations yet</p>}
          {chats.map((c) => (
            <div key={c.id} onClick={() => loadChat(c)} className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition ${c.id === chatId ? "bg-white/15 translate-x-1" : "hover:bg-white/10 hover:translate-x-1 text-white/70"}`}>
              <span className="truncate text-sm">{c.title}</span>
              <button onClick={(e) => deleteChat(c.id, e)} className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-pink-400 transition">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Header + model dropdown */}
        <div className="relative p-6 border-b border-white/10 flex items-center justify-center">
          <h1 className="text-5xl font-extrabold shimmer bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-500 bg-clip-text text-transparent text-center">DocMind ✨</h1>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ color: "#fff" }}
            className="absolute right-6 top-1/2 -translate-y-1/2 glass border border-white/10 rounded-full px-4 py-2 outline-none cursor-pointer hover:border-cyan-400 transition">
            <option style={{ color: "#000" }} value="gemini-2.5-flash-lite">⚡ Flash-Lite · more free usage</option>
            <option style={{ color: "#000" }} value="gemini-2.5-flash">🚀 Flash · smarter</option>
          </select>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-white/50 text-center mt-16 max-w-lg mx-auto leading-relaxed">
              Attach your PDFs with the <b>+</b> button below, then ask anything.
              Answers come from your documents — or general knowledge if it’s not there.
            </div>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end in-right" : "justify-start in-left"}`}>
                <div className={`max-w-2xl rounded-3xl px-5 py-3 leading-relaxed transition hover:scale-[1.01]
                  ${isUser ? "bg-gradient-to-r from-purple-500/80 to-pink-500/80 shadow-[0_0_30px_rgba(236,72,153,0.35)] whitespace-pre-wrap"
                    : m.isError ? "bg-red-500/15 border border-red-500/40 text-red-200 whitespace-pre-wrap"
                    : "glass border border-white/10"}`}>
                  <div className="text-xs opacity-60 mb-1">{isUser ? "You" : "Assistant"}</div>
                  {isUser || m.isError ? m.content : <AssistantText text={m.content} animate={m.animate} onTick={scrollToBottom} />}
                  {!isUser && !m.isError && <Sources sources={m.sources} />}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start in-left">
              <div className="glass border border-white/10 rounded-3xl px-5 py-4 flex items-center gap-2">
                <span className="text-sm opacity-70 shimmer bg-gradient-to-r from-cyan-300 to-pink-300 bg-clip-text text-transparent">Thinking</span>
                {[0, 1, 2].map((d) => (<span key={d} className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* attached file chips + status (above composer) */}
        {(attached.length > 0 || uploading || error) && (
          <div className="px-6 pb-1 flex flex-wrap gap-2 items-center">
            {attached.map((n, i) => (<span key={i} className="in-left text-xs bg-white/10 px-3 py-1 rounded-full">📄 {n}</span>))}
            {uploading && <span className="text-xs text-cyan-300">Indexing PDF...</span>}
            {error && <span className="text-xs text-red-300">{error}</span>}
          </div>
        )}

        {/* Composer: + attach | input | 🎤 | Ask  (all in one bar) */}
        <div className="p-6 pt-2 border-t border-white/10">
          <div className="flex items-center gap-3 glass border border-white/10 rounded-full px-3 py-2 focus-within:border-cyan-400 focus-within:shadow-[0_0_35px_rgba(34,211,238,0.35)] transition">
            <label className="cursor-pointer w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 hover:scale-105 flex items-center justify-center text-3xl leading-none pb-1 transition" title="Attach PDF">
              +
              <input type="file" accept=".pdf" multiple hidden onChange={onPickFiles} />
            </label>
            <input value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
              placeholder="Ask anything...  (Enter to send)"
              className="flex-1 bg-transparent outline-none text-lg px-2" />
            <button onClick={toggleVoice} title="Voice input"
              className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition ${listening ? "bg-gradient-to-r from-cyan-400 to-pink-500 mic-on" : "bg-white/10 hover:bg-white/20"}`}>🎤</button>
            <button onClick={askQuestion} disabled={loading}
              className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 font-bold glowpulse hover:scale-105 active:scale-95 transition disabled:opacity-50">
              {loading ? "..." : "Ask"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;