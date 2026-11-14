import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api, useApi } from "../api.js";
import { Answer, citedNumbers, sourceMeta } from "../components/Answer.jsx";
import { LoadingCard, ProfCard } from "../components/ProfCard.jsx";

const SUGGESTIONS = [
  "Who should I take for CSE 101?",
  "Which Math professors have the fairest exams?",
  "Who are the highest rated professors in Economics?",
  "Which Psychology professors have a light workload?",
];

function remembered() {
  try { return JSON.parse(sessionStorage.getItem("ask")) || {}; } catch { return {}; }
}

export function Ask() {
  const [question, setQuestion] = useState(() => remembered().question || "");
  const [department, setDepartment] = useState(() => remembered().department || "");
  const [result, setResult] = useState(() => remembered().result || null);
  const [status, setStatus] = useState({});
  const [active, setActive] = useState(null);
  const [fresh, setFresh] = useState(false);  // deal the hand only for a new answer, not one restored on Back  // the citation number lit in both the answer and Sources
  const departments = useApi("/departments").data?.departments || [];

  // Keep the last answer when the student opens a professor and comes back.
  useEffect(() => {
    try { sessionStorage.setItem("ask", JSON.stringify({ question, department, result })); } catch { /* not persisted */ }
  }, [question, department, result]);

  async function ask(q = question) {
    if (!q.trim() || status.loading) return;
    setQuestion(q);
    setStatus({ loading: true });
    try {
      setResult(await api("/ask", { question: q.trim(), department }));
      setFresh(true);
      setStatus({});
    } catch (error) {
      setStatus({ error });
    }
  }

  const cited = result ? citedNumbers(result.answer) : new Set();
  const sources = result?.sources.filter((s) => cited.has(s.n)) || [];
  const hand = result?.professors || [];
  // One "Best pick" only: the first of the highest rated, so a tie doesn't badge two cards.
  const ratings = hand.map((p) => p.avg_rating ?? 0);
  const best = hand.length > 1 ? ratings.indexOf(Math.max(...ratings)) : -1;

  return (
    <>
      <h1 className="sr-only">Ask about UCSD professors</h1>
      <form className="ask-row" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label htmlFor="q" className="sr-only">Your question</label>
        <input id="q" className="input" value={question} maxLength={500} autoComplete="off"
          placeholder="Ask about a professor or class, like “Who should I take for CSE 101?”"
          onChange={(e) => setQuestion(e.target.value)} />
        <select className="select" aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button className="btn" type="submit" disabled={status.loading}>{status.loading ? "Asking…" : "Ask"}</button>
      </form>

      <p className="sr-only" aria-live="polite">{status.loading ? "Finding reviews…" : result ? "Answer ready." : ""}</p>

      {!result && !status.loading && !status.error && (
        <section className="intro">
          <h2>What do you want to know?</h2>
          <p className="muted">Answers come from student reviews of UCSD professors, and every claim links to the review it came from.</p>
          <div className="suggestions">
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip-toggle" onClick={() => ask(s)}>{s}</button>)}
          </div>
        </section>
      )}

      {status.error && (
        <div className="notice error gap-top" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <p>{status.error.message}</p>
            {status.error.status !== 429 && <button type="button" className="btn ghost small retry" onClick={() => ask()}>Try again</button>}
          </div>
        </div>
      )}

      {status.loading ? (
        <>
          <div className="hand">{[1, 2, 3].map((i) => <LoadingCard key={i} />)}</div>
          <div className="below"><div className="stack">{[90, 100, 70].map((w) => <div key={w} className="skeleton" style={{ height: 16, width: `${w}%` }} />)}</div></div>
        </>
      ) : result && (
        <>
          {hand.length > 0 && (
            <div key={result.answer} className={`hand${fresh ? " dealt" : ""} count-${hand.length}`}>
              {hand.map((p, i) => <ProfCard key={p.professor_id} p={p} rank={hand.length > 1 ? i + 1 : null} best={i === best} deal={fresh ? 120 + i * 70 : false} />)}
            </div>
          )}
          <div className="below">
            <section aria-labelledby="short-answer">
              <h2 id="short-answer" className="label-caps">The short answer</h2>
              <Answer text={result.answer} sources={sources} active={active} setActive={setActive} />
            </section>
            {sources.length > 0 && (
              <aside aria-labelledby="sources-head">
                <h2 id="sources-head" className="label-caps">Sources</h2>
                <ol className="sources">
                  {sources.map((s) => (
                    <li key={s.n} id={`source-${s.n}`} className={`source${active === s.n ? " on" : ""}`}
                      onMouseEnter={() => setActive(s.n)} onMouseLeave={() => setActive(null)}>
                      <span className="cite" aria-hidden="true">{s.n}</span>
                      <q>{s.quote}</q>
                      <span className="meta">{sourceMeta(s)}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}
