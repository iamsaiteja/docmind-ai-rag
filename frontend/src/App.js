import React, { useState, useRef, useEffect, useCallback } from "react";
import { AssistantText, MessageActions, Sources } from "./ChatMessages";

import { API } from "./apiClient";
const FIRST_REPLY_TIMEOUT = 75_000;
const STREAM_IDLE_TIMEOUT = 35_000;
const SLOW_REPLY_NOTICE = 5_000;

/* ════════════════════════════════════════════════════════
   i18n — English / Telugu / Hindi
════════════════════════════════════════════════════════ */
const STRINGS = {
  en: {
    send: "Send message", newChat: "New chat", searchChats: "Search chats", recent: "Recent",
    pinned: "Pinned", noConvos: "No conversations yet", noMatches: "No matches",
    howCanIHelp: "How can I help?", askAnything: "Ask anything — with or without a PDF.",
    messageDocMind: "Message DocMind…",
    docMindMistakes: "DocMind can make mistakes. Verify important info.",
    settings: "Settings", defaultModel: "Default model",
    language: "Language", yourName: "Your name",
    clearConvos: "Clear all conversations", clear: "Clear",
    pin: "Pin", unpin: "Unpin", copy: "Copy", copied: "Copied!",
    regenerate: "Regenerate", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Stop", exportChat: "Export chat", deleteChat: "Delete",
    rename: "Rename", thinking: "Thinking…",
    slowReply: "Waiting for the server…",
    replyTimeout: "The reply timed out. Try again.",
    replyFailed: "The reply was interrupted. Try again.",
    replyBusy: "DocMind is busy. Try again in a few seconds.",
    greeting: "Hi! Upload a PDF or ask me a question.",
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
    send: "Message pampu", newChat: "Kotha chat", searchChats: "Chats vethukko", recent: "Recent",
    pinned: "Pinned", noConvos: "Inka conversations ledhu", noMatches: "Em dorakaledhu",
    howCanIHelp: "Em help kavali bhayya?", askAnything: "Em adugu — PDF tho ledha PDF lekunda.",
    messageDocMind: "DocMind ki message rayi…",
    docMindMistakes: "DocMind tappu cheyochu. Muddatha info verify cheyyi.",
    settings: "Settings", defaultModel: "Default model",
    language: "Bhasha", yourName: "Nee peru",
    clearConvos: "Anni conversations clear cheyyi", clear: "Clear",
    pin: "Pin", unpin: "Unpin teesey", copy: "Copy", copied: "Copy ayyindi!",
    regenerate: "Marala generate", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Aapu", exportChat: "Chat export", deleteChat: "Delete",
    rename: "Peru maarchu", thinking: "Aalochistunna…",
    slowReply: "Server reply kosam wait chesthunna…",
    replyTimeout: "Reply ki time aipoyindi. Malli try cheyyi.",
    replyFailed: "Reply madhyalo aagipoyindi. Malli try cheyyi.",
    replyBusy: "DocMind busy ga undi. Konni seconds tarvata malli try cheyyi.",
    greeting: "Hi! PDF upload cheyyi leda oka question adugu.",
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
    send: "Message bhejein", newChat: "Nayi chat", searchChats: "Chats khojo", recent: "Recent",
    pinned: "Pinned", noConvos: "Abhi koi conversations nahi", noMatches: "Kuch nahi mila",
    howCanIHelp: "Kaise madad karu?", askAnything: "Kuch bhi pucho — PDF ke saath ya bina.",
    messageDocMind: "DocMind ko message bhejo…",
    docMindMistakes: "DocMind galti kar sakta hai. Important info verify karo.",
    settings: "Settings", defaultModel: "Default model",
    language: "Bhasha", yourName: "Aapka naam",
    clearConvos: "Saare conversations clear karo", clear: "Clear",
    pin: "Pin", unpin: "Unpin", copy: "Copy", copied: "Copy ho gaya!",
    regenerate: "Phir se", edit: "Edit", save: "Save", cancel: "Cancel",
    stop: "Rok do", exportChat: "Chat export", deleteChat: "Delete",
    rename: "Naam badlo", thinking: "Soch raha hoon…",
    slowReply: "Server ke jawab ka intezar hai…",
    replyTimeout: "Jawab ka samay khatam ho gaya. Phir try karein.",
    replyFailed: "Jawab beech mein ruk gaya. Phir try karein.",
    replyBusy: "DocMind busy hai. Kuch seconds baad phir try karein.",
    greeting: "Hi! PDF upload karein ya koi sawal poochhein.",
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

const LANGS = [
  { value: "en", label: "English" },
  { value: "te", label: "తెలుగు" },
  { value: "hi", label: "हिन्दी" },
];

const LS = {
  chats: "rag_chats",
  lang: "dm_lang",
  name: "dm_user_name",
  model: "dm_model",
};

/* ════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════ */
export default function App({ token, api, workspace, onExit, leaving, onPlans, onAdmin, reload, storageNotice }) {
  const guest = workspace.profile.role === "guest";
  /* ── persistent prefs (localStorage) ─────────────────── */
  const [lang, setLang] = useState(() => localStorage.getItem(LS.lang) || "en");
  const [userName, setUserName] = useState(() => guest ? "Guest" : workspace.profile.email);
  const [model, setModel] = useState(() => localStorage.getItem(LS.model) || "gemini-2.5-flash-lite");
  const t = STRINGS[lang] || STRINGS.en;

  useEffect(() => { localStorage.setItem(LS.lang, lang); }, [lang]);
  useEffect(() => { localStorage.setItem(LS.model, model); }, [model]);

  /* ── chat state ─────────────────────────────────────── */
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [slowReply, setSlowReply] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attached, setAttached] = useState(workspace.files);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [chats, setChats] = useState(workspace.chats);
  const savedChats = useRef(workspace.chats);
  const revision = useRef(workspace.revision);
  const saving = useRef(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
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
  const streamRef = useRef(null);   // in-flight streamed answer (Stop press ki partial save)

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  /* ── effects ────────────────────────────────────────── */
  useEffect(() => {
    if (guest || chats === savedChats.current || saving.current || saveError) return;
    saving.current = true;
    setSavePending(true);
    api.post("/chats", { revision: revision.current, chats })
      .then(({ data }) => {
        revision.current = data.revision;
        savedChats.current = chats;
      })
      .catch((err) => setSaveError(err.response?.data?.detail || "Chat save failed. Your latest changes are in this tab."))
      .finally(() => {
        saving.current = false;
        setSavePending(false);
      });
  }, [api, chats, guest, saveError, savePending]);
  useEffect(() => () => abortRef.current?.abort(), []);
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
  const cancelActiveReply = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamRef.current = null;
    setLoading(false);
    setSlowReply(false);
  }, []);

  const newChat = useCallback(() => {
    cancelActiveReply();
    setMessages([]); setChatId(null); setError(""); setAttached([]);
    setEditingIdx(null); setSidebarOpen(false);
  }, [cancelActiveReply]);

  const saveChat = (msgs) => {
    let id = chatId;
    if (!id) { id = Date.now().toString(); setChatId(id); }
    setChats((prev) => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 40) || "New chat";
      const exists = prev.some((c) => c.id === id);
      if (exists) return prev.map((c) => (c.id === id ? { ...c, messages: msgs, title: c.title || title } : c));
      return [{ id, title, messages: msgs, pinned: false }, ...prev];
    });
    return id;
  };

  const renameChat = (id, title) => {
    const clean = title.trim();
    if (!clean) return;
    setChats((p) => p.map((c) => (c.id === id ? { ...c, title: clean.slice(0, 60) } : c)));
  };

  const loadChat = (c) => {
    cancelActiveReply();
    setMessages(c.messages.map((m) => ({ ...m, animate: false, streaming: false })));
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
    if (!picked.length || guest) return;
    setUploading(true); setError("");
    const fd = new FormData();
    picked.forEach((f) => fd.append("files", f));
    try {
      const res = await api.post("/upload-pdf", fd);
      setAttached((p) => [...new Set([...p, ...(res.data.files || []).map((f) => f.filename)])]);
    } catch (err) {
      setError(t.uploadFailed + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  /* ── ask / regenerate / edit / stop ─────────────────── */

  // Real-time streaming via SSE (like ChatGPT). Throws "no-stream" if the
  // backend doesn't support it yet, so the caller can fall back to /ask.
  const askStream = async (q, history, base, controller, onDelta) => {
    const res = await fetch(`${API}/ask-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: q, model, history: history.slice(-10) }),
      signal: controller.signal,
    });
    if ([404, 405, 501].includes(res.status)) throw new Error("no-stream");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error("Streaming is unavailable.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", content = "", sources = [];
    streamRef.current = { content: "", sources: [] };
    let complete = false;

    try {
      while (!complete) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.type === "sources") {
            sources = data.sources || [];
          } else if (data.type === "delta") {
            onDelta();
            content += data.text;
            streamRef.current = { content, sources };
            setMessages([...base, { role: "assistant", content, sources, streaming: true }]);
          } else if (data.type === "done") {
            complete = true;
            break;
          } else if (data.type === "error") {
            throw new Error(data.message || "stream error");
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    if (!complete || !content.trim()) throw new Error("incomplete-stream");
    const final = [...base, { role: "assistant", content, sources, animate: false }];
    if (abortRef.current === controller) setMessages(final);
    return final;
  };

  const ask = async (preset, startMessages) => {
    const q = (preset ?? question).trim();
    if (!q || loading || abortRef.current) return;

    // Light haptic on mobile
    if (navigator.vibrate) navigator.vibrate(8);

    setError(""); setQuestion("");
    const start = startMessages ?? messages;
    const base = [...start, { role: "user", content: q, sources: [] }];
    if (/^(hi|hello|hey)[!.?]*$/i.test(q) && !attached.length) {
      const final = [...base, { role: "assistant", content: t.greeting, sources: [] }];
      setMessages(final);
      saveChat(final);
      return;
    }

    setMessages(base);
    setLoading(true);
    setSlowReply(false);

    const controller = new AbortController();
    abortRef.current = controller;
    streamRef.current = null;
    const slowTimer = setTimeout(() => {
      if (abortRef.current === controller) setSlowReply(true);
    }, SLOW_REPLY_NOTICE);
    let timedOut = false;
    let timeout;
    const setDeadline = (duration) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, duration);
    };
    setDeadline(FIRST_REPLY_TIMEOUT);

    const history = start
      .filter((m) => !m.isError && m.content)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      let final;
      try {
        final = await askStream(q, history, base, controller, () => {
          clearTimeout(slowTimer);
          setDeadline(STREAM_IDLE_TIMEOUT);
        });
      } catch (e) {
        if (e.message !== "no-stream") throw e;
        const { data } = await api.post(
          "/ask",
          { question: q, model, history },
          { signal: controller.signal }
        );
        if (data.error || !data.answer?.trim()) throw new Error(data.error || "empty-reply");
        final = [...base, { role: "assistant", content: data.answer, sources: data.sources || [] }];
        if (abortRef.current === controller) setMessages(final);
      }
      if (abortRef.current === controller) saveChat(final);
    } catch (e) {
      if (abortRef.current !== controller) return;
      const partial = streamRef.current;
      const final = partial?.content
        ? [...base, { role: "assistant", ...partial }]
        : [...base];
      if (timedOut || !controller.signal.aborted) {
        const detail = String(e.response?.status || e.message);
        const content = timedOut ? t.replyTimeout
          : /503|busy/i.test(detail) ? t.replyBusy
          : /429|quota/i.test(detail) ? t.rateLimit : t.replyFailed;
        final.push({ role: "assistant", content, sources: [], isError: true });
      }
      setMessages(final);
      saveChat(final);
    } finally {
      clearTimeout(timeout);
      clearTimeout(slowTimer);
      if (abortRef.current === controller) {
        streamRef.current = null;
        setSlowReply(false);
        setLoading(false);
        abortRef.current = null;
      }
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
  const samples = guest
    ? ["When does the library open?", "How many books can I borrow?", "How do I get a library card?"]
    : [t.summarize, t.explainEli5, t.listKeyPoints];

  /* ════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */
  return (
    <div className="flex h-[100dvh] bg-page text-ink font-sans antialiased relative overflow-hidden">

      <input type="file" accept=".pdf" multiple hidden ref={fileRef} onChange={onPickFiles} />

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* ════════ Sidebar (drawer on mobile, static on desktop) ════════ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[300px]
          glass border-r border-ink/[0.07] flex flex-col p-3
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0 md:w-72 md:shrink-0 md:z-10
        `}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg glossy-icon flex items-center justify-center text-ink text-sm font-bold">D</div>
            <span className="font-semibold tracking-tight shimmer-text">DocMind</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ink/75 hover:text-ink hover:bg-ink/[0.06]"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <button onClick={newChat}
          className="mt-2 flex items-center gap-2 w-full px-3 py-2.5 rounded-xl glass-light water-input hover:bg-ink/[0.06] transition text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          {t.newChat}
        </button>

        {/* Search */}
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl glass-light border border-ink/[0.06]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/70 shrink-0"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchChats}
            className="bg-transparent outline-none text-sm w-full placeholder:text-ink/70" />
        </div>

        {/* Chat list */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-0.5">
          {pinnedChats.length > 0 && (
            <>
              <p className="px-2 text-[11px] uppercase tracking-wider text-ink/70 mb-1 mt-1">{t.pinned}</p>
              {pinnedChats.map((c) => (
                <ChatItem key={c.id} c={c} active={c.id === chatId}
                  onClick={() => loadChat(c)} onPin={togglePin} onDel={deleteChat} onRename={renameChat} t={t} />
              ))}
            </>
          )}
          <p className="px-2 text-[11px] uppercase tracking-wider text-ink/70 mb-1 mt-3">{t.recent}</p>
          {otherChats.length === 0 && pinnedChats.length === 0 && (
            <p className="px-2 text-sm text-ink/70">{search ? t.noMatches : t.noConvos}</p>
          )}
          {otherChats.map((c) => (
            <ChatItem key={c.id} c={c} active={c.id === chatId}
              onClick={() => loadChat(c)} onPin={togglePin} onDel={deleteChat} onRename={renameChat} t={t} />
          ))}
        </div>

        {/* Account */}
        <div className="relative pt-2 border-t border-ink/[0.06]">
          {showAccount && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAccount(false)} />
              <div className="absolute bottom-14 left-0 right-0 z-20 glass border border-ink/[0.1] rounded-xl p-1.5 shadow-2xl">
                <button onClick={() => { setShowSettings(true); setShowAccount(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-ink/[0.06] text-sm text-ink/80 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  {t.settings}
                </button>
                <button onClick={() => { exportCurrentChat(); setShowAccount(false); }}
                  disabled={messages.length === 0}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-ink/[0.06] text-sm text-ink/80 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  {t.exportChat}
                </button>
                <button onClick={clearAll}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-ink/[0.06] text-sm text-brand transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  {t.clearConvos}
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowAccount(!showAccount)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-ink/[0.04] transition">
            <div className="w-8 h-8 rounded-full glossy-icon flex items-center justify-center text-ink text-xs font-semibold">{initials}</div>
            <span className="text-sm text-ink/80 truncate">{userName}</span>
          </button>
        </div>
      </aside>

      {/* ════════ Main column ════════ */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 w-full">

        {/* Header */}
        <header className="h-14 shrink-0 glass border-b border-ink/[0.06] flex items-center justify-between px-2 sm:px-3 md:px-5 gap-1.5 sm:gap-2">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink/70 hover:text-ink hover:bg-ink/[0.06] transition"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>

          {/* Mobile center logo */}
          <div className="md:hidden flex items-center gap-2">
            <div className="w-6 h-6 rounded-md glossy-icon flex items-center justify-center text-ink text-[11px] font-bold">D</div>
            <span className="font-semibold tracking-tight shimmer-text text-sm hidden min-[400px]:inline">DocMind</span>
          </div>

          <div className="hidden md:block flex-1" />
          {onAdmin && <button className="text-sm underline" disabled={savePending || loading || uploading || !!saveError} onClick={onAdmin}>Admin</button>}
          <button className="text-sm underline" onClick={onPlans}>Plans</button>
          <button className="text-sm underline" disabled={leaving || savePending || loading || uploading} onClick={onExit}>{guest ? "Login" : "Logout"}</button>

          <select disabled={guest} value={guest ? "gemini-2.5-flash-lite" : model} onChange={(e) => setModel(e.target.value)}
            className="max-w-[6.5rem] bg-ink/[0.06] border border-ink/[0.1] rounded-lg px-2.5 md:px-3 py-1.5 text-[12.5px] md:text-sm text-ink/80 outline-none cursor-pointer hover:border-accent-40 transition">
            <option value="gemini-2.5-flash-lite">Flash-Lite</option>
            <option value="gemini-2.5-flash">Flash</option>
          </select>
        </header>

        {!guest && <p className="border-b border-ink/10 px-4 py-2 text-sm text-ink/80">{storageNotice}</p>}
        {guest && <p className="px-4 py-2 text-sm text-ink/70">Guest demo · 5 questions about the sample library guide. Sign in to upload PDFs and save chats.</p>}
        {saveError && <p className="px-4 py-2 text-sm text-rose-300" role="alert">
          {typeof saveError === "string" ? saveError : "Chat save failed."}{" "}
          <button className="underline" onClick={reload}>Reload saved history</button>
        </p>}

        {/* Messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto relative">
          <div className="max-w-5xl mx-auto px-4 md:px-5 py-6 md:py-8">

            {messages.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center text-center mt-16 md:mt-24 px-4">
                <div className="w-14 h-14 rounded-2xl glossy-icon flex items-center justify-center text-ink text-2xl font-bold mb-5">D</div>
                <h1 className="text-2xl md:text-4xl font-semibold tracking-tight shimmer-text">{t.howCanIHelp}</h1>
                <p className="text-ink/70 mt-2 text-sm">{guest ? "Try a question about the sample library guide." : "Upload a PDF to ask questions about it."}</p>
                {!guest && <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="glossy-btn mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold">
                  {t.uploadPdf}
                </button>}
                <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-md">
                  {samples.map((s) => (
                    <button key={s} onClick={() => setQuestion(s)}
                      className="px-3.5 py-2 rounded-xl glass-light water-input text-[13px] md:text-sm text-ink/80 hover:text-ink/90 hover:bg-ink/[0.06] transition">
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
                              className="w-full bg-transparent outline-none resize-none text-[15px] leading-7 text-ink/90"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg text-[13px] text-ink/80 hover:text-ink hover:bg-ink/[0.06] transition">{t.cancel}</button>
                              <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg text-[13px] glossy-btn text-ink">{t.save}</button>
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
                          className="md:opacity-0 md:group-hover:opacity-100 transition mt-1.5 px-2 py-1 rounded-lg text-[12px] text-ink/70 hover:text-ink hover:bg-ink/[0.06] flex items-center gap-1.5"
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
                      <div className="w-7 h-7 rounded-lg glossy-icon shrink-0 flex items-center justify-center text-ink text-xs font-bold mt-0.5">D</div>
                      <div className="min-w-0 flex-1">
                        {m.isError
                          ? <div className="text-[15px] text-brand bg-page border border-brand/25 rounded-xl px-4 py-2.5">{m.content}</div>
                          : <AssistantText text={m.content} animate={m.animate} streaming={m.streaming} onTick={scrollToBottom} t={t} />
                        }
                        {!m.isError && !m.streaming && <Sources sources={m.sources} t={t} />}
                        {!m.isError && !m.streaming && !m.animate && !loading && (
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

                {loading && !messages[messages.length - 1]?.streaming && (
                  <div className="flex gap-2.5 md:gap-3">
                    <div className="w-7 h-7 rounded-lg glossy-icon shrink-0 flex items-center justify-center text-ink text-xs font-bold">D</div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="w-2 h-2 rounded-full bg-accent water-dot" style={{ animationDelay: `${d * 0.18}s` }} />
                        ))}
                      </div>
                      <span role="status" className="text-[13px] text-ink/70">{slowReply ? t.slowReply : t.thinking}</span>
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
              className="fixed md:absolute bottom-28 md:bottom-32 right-4 md:right-8 z-20 w-10 h-10 rounded-full glass border border-ink/[0.12] hover:border-accent-40 flex items-center justify-center text-ink/70 hover:text-ink transition shadow-xl"
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
                  <span key={i} className="inline-flex items-center gap-1.5 text-[12px] glass-light border border-ink/[0.1] px-2.5 py-1 rounded-lg text-ink/70">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    <span className="truncate max-w-[120px] md:max-w-[160px]">{n}</span>
                    <button onClick={() => removeAttached(i)} className="ml-0.5 text-ink/70 hover:text-brand transition" aria-label="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </span>
                ))}
                {uploading && <span className="text-[12px] text-accent-strong">{t.indexing}</span>}
                {error && <span className="text-[12px] text-brand">{error}</span>}
              </div>
            )}

            <div className="flex items-end gap-1.5 md:gap-2 glass water-input rounded-2xl px-2 md:px-2.5 py-2 transition">
              {/* + menu */}
              {!guest && <div className="relative">
                {showPlus && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPlus(false)} />
                    <div className="absolute bottom-11 left-0 z-20 w-44 glass border border-ink/[0.1] rounded-xl p-1.5 shadow-2xl">
                      <button onClick={() => { setShowPlus(false); fileRef.current?.click(); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-ink/[0.06] text-sm text-ink/80 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                        {t.uploadPdf}
                      </button>
                    </div>
                  </>
                )}
                <button onClick={() => setShowPlus(!showPlus)}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-ink/75 hover:text-ink hover:bg-ink/[0.06] transition" title="Add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>}

              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder={t.messageDocMind}
                className="min-w-0 flex-1 bg-transparent outline-none resize-none text-base py-1.5 max-h-44 placeholder:text-ink/70"
              />

              <button onClick={toggleVoice} title={t.voice}
                className={`w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition ${listening ? "glossy-btn text-ink" : "text-ink/75 hover:text-ink hover:bg-ink/[0.06]"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></svg>
              </button>

              {loading ? (
                <button onClick={stop} title={t.stop}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg glossy-btn flex items-center justify-center text-ink">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              ) : (
                <button onClick={() => ask()} disabled={!question.trim()} aria-label={t.send}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg glossy-btn flex items-center justify-center text-ink">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[10.5px] md:text-[11px] text-ink/70">{t.docMindMistakes}</p>
              {question.length > 0 && (
                <p className="text-[10.5px] md:text-[11px] text-ink/70 tabular-nums">{question.length}</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ════════ Settings modal ════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
          <div className="glass border border-ink/[0.1] rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold shimmer-text">{t.settings}</h2>
              <button onClick={() => setShowSettings(false)} className="text-ink/70 hover:text-ink transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Your name */}
            <div className="flex items-center justify-between py-3 border-b border-ink/[0.06] gap-3">
              <span className="text-sm text-ink/70 shrink-0">{t.yourName}</span>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-ink/[0.06] border border-ink/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none w-44 text-right focus:border-accent-40 transition"
                maxLength={30}
              />
            </div>

            {/* Language */}
            <div className="flex items-center justify-between py-3 border-b border-ink/[0.06]">
              <span className="text-sm text-ink/70">{t.language}</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)}
                className="bg-ink/[0.06] border border-ink/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer">
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            {/* Default model */}
            <div className="flex items-center justify-between py-3 border-b border-ink/[0.06]">
              <span className="text-sm text-ink/70">{t.defaultModel}</span>
              <select disabled={guest} value={guest ? "gemini-2.5-flash-lite" : model} onChange={(e) => setModel(e.target.value)}
                className="bg-ink/[0.06] border border-ink/[0.1] rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer">
                <option value="gemini-2.5-flash-lite">Flash-Lite</option>
                <option value="gemini-2.5-flash">Flash</option>
              </select>
            </div>

            {/* Export */}
            <div className="flex items-center justify-between py-3 border-b border-ink/[0.06]">
              <span className="text-sm text-ink/70">{t.exportChat}</span>
              <button onClick={exportCurrentChat} disabled={messages.length === 0}
                className="text-sm px-3 py-1.5 rounded-lg bg-ink/[0.06] hover:bg-ink/[0.1] text-ink/80 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                .md
              </button>
            </div>

            {/* Clear */}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-ink/70">{t.clearConvos}</span>
              <button onClick={clearAll}
                className="text-sm px-3 py-1.5 rounded-lg bg-brand/15 text-brand hover:bg-brand/25 transition">
                {t.clear}
              </button>
            </div>

            <p className="text-[11px] text-ink/70 mt-2 leading-relaxed">{t.typeMore}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Sidebar chat item (with pin + delete)
════════════════════════════════════════════════════════ */
function ChatItem({ c, active, onClick, onPin, onDel, onRename, t }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.title);

  const startRename = (e) => {
    e.stopPropagation();
    setDraft(c.title);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== c.title) onRename(c.id, draft);
  };

  if (editing) {
    return (
      <div className="px-2 py-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          maxLength={60}
          className="w-full bg-ink/[0.06] border border-accent-40 rounded-lg px-2 py-1.5 text-sm outline-none text-ink"
        />
      </div>
    );
  }

  return (
    <div onClick={onClick}
      className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition ${active ? "chat-active text-ink" : "text-ink/70 hover:bg-ink/[0.04]"}`}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1" onDoubleClick={startRename}>
        {c.pinned && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-accent-strong shrink-0">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
          </svg>
        )}
        <span className="truncate">{c.title}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
        <button onClick={startRename}
          className="p-1 rounded text-ink/70 hover:text-ink/80 transition"
          title={t.rename}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onClick={(e) => onPin(c.id, e)}
          className="p-1 rounded text-ink/70 hover:text-ink/80 transition"
          title={c.pinned ? t.unpin : t.pin}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={c.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
          </svg>
        </button>
        <button onClick={(e) => onDel(c.id, e)}
          className="p-1 rounded text-ink/70 hover:text-brand transition"
          title={t.deleteChat}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}
