import React, { useEffect, useState } from "react";

/* ════════════════════════════════════════════════════════
   Inline-markdown (bold, code) helper
════════════════════════════════════════════════════════ */
function inline(text, k0 = 0) {
  const parts = [];
  const regex = /(`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|~~[^~]+~~)/g;
  let last = 0, m, key = k0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`"))
      parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-ink/10 text-accent-soft text-[13px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const mid = tok.indexOf("](");
      const label = tok.slice(1, mid), href = tok.slice(mid + 2, -1);
      parts.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer"
          className="text-accent-strong underline underline-offset-2 decoration-accent-40 hover:decoration-accent-strong transition">
          {label}
        </a>
      );
    }
    else if (tok.startsWith("***"))
      parts.push(<strong key={key++} className="font-semibold italic text-ink">{tok.slice(3, -3)}</strong>);
    else if (tok.startsWith("**"))
      parts.push(<strong key={key++} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("~~"))
      parts.push(<del key={key++} className="text-ink/75">{tok.slice(2, -2)}</del>);
    else
      parts.push(<em key={key++} className="italic text-ink/90">{tok.slice(1, -1)}</em>);
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
    <div className="my-3 rounded-xl border border-ink/[0.08] overflow-hidden bg-page backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ink/[0.06] bg-ink/[0.02]">
        <span className="text-[11px] uppercase tracking-wider text-ink/70">{lang || "code"}</span>
        <button onClick={copy} className="text-[11px] text-ink/75 hover:text-ink transition flex items-center gap-1.5">
          {copied ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>{t.copied}</>
          ) : (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{t.copy}</>
          )}
        </button>
      </div>
      <pre className="px-3.5 py-2.5 text-[12.5px] sm:text-[13px] leading-6 overflow-x-auto text-ink/85"><code>{code}</code></pre>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Text block (paragraphs, lists, headings)
════════════════════════════════════════════════════════ */
function TableBlock({ rows, k }) {
  const parseRow = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  return (
    <div key={k} className="my-3 overflow-x-auto rounded-xl border border-ink/[0.08]">
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr className="bg-ink/[0.05]">
            {header.map((h, i) => (
              <th key={i} className="text-left font-semibold text-ink px-3.5 py-2 border-b border-ink/[0.08] whitespace-nowrap">
                {inline(h, i * 50)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="odd:bg-transparent even:bg-ink/[0.02] hover:bg-ink/[0.04] transition">
              {header.map((_, ci) => (
                <td key={ci} className="px-3.5 py-2 border-b border-ink/[0.05] text-ink/75 align-top">
                  {inline(r[ci] ?? "", ri * 100 + ci)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextBlock({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let ul = [], ol = [], quote = [], table = [];

  const flushUl = () => {
    if (ul.length) {
      blocks.push(<ul key={"u" + blocks.length} className="list-disc pl-5 space-y-1.5 my-2.5 marker:text-ink/70">{ul}</ul>);
      ul = [];
    }
  };
  const flushOl = () => {
    if (ol.length) {
      blocks.push(<ol key={"o" + blocks.length} className="list-decimal pl-5 space-y-1.5 my-2.5 marker:text-ink/70">{ol}</ol>);
      ol = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote key={"q" + blocks.length}
          className="my-2.5 pl-3.5 border-l-2 border-accent-40 text-ink/80 italic space-y-1">
          {quote}
        </blockquote>
      );
      quote = [];
    }
  };
  const flushTable = () => {
    if (table.length >= 2 && /^\s*\|?[\s:|-]+\|?\s*$/.test(table[1])) {
      blocks.push(<TableBlock key={"t" + blocks.length} k={"t" + blocks.length} rows={table} />);
    } else {
      table.forEach((line, i) =>
        blocks.push(<p key={"tp" + blocks.length + "_" + i} className="mb-2.5">{inline(line, i * 100)}</p>)
      );
    }
    table = [];
  };
  const flushAll = () => { flushUl(); flushOl(); flushQuote(); flushTable(); };

  lines.forEach((line, i) => {
    const tx = line.trim();
    const isTableLine = /^\|.*\|/.test(tx);

    if (table.length && !isTableLine) flushTable();

    if (isTableLine) {
      flushUl(); flushOl(); flushQuote();
      table.push(tx);
    } else if (/^[*-]\s+/.test(tx)) {
      flushOl(); flushQuote();
      ul.push(<li key={i} className="pl-1">{inline(tx.replace(/^[*-]\s+/, ""), i * 100)}</li>);
    } else if (/^\d+[.)]\s+/.test(tx)) {
      flushUl(); flushQuote();
      ol.push(<li key={i} className="pl-1">{inline(tx.replace(/^\d+[.)]\s+/, ""), i * 100)}</li>);
    } else if (/^>\s?/.test(tx)) {
      flushUl(); flushOl();
      quote.push(<p key={i}>{inline(tx.replace(/^>\s?/, ""), i * 100)}</p>);
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(tx)) {
      flushAll();
      blocks.push(<hr key={i} className="my-4 border-ink/[0.08]" />);
    } else if (tx === "") {
      flushAll();
    } else if (/^#{1,4}\s/.test(tx)) {
      flushAll();
      const level = tx.match(/^#+/)[0].length;
      const size = level === 1 ? "text-[17px]" : level === 2 ? "text-[16px]" : "text-[15px]";
      blocks.push(<p key={i} className={`font-semibold ${size} mt-3 mb-1.5 text-ink`}>{inline(tx.replace(/^#{1,4}\s/, ""), i * 100)}</p>);
    } else {
      flushUl(); flushOl(); flushQuote();
      blocks.push(<p key={i} className="mb-2.5">{inline(tx, i * 100)}</p>);
    }
  });
  flushAll();
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
export function AssistantText({ text, animate, streaming, onTick, t }) {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (streaming) { onTick && onTick(); return; }
    if (!animate) { setShown(text); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 4;
      setShown(text.slice(0, i));
      onTick && onTick();
      if (i >= text.length) { setShown(text); clearInterval(id); }
    }, 12);
    return () => clearInterval(id);
  }, [text, animate, streaming]); // eslint-disable-line

  // Real streaming: render live markdown + blinking cursor (like ChatGPT)
  if (streaming) {
    return (
      <div className="relative">
        <Markdown text={text} t={t} />
        <span className="inline-block w-[2px] h-[15px] align-middle bg-accent ml-0.5 animate-pulse" />
      </div>
    );
  }

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
export function Sources({ sources, t }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 text-[13px] text-ink/75 hover:text-ink/80 transition"
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
              className="flex gap-3 rounded-xl glass-light border border-ink/[0.08] px-3.5 py-3 hover:border-accent-40 hover:bg-ink/[0.05] transition">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-accent-15 border border-accent-20 flex items-center justify-center text-accent-strong">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-accent-strong truncate">{s.source}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink/70 bg-ink/[0.06] px-1.5 py-0.5 rounded">
                    {i + 1}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink/45 mt-1 leading-relaxed line-clamp-3">{s.snippet}</p>
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
export function MessageActions({ content, onRegenerate, t }) {
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
        className="px-2 py-1.5 rounded-lg text-ink/70 hover:text-ink hover:bg-ink/[0.06] transition text-[12px] flex items-center gap-1.5">
        {copied ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>{t.copied}</>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        )}
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} title={t.regenerate}
          className="px-2 py-1.5 rounded-lg text-ink/70 hover:text-ink hover:bg-ink/[0.06] transition text-[12px] flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
        </button>
      )}
    </div>
  );
}
