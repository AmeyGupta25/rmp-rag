import { X } from "lucide-react";
import { useState } from "react";

// Renders the model's markdown subset (paragraphs, bullets, **bold**, [n] citations) as React
// elements, never as HTML, so nothing in an answer can inject markup.
// shortcut: no markdown tables or headings beyond plain lines; add them if answers start using them.

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const CITES = /^(?:\s*\[\d+\])+$/;
const narrow = () => window.matchMedia("(max-width: 900px)").matches;

export const citedNumbers = (text) => new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));

export function sourceMeta(s) {
  return [s.professor, s.course !== "Unknown" && s.course, s.reviewed].filter(Boolean).join(" · ");
}

// active/setActive link a chip and its source card both ways (hover or focus on either lights both).
export function Answer({ text, sources, active, setActive }) {
  const [open, setOpen] = useState(null);  // {block, n}: on phones a chip opens its quote under the paragraph
  const byNumber = Object.fromEntries(sources.map((s) => [s.n, s]));

  function chip(n, block) {
    const on = active === n || (open?.block === block && open.n === n);
    return (
      <a key={n} className={`cite${on ? " on" : ""}`} href={`#source-${n}`} aria-label={`Source ${n}`}
        aria-expanded={narrow() ? open?.block === block && open.n === n : undefined}
        onMouseEnter={() => setActive(n)} onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(n)} onBlur={() => setActive(null)}
        onClick={(e) => {
          if (!narrow() || !byNumber[n]) return;  // desktop: the sources column is beside the answer
          e.preventDefault();
          setOpen((o) => (o?.block === block && o.n === n ? null : { block, n }));
        }}>{n}</a>
    );
  }

  function inline(str, block) {
    return str.split(/(\*\*[^*]+\*\*|(?:\s*\[\d+\])+)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{inline(part.slice(2, -2), block)}</strong>;
      // A run like [2][5][6] stays together, so no chip wraps onto a line alone.
      if (CITES.test(part)) return <span key={i} className="cites">{" "}{[...part.matchAll(/\d+/g)].map((m) => chip(Number(m[0]), block))}</span>;
      return part;
    });
  }

  function quote(block) {
    const s = open?.block === block && byNumber[open.n];
    if (!s) return null;
    return (
      <figure className="inline-quote" key={`q${block}`}>
        <blockquote><q>{s.quote}</q></blockquote>
        <figcaption><span className="cite on" aria-hidden="true">{s.n}</span>{sourceMeta(s)}</figcaption>
        <button type="button" className="icon-btn" aria-label="Close quote" onClick={() => setOpen(null)}><X size={16} aria-hidden="true" /></button>
      </figure>
    );
  }

  // gpt-oss writes names with narrow no-break spaces, which this font draws almost zero-width
  const blocks = text.replace(/[  ]/g, " ").trim().split(/\n\s*\n/);
  return (
    <div className="answer">
      {blocks.map((block, b) => {
        const lines = block.split("\n").map((l) => l.replace(/^#+\s*/, "")).filter((l) => l.trim());
        const body = lines.every((l) => BULLET.test(l))
          ? <ul key={b}>{lines.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ""), `${b}.${j}`)}{quote(`${b}.${j}`)}</li>)}</ul>
          : <p key={b}>{inline(lines.join(" "), b)}</p>;
        return lines.every((l) => BULLET.test(l)) ? body : [body, quote(b)];
      })}
    </div>
  );
}
