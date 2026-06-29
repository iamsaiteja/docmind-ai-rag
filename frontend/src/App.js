import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import MouseOrb from "./components/MouseOrb";

const API = "https://docmind-12ms.onrender.com";

/* ════════════════════════════════════════════════════════
   i18n — English / Telugu / Hindi
════════════════════════════════════════════════════════ */
const STRINGS = {
  en: {
    newChat: "New chat", searchChats: "Search chats", recent: "Recent",
    pinned: "Pinned", noConvos: "No conversations yet", noMatches: "No matches",
    howCanIHelp: "How can I help?", askAnything: "Ask anything — with or without a PDF.",
    messageDocMind: "Message DocMind…",
    docMindMistakes: "DocMind can make mistakes. Verify important info.",
    settings: "Settings", defaultModel: "Default model",
    accentColor: "Accent color", language: "Language", yourName: "Your name",
    clearConvos: "Clear all conversations", clear: "Clear",
    pin: "Pin", unpin: "Unpin", copy: "Copy", copied: "Copied!",
    regenerate: "Regenerate", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Stop", exportChat: "Export chat", deleteChat: "Delete",
    summarize: "Summarize this document", explainEli5: "Explain like I'm 5",
    listKeyPoints: "List the key points",
    sourcesLabel: "source", indexing: "Indexing…",
    uploadPdf: "Upload PDF", voice: "Voice input",
    voiceNotSupported: "Voice not supported here (use Chrome)",
    rateLimit: "Rate limit reached — wait about a minute and try again.",
    uploadFailed: "Upload failed: ",
    you: "You", scrollDown: "Scroll to latest",
    typeMore: "Tip: Shift+Enter for newline · Ctrl+K new chat · Ctrl+B toggle sidebar",
  },
  te: {
    newChat: "Kotha chat", searchChats: "Chats vethukko", recent: "Recent",
    pinned: "Pinned", noConvos: "Inka conversations ledhu", noMatches: "Em dorakaledhu",
    howCanIHelp: "Em help kavali bhayya?", askAnything: "Em adugu — PDF tho ledha PDF lekunda.",
    messageDocMind: "DocMind ki message rayi…",
    docMindMistakes: "DocMind tappu cheyochu. Muddatha info verify cheyyi.",
    settings: "Settings", defaultModel: "Default model",
    accentColor: "Rangu", language: "Bhasha", yourName: "Nee peru",
    clearConvos: "Anni conversations clear cheyyi", clear: "Clear",
    pin: "Pin", unpin: "Unpin teesey", copy: "Copy", copied: "Copy ayyindi!",
    regenerate: "Marala generate", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Aapu", exportChat: "Chat export", deleteChat: "Delete",
    summarize: "Ee document summarize chey", explainEli5: "5 years pillodiki cheppinattu cheppu",
    listKeyPoints: "Mukhya points list chey",
    sourcesLabel: "source", indexing: "Indexing avtundi…",
    uploadPdf: "PDF upload chey", voice: "Voice input",
    voiceNotSupported: "Voice support ledhu (Chrome vadu)",
    rateLimit: "Rate limit ayyindi — oka nimisham wait chesi try chey.",
    uploadFailed: "Upload fail ayyindi: ",
    you: "Nuvvu", scrollDown: "Kindiki velludam",
    typeMore: "Tip: Shift+Enter new line · Ctrl+K kotha chat · Ctrl+B sidebar",
  },
  hi: {
    newChat: "Nayi chat", searchChats: "Chats khojo", recent: "Recent",
    pinned: "Pinned", noConvos: "Abhi koi conversations nahi", noMatches: "Kuch nahi mila",
    howCanIHelp: "Kaise madad karu?", askAnything: "Kuch bhi pucho — PDF ke saath ya bina.",
    messageDocMind: "DocMind ko message bhejo…",
    docMindMistakes: "DocMind galti kar sakta hai. Important info verify karo.",
    settings: "Settings", defaultModel: "Default model",
    accentColor: "Rang", language: "Bhasha", yourName: "Aapka naam",
    clearConvos: "Saare conversations clear karo", clear: "Clear",
    pin: "Pin", unpin: "Unpin", copy: "Copy", copied: "Copy ho gaya!",
    regenerate: "Phir se", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Rok do", exportChat: "Chat export", deleteChat: "Delete",
    summarize: "Is document ko summarize karo", explainEli5: "5 saal ke bachche ko samjhao",
    listKeyPoints: "Mukhya points list karo",
    sourcesLabel: "source", indexing: "Indexing ho rahi hai…",
    uploadPdf: "PDF upload karo", voice: "Voice input",
    voiceNotSupported: "Voice support nahi hai (Chrome use karo)",
    rateLimit: "Rate limit ho gayi — ek minute ruko aur try karo.",
    uploadFailed: "Upload fail: ",
    you: "Aap", scrollDown: "Neeche jaao",
    typeMore: "Tip: Shift+Enter new line · Ctrl+K nayi chat · Ctrl+B sidebar",
  },
};

const ACCENT_COLORS = [
  { value: "steel",   label: "Steel",   rgb: "120, 160, 210" },
  { value: "indigo",  label: "Indigo",  rgb: "129, 140, 248" },
  { value: "emerald", label: "Emerald", rgb: "52, 211, 153" },
  { value: "rose",    label: "Rose",    rgb: "244, 114, 182" },
  { value: "amber",   label: "Amber",   rgb: "251, 191, 36" },
  { value: "cyan",    label: "Cyan",    rgb: "34, 211, 238" },
];

const LANGS = [
  { value: "en", label: "English" },
  { value: "te", label: "తెలుగు" },
  { value: "hi", label: "हिन्दी" },
];

const LS = {
  chats: "rag_chats",
  accent: "dm_accent",
  lang: "dm_lang",
  name: "dm_user_name",
  model: "dm_model",
};

/* ════════════════════════════════════════════════════════
   Inline-markdown (bold, code) helper
════════════════════════════════════════════════════════ */
function inline(text, k0 = 0) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, key = k0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**"))
      parts.push(<strong key={key++} className="font-semibold text-white">{tok.slice(2, -2)}</strong>);
    else
      parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-accent-soft text-[13px]">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/* ════════════════════════════════════════════════════════
   Code block (fenced ``` blocks) with copy
════════════════════════════════════════════════════════ */
function CodeBlock({ lang, code, t }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="my-3 rounded-xl border border-white/[0.08] overflow-hidden bg-black/40 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-[11px] uppercase tracking-wider text-white/40">{lang || "code"}</span>
        <button onClick={copy} className="text-[11px] text-white/50 hover:text-white transition flex items-center gap-1.5">
          {copied ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>{t.copied}</>
          ) : (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{t.copy}</>
          )}
        </button>
      </div>
      <pre className="px-3.5 py-2.5 text-[12.5px] sm:text-[13px] leading-6 overflow-x-auto text-white/85"><code>{code}</code></pre>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Text block (paragraphs, lists, headings)
════════════════════════════════════════════════════════ */
function TextBlock({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={"u" + blocks.length} className="list-disc pl-5 space-y-1.5 my-2.5 marker:text-white/30">{list}</ul>);
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const tx = line.trim();
    if (/^[*-]\s+/.test(tx))
      list.push(<li key={i} className="pl-1">{inline(tx.replace(/^[*-]\s+/, ""), i * 100)}</li>);
    else if (tx === "") flush();
    else if (/^#{1,3}\s/.test(tx)) {
      flush();
      blocks.push(<p key={i} className="font-semibold text-[15px] mt-3 mb-1.5 text-white">{inline(tx.replace(/^#{1,3}\s/, ""), i * 100)}</p>);
    } else {
      flush();
      blocks.push(<p key={i} className="mb-2.5">{inline(tx, i * 100)}</p>);
    }
  });
  flush();
  return <>{blocks}</>;
}

function Markdown({ text, t }) {
  // Parse fenced code blocks first; render text blocks in between
  const parts = [];
  const codeRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0, match, key = 0;
  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push({ type: "text", content: text.slice(lastIndex, match.index), key: key++ });
    parts.push({ type: "code", lang: match[1], content: match[2].trim(), key: key++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length)
    parts.push({ type: "text", content: text.slice(lastIndex), key: key++ });
  if (parts.length === 0)
    parts.push({ type: "text", content: text, key: 0 });

  return (
    <div className="text-[15px] leading-7">
      {parts.map((p) =>
        p.type === "code"
          ? <CodeBlock key={p.key} lang={p.lang} code={p.content} t={t} />
          : <TextBlock key={p.key} text={p.content} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Assistant typing animation
════════════════════════════════════════════════════════ */
function AssistantText({ text, animate, onTick, t }) {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate) { setShown(text); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 4;
      setShown(text.slice(0, i));
      onTick && onTick();
      if (i >= text.length) { setShown(text); clearInterval(id); }
    }, 12);
    return () => clearInterval(id);
  }, [text, animate]); // eslint-disable-line
  const done = shown.length >= text.length;
  return done
    ? <Markdown text={text} t={t} />
    : <div className="whitespace-pre-wrap text-[15px] leading-7">
        {shown}
        <span className="inline-block w-[2px] h-[15px] align-middle bg-accent ml-0.5 animate-pulse" />
      </div>;
}

/* ════════════════════════════════════════════════════════
   Sources (collapsible)
════════════════════════════════════════════════════════ */
function Sources({ sources, t }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 text-[13px] text-white/50 hover:text-white/80 transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
        </svg>
        <span className="font-medium">{sources.length} {t.sourcesLabel}{sources.length > 1 ? "s" : ""}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mt-3 grid gap-2">
          {sources.map((s, i) => (
            <div key={i}
              className="flex gap-3 rounded-xl glass-light border border-white/[0.08] px-3.5 py-3 hover:border-accent-40 hover:bg-white/[0.05] transition">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-accent-15 border border-accent-20 flex items-center justify-center text-accent-strong">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-accent-strong truncate">{s.source}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/30 bg-white/[0.06] px-1.5 py-0.5 rounded">
                    {i + 1}
                  </span>
                </div>
                <p className="text-[12.5px] text-white/45 mt-1 leading-relaxed line-clamp-3">{s.snippet}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Message actions (copy, regenerate)
════════════════════════════════════════════════════════ */
function MessageActions({ content, onRegenerate, t }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-center gap-1 mt-2 -ml-1">
      <button onClick={copy} title={t.copy}
        className="px-2 py-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition text-[12px] flex items-center gap-1.5">
        {copied ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>{t.copied}</>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        )}
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} title={t.regenerate}
          className="px-2 py-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition text-[12px] flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════ */
export default function App() {
  /* ── persistent prefs (localStorage) ─────────────────── */
  const [accent, setAccent] = useState(() => localStorage.getItem(LS.accent) || "steel");
  const [lang, setLang] = useState(() => localStorage.getItem(LS.lang) || "en");
  const [userName, setUserName] = useState(() => localStorage.getItem(LS.name) || "Sai Teja");
  const [model, setModel] = useState(() => localStorage.getItem(LS.model) || "gemini-2.5-flash-lite");
  const t = STRINGS[lang] || STRINGS.en;

  useEffect(() => { localStorage.setItem(LS.accent, accent); }, [accent]);
  useEffect(() => { localStorage.setItem(LS.lang, lang); }, [lang]);
  useEffect(() => { localStorage.setItem(LS.name, userName); }, [userName]);
  useEffect(() => { localStorage.setItem(LS.model, model); }, [model]);

  /* ── chat state ─────────────────────────────────────── */
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attached, setAttached] = useState([]);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS.chats)) || []; }
    catch { return []; }
  });
  const [chatId, setChatId] = useState(null);
  const [search, setSearch] = useState("");
  const [showAccount, setShowAccount] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile drawer
  const [editingIdx, setEditingIdx] = useState(null);       // index of msg being edited
  const [editText, setEditText] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);

  const bottomRef = useRef(null);
  const recRef    = useRef(null);
  const fileRef   = useRef(null);
  const textareaRef = useRef(null);
  const scrollerRef = useRef(null);
  const abortRef  = useRef(null);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  /* ── effects ────────────────────────────────────────── */
  useEffect(() => { localStorage.setItem(LS.chats, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + "px";
    }
  }, [question]);

  // Track scroll position for "scroll to bottom" floating button
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setShowScrollDown(!nearBottom && messages.length > 0);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [messages.length]);

  /* ── helpers ────────────────────────────────────────── */
  const newChat = useCallback(() => {
    setMessages([]); setChatId(null); setError(""); setAttached([]);
    setEditingIdx(null); setSidebarOpen(false);
  }, []);

  const saveChat = (msgs) => {
    let id = chatId;
    if (!id) { id = Date.now().toString(); setChatId(id); }
    setChats((prev) => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 40) || "New chat";
      const exists = prev.some((c) => c.id === id);
      if (exists) return prev.map((c) => (c.id === id ? { ...c, messages: msgs, title: c.title || title } : c));
      return [{ id, title, messages: msgs, pinned: false }, ...prev];
    });
  };

  const loadChat = (c) => {
    setMessages(c.messages.map((m) => ({ ...m, animate: false })));
    setChatId(c.id); setError(""); setSidebarOpen(false); setEditingIdx(null);
  };
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats((p) => p.filter((c) => c.id !== id));
    if (id === chatId) newChat();
  };
  const togglePin = (id, e) => {
    e.stopPropagation();
    setChats((p) => p.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };
  const clearAll = () => { setChats([]); newChat(); setShowSettings(false); };
  const removeAttached = (i) => setAttached((p) => p.filter((_, k) => k !== i));

  // Export current chat as Markdown
  const exportCurrentChat = () => {
    if (messages.length === 0) return;
    const title = messages.find((m) => m.role === "user")?.content.slice(0, 60) || "DocMind chat";
    const md = `# ${title}\n\n_Exported from DocMind on ${new Date().toLocaleString()}_\n\n---\n\n` +
      messages.map((m) =>
        `### ${m.role === "user" ? t.you : "DocMind"}\n\n${m.content}\n` +
        (m.sources && m.sources.length
          ? `\n**Sources:**\n` + m.sources.map((s, i) => `${i + 1}. ${s.source}`).join("\n") + "\n"
          : "")
      ).join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── file upload ────────────────────────────────────── */
  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files); e.target.value = "";
    if (!picked.length) return;
    setUploading(true); setError("");
    const fd = new FormData();
    picked.forEach((f) => fd.append("files", f));
    try {
      const res = await axios.post(`${API}/upload-pdf`, fd);
      setAttached((p) => [...p, ...(res.data.files || []).map((f) => f.filename)]);
    } catch (err) {
      setError(t.uploadFailed + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  /* ── ask / regenerate / edit / stop ─────────────────── */
  const ask = async (preset, startMessages) => {
    const q = (preset ?? question).trim();
    if (!q || loading) return;

    // Light haptic on mobile
    if (navigator.vibrate) navigator.vibrate(8);

    setError(""); setQuestion("");
    const start = startMessages ?? messages;
    const base = [...start, { role: "user", content: q, sources: [] }];
    setMessages(base); setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await axios.post(
        `${API}/ask`,
        { question: q, model },
        { signal: controller.signal }
      );
      if (res.data.error) throw new Error(res.data.error);
      const final = [...base, {
        role: "assistant",
        content: res.data.answer,
        sources: res.data.sources || [],
        animate: true,
      }];
      setMessages(final); saveChat(final);
    } catch (e) {
      if (e.name === "CanceledError" || axios.isCancel?.(e)) {
        // user pressed Stop; just clean up
        saveChat(base);
        setLoading(false);
        abortRef.current = null;
        return;
      }
      let msg = e.response?.data?.detail || e.message || "Backend not reachable";
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) msg = t.rateLimit;
      const errMsgs = [...base, { role: "assistant", content: msg, sources: [], isError: true }];
      setMessages(errMsgs); saveChat(errMsgs);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    if (abortRef.current) abortRef.current.abort();
    // also fast-forward any in-progress typing animation
    setMessages((prev) => prev.map((m, i) =>
      i === prev.length - 1 && m.animate ? { ...m, animate: false } : m
    ));
  };

  const regenerate = async (assistantIdx) => {
    const userIdx = assistantIdx - 1;
    if (userIdx < 0 || messages[userIdx].role !== "user") return;
    const userText = messages[userIdx].content;
    const truncated = messages.slice(0, userIdx);
    setMessages(truncated);
    await ask(userText, truncated);
  };

  const startEdit = (i, content) => {
    setEditingIdx(i); setEditText(content);
  };
  const cancelEdit = () => { setEditingIdx(null); setEditText(""); };
  const saveEdit = async () => {
    const i = editingIdx;
    const newText = editText.trim();
    if (!newText || i === null) return;
    const truncated = messages.slice(0, i);
    setEditingIdx(null); setEditText("");
    setMessages(truncated);
    await ask(newText, truncated);
  };

  /* ── voice ──────────────────────────────────────────── */
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError(t.voiceNotSupported); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-US";
    rec.interimResults = true;
    rec.onresult = (ev) => setQuestion(Array.from(ev.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  /* ── keyboard shortcuts ─────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      const inField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); newChat();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault(); setSidebarOpen((s) => !s);
      } else if (e.key === "Escape") {
        setShowSettings(false); setShowAccount(false);
        setShowPlus(false); setSidebarOpen(false);
        if (editingIdx !== null) cancelEdit();
      } else if (e.key === "/" && !inField) {
        e.preventDefault(); textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newChat, editingIdx]);

  /* ── derived ────────────────────────────────────────── */
  const initials = userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "U";
  const filtered = chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const sortedChats = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const pinnedChats = sortedChats.filter((c) => c.pinned);
  const otherChats = sortedChats.filter((c) => !c.pinned);
  const samples = [t.summarize, t.explainEli5, t.listKeyPoints];

  /* ════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */
  return (
    <div data-accent={accent} className="flex h-[100dvh] bg-[#0b0a0d] text-[#ececee] font-sans antialiased relative overflow-hidden">

      {/* Hide MouseOrb on touch devices — pure CSS, no JS cost */}
      <div className="hidden md:block">
        <MouseOrb />
      </div>

      <input type="file" accept=".pdf" multiple hidden ref={fileRef} onChange={onPickFiles} />

      {/* Animated water-light background */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-blob bg-blob-3" />
      <div className="hidden md:block bg-blob bg-blob-4" />

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-fadeIn"
        />
      )}

      {/* ════════ Sidebar (drawer on mobile, static on desktop) ════════ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[300px]
          glass border-r border-white/[0.07] flex flex-col p-3
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0 md:w-72 md:shrink-0 md:z-10
        `}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg glossy-icon logo-glow flex items-center justify-center text-white text-sm font-bold">D</div>
            <span className="font-semibold tracking-tight shimmer-text">DocMind</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06]"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <button onClick={newChat}
          className="mt-2 flex items-center gap-2 w-full px-3 py-2.5 rounded-xl glass-light water-input hover:bg-white/[0.06] transition text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          {t.newChat}
        </button>

        {/* Search */}
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl glass-light border border-white/[0.06]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 shrink-0"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchChats}
            className="bg-transparent outline-none text-sm w-full placeholder:text-white/30" />
        </div>

        {/* Chat list */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-0.5">
          {pinnedChats.length > 0 && (
            <>
              <p className="px-2 text-[11px] uppercase tracking-wider text-white/30 mb-1 mt-1">{t.pinned}</p>
              {pinnedChats.map((c) => (
                <ChatItem key={c.id} c={c} active={c.id === chatId}
                  onClick={() => loadChat(c)} onPin={togglePin} onDel={deleteChat} t={t} />
              ))}
            </>
          )}
          <p className="px-2 text-[11px] uppercase tracking-wider text-white/30 mb-1 mt-3">{t.recent}</p>
          {otherChats.length === 0 && pinnedChats.length === 0 && (
            <p className="px-2 text-sm text-white/25">{search ? t.noMatches : t.noConvos}</p>
          )}
          {otherChats.map((c) => (
            <ChatItem key={c.id} c={c} active={c.id === chatId}
              onClick={() => loadChat(c)} onPin={togglePin} onDel={deleteChat} t={t} />
          ))}
        </div>

        {/* Account */}
        <div className="relative pt-2 border-t border-white/[0.06]">
          {showAccount && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAccount(false)} />
              <div className="absolute bottom-14 left-0 right-0 z-20 glass border border-white/[0.1] rounded-xl p-1.5 shadow-2xl">
                <button onClick={() => { setShowSettings(true); setShowAccount(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  {t.settings}
                </button>
                <button onClick={() => { exportCurrentChat(); setShowAccount(false); }}
                  disabled={messages.length === 0}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  {t.exportChat}
                </button>
                <button onClick={clearAll}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-rose-300 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  {t.clearConvos}
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowAccount(!showAccount)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-white/[0.04] transition">
            <div className="w-8 h-8 rounded-full glossy-icon logo-glow flex items-center justify-center text-white text-xs font-semibold">{initials}</div>
            <span className="text-sm text-white/80 truncate">{userName}</span>
          </button>
        </div>
      </aside>

      {/* ════════ Main column ════════ */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 w-full">

        {/* Header */}
        <header className="h-14 shrink-0 glass border-b border-white/[0.06] flex items-center justify-between px-3 md:px-5 gap-2">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] transition"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>

          {/* Mobile center logo */}
          <div className="md:hidden flex items-center gap-2">
            <div className="w-6 h-6 rounded-md glossy-icon flex items-center justify-center text-white text-[11px] font-bold">D</div>
            <span className="font-semibold tracking-tight shimmer-text text-sm">DocMind</span>
          </div>

          <div className="hidden md:block flex-1" />

          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 md:px-3 py-1.5 text-[12.5px] md:text-sm text-white/80 outline-none cursor-pointer hover:border-accent-40 transition">
            <option style={{ color: "#000" }} value="gemini-2.5-flash-lite">Flash-Lite</option>
            <option style={{ color: "#000" }} value="gemini-2.5-flash">Flash</option>
          </select>
        </header>

        {/* Messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto relative">
          <div className="max-w-5xl mx-auto px-4 md:px-5 py-6 md:py-8">

            {messages.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center text-center mt-16 md:mt-24 px-4">
                <div className="w-14 h-14 rounded-2xl glossy-icon logo-float logo-glow flex items-center justify-center text-white text-2xl font-bold mb-5">D</div>
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight shimmer-text">{t.howCanIHelp}</h1>
                <p className="text-white/40 mt-2 text-sm">{t.askAnything}</p>
                <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-md">
                  {samples.map((s) => (
                    <button key={s} onClick={() => setQuestion(s)}
                      className="px-3.5 py-2 rounded-xl glass-light water-input text-[13px] md:text-sm text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 md:space-y-7">
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  const isEditing = editingIdx === i;

                  if (isUser) {
                    if (isEditing) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="w-full max-w-[92%] md:max-w-[80%] glass-light water-input rounded-2xl px-3 py-2.5">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              autoFocus
                              className="w-full bg-transparent outline-none resize-none text-[15px] leading-7 text-white/90"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition">{t.cancel}</button>
                              <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg text-[13px] glossy-btn text-white">{t.save}</button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="group flex flex-col items-end">
                        <div className="max-w-[88%] md:max-w-[80%] user-bubble rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                        <button
                          onClick={() => startEdit(i, m.content)}
                          disabled={loading}
                          className="md:opacity-0 md:group-hover:opacity-100 transition mt-1.5 px-2 py-1 rounded-lg text-[12px] text-white/40 hover:text-white hover:bg-white/[0.06] flex items-center gap-1.5"
                          title={t.edit}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          {t.edit}
                        </button>
                      </div>
                    );
                  }

                  // assistant message
                  return (
                    <div key={i} className="flex gap-2.5 md:gap-3 group">
                      <div className="w-7 h-7 rounded-lg glossy-icon logo-glow shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">D</div>
                      <div className="min-w-0 flex-1">
                        {m.isError
                          ? <div className="text-[15px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{m.content}</div>
                          : <AssistantText text={m.content} animate={m.animate} onTick={scrollToBottom} t={t} />
                        }
                        {!m.isError && <Sources sources={m.sources} t={t} />}
                        {!m.isError && !m.animate && !loading && (
                          <MessageActions
                            content={m.content}
                            onRegenerate={() => regenerate(i)}
                            t={t}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex gap-2.5 md:gap-3">
                    <div className="w-7 h-7 rounded-lg glossy-icon logo-glow shrink-0 flex items-center justify-center text-white text-xs font-bold">D</div>
                    <div className="flex items-center gap-1.5 mt-2.5">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="w-2 h-2 rounded-full bg-accent water-dot" style={{ animationDelay: `${d * 0.18}s` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Floating scroll-to-bottom */}
          {showScrollDown && (
            <button
              onClick={scrollToBottom}
              className="fixed md:absolute bottom-28 md:bottom-32 right-4 md:right-8 z-20 w-10 h-10 rounded-full glass border border-white/[0.12] hover:border-accent-40 flex items-center justify-center text-white/70 hover:text-white transition shadow-xl"
              title={t.scrollDown}
              aria-label={t.scrollDown}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
            </button>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-3 md:px-5 pb-3 md:pb-5 pt-2">
          <div className="max-w-3xl mx-auto">
            {(attached.length > 0 || uploading || error) && (
              <div className="flex flex-wrap gap-2 items-center mb-2 px-1">
                {attached.map((n, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[12px] glass-light border border-white/[0.1] px-2.5 py-1 rounded-lg text-white/70">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    <span className="truncate max-w-[120px] md:max-w-[160px]">{n}</span>
                    <button onClick={() => removeAttached(i)} className="ml-0.5 text-white/40 hover:text-rose-300 transition" aria-label="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </span>
                ))}
                {uploading && <span className="text-[12px] text-accent-strong">{t.indexing}</span>}
                {error && <span className="text-[12px] text-rose-300">{error}</span>}
              </div>
            )}

            <div className="flex items-end gap-1.5 md:gap-2 glass water-input rounded-2xl px-2 md:px-2.5 py-2 transition">
              {/* + menu */}
              <div className="relative">
                {showPlus && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPlus(false)} />
                    <div className="absolute bottom-11 left-0 z-20 w-44 glass border border-white/[0.1] rounded-xl p-1.5 shadow-2xl">
                      <button onClick={() => { setShowPlus(false); fileRef.current?.click(); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                        {t.uploadPdf}
                      </button>
                    </div>
                  </>
                )}
                <button onClick={() => setShowPlus(!showPlus)}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition" title="Add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>

              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder={t.messageDocMind}
                className="flex-1 bg-transparent outline-none resize-none text-[15px] py-1.5 max-h-44 placeholder:text-white/30"
              />

              <button onClick={toggleVoice} title={t.voice}
                className={`w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition ${listening ? "glossy-btn text-white" : "text-white/50 hover:text-white hover:bg-white/[0.06]"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></svg>
              </button>

              {loading ? (
                <button onClick={stop} title={t.stop}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg glossy-btn flex items-center justify-center text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              ) : (
                <button onClick={() => ask()} disabled={!question.trim()}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg glossy-btn flex items-center justify-center text-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[10.5px] md:text-[11px] text-white/25">{t.docMindMistakes}</p>
              {question.length > 0 && (
                <p className="text-[10.5px] md:text-[11px] text-white/30 tabular-nums">{question.length}</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ════════ Settings modal ════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
          <div className="glass border border-white/[0.1] rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold shimmer-text">{t.settings}</h2>
              <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Your name */}
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06] gap-3">
              <span className="text-sm text-white/70 shrink-0">{t.yourName}</span>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none w-44 text-right focus:border-accent-40 transition"
                maxLength={30}
              />
            </div>

            {/* Language */}
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-sm text-white/70">{t.language}</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)}
                className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer">
                {LANGS.map((l) => <option key={l.value} style={{ color: "#000" }} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            {/* Accent color */}
            <div className="py-3 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm text-white/70">{t.accentColor}</span>
                <span className="text-[12px] text-white/40 capitalize">{accent}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setAccent(c.value)}
                    title={c.label}
                    className={`w-9 h-9 rounded-xl transition relative ${accent === c.value ? "ring-2 ring-offset-2 ring-offset-[#0b0a0d] ring-white/60 scale-105" : "hover:scale-105"}`}
                    style={{ background: `rgb(${c.rgb})` }}
                  >
                    {accent === c.value && (
                      <svg className="absolute inset-0 m-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b0a0d" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Default model */}
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-sm text-white/70">{t.defaultModel}</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer">
                <option style={{ color: "#000" }} value="gemini-2.5-flash-lite">Flash-Lite</option>
                <option style={{ color: "#000" }} value="gemini-2.5-flash">Flash</option>
              </select>
            </div>

            {/* Export */}
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-sm text-white/70">{t.exportChat}</span>
              <button onClick={exportCurrentChat} disabled={messages.length === 0}
                className="text-sm px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/80 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                .md
              </button>
            </div>

            {/* Clear */}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-white/70">{t.clearConvos}</span>
              <button onClick={clearAll}
                className="text-sm px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition">
                {t.clear}
              </button>
            </div>

            <p className="text-[11px] text-white/30 mt-2 leading-relaxed">{t.typeMore}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Sidebar chat item (with pin + delete)
════════════════════════════════════════════════════════ */
function ChatItem({ c, active, onClick, onPin, onDel, t }) {
  return (
    <div onClick={onClick}
      className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition ${active ? "chat-active text-white" : "text-white/55 hover:bg-white/[0.04]"}`}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {c.pinned && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-accent-strong shrink-0">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
          </svg>
        )}
        <span className="truncate">{c.title}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
        <button onClick={(e) => onPin(c.id, e)}
          className="p-1 rounded text-white/30 hover:text-white/80 transition"
          title={c.pinned ? t.unpin : t.pin}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={c.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
          </svg>
        </button>
        <button onClick={(e) => onDel(c.id, e)}
          className="p-1 rounded text-white/30 hover:text-rose-300 transition"
          title={t.deleteChat}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}