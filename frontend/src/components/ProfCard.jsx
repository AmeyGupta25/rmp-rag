import { Bookmark, Check, RotateCw, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api.js";
import { useCompare } from "../compare.jsx";
import { useShortlist } from "../shortlist.jsx";
import { Grades, MIN_GRADES, Tags } from "./Grades.jsx";

export const one = (v) => (v == null ? "—" : Number(v).toFixed(1));
export const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
export const spaced = (code) => code.replace(/^([A-Z]+)(\d)/, "$1 $2");  // "CSE101" -> "CSE 101"
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const FEW = 5;  // below this many ratings the average is shown, but muted and labelled

export function Stat({ label, text, fill, tone = "gray" }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      {fill == null ? <span /> : <div className={`bar ${tone}`} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} /></div>}
      <span className="val">{text}</span>
    </div>
  );
}

function SaveButton({ id, name }) {
  const { ids, toggle } = useShortlist();
  const on = ids.includes(id);
  return (
    <button type="button" className={`save-btn${on ? " on" : ""}`} aria-pressed={on}
      aria-label={on ? `Remove ${name} from your shortlist` : `Save ${name} to your shortlist`}
      title={on ? "Saved to your shortlist" : "Save to your shortlist"} onClick={() => toggle(id)}>
      <Bookmark size={18} fill={on ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

export function CompareButton({ id, name }) {
  const { ids, toggle } = useCompare();
  const on = ids.includes(id);
  const full = !on && ids.length >= 3;
  return (
    <button type="button" className="btn ghost small" aria-pressed={on} disabled={full}
      aria-label={full ? `Compare is full: remove a professor to add ${name}` : `${on ? "Remove" : "Add"} ${name} ${on ? "from" : "to"} compare`}
      onClick={() => toggle(id)}>
      {on && <Check size={15} aria-hidden="true" />}{on ? "In compare" : full ? "Compare full" : "Compare"}
    </button>
  );
}

// Counts the score up from 0 when the hand is dealt, starting when its own card appears (deal = ms delay).
// Without a deal it shows the final value straight away.
function useCountUp(value, deal) {
  const run = deal !== false && deal != null;
  const [shown, setShown] = useState(() => (run && value != null && !still() ? 0 : value));
  useEffect(() => {
    if (!run || value == null || still()) { setShown(value); return; }
    let raf, start;
    const step = (t) => {
      start ??= t;
      const k = Math.min(1, (t - start) / 600);
      setShown(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    const wait = setTimeout(() => { raf = requestAnimationFrame(step); }, deal);
    return () => { clearTimeout(wait); cancelAnimationFrame(raf); };
  }, [value, run, deal]);
  return shown;
}

// The back explains what the class is like and why to pick or avoid them. The verdict (the first pro)
// is already on the front, so a summary alone, grades or attendance/curve shares are what earn a flip.
const hasBack = (p) => p.verdict != null || p.graded_reviews >= MIN_GRADES || p.attendance_mandatory_pct != null || p.curve_pct != null;

function Back({ p, flipped, onFlip, flipRef, heading: H }) {
  const Sub = `h${Math.min(6, Number(H[1]) + 1)}`;  // one level under the card's name, never skipping one
  const { data, loading } = useApi(`/professors/${encodeURIComponent(p.professor_id)}`);
  const s = data?.summary;
  const pros = s?.pros?.slice(1, 4) ?? [];
  const facts = [["Attendance required", p.attendance_mandatory_pct], ["Curved", p.curve_pct]].filter(([, v]) => v != null);
  const classy = s?.exams || s?.workload || facts.length > 0;
  // Same rule as the Professor page: one-review courses are mostly one-off codes students typed.
  const courses = (data?.by_course ?? []).filter((c) => c.reviews > 1).slice(0, 3);
  return (
    <div className="side back" aria-hidden={!flipped} inert={!flipped || undefined}>
      <div className="card-head"><div><p className="back-name">{p.name}</p><p className="card-dept">From student reviews</p></div></div>
      {loading ? <div className="stack">{[90, 75, 85].map((w) => <div key={w} className="skeleton" style={{ height: 14, width: `${w}%` }} />)}</div> : (
        <div className="back-body">
          {pros.length > 0 && <div><Sub className="back-h">Why pick</Sub><ul>{pros.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {s?.cons?.length > 0 && <div><Sub className="back-h">Watch out</Sub><ul>{s.cons.slice(0, 2).map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {classy && (
            <div>
              <Sub className="back-h">The class</Sub>
              {s?.exams && <p className="kv"><b>Exams</b>{s.exams}</p>}
              {s?.workload && <p className="kv"><b>Workload</b>{s.workload}</p>}
              {facts.length > 0 && <ul className="tags facts">{facts.map(([l, v]) => <li key={l} className="tag">{l} <b className="num">{pct(v)}</b></li>)}</ul>}
            </div>
          )}
          {courses.length > 0 && (
            <div>
              <Sub className="back-h">Courses</Sub>
              <ul className="back-courses">
                {courses.map((c) => (
                  <li key={c.course_code}>
                    <Link className="course-code" to={`/search?tab=classes&course=${encodeURIComponent(c.course_code)}`}>{spaced(c.course_code)}</Link>
                    <span><b className="num">{one(c.avg_quality)}</b> / 5</span>
                    {c.last_term && <span className="term">Last taught {c.last_term}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Grades grades={data?.grades} />
        </div>
      )}
      <div className="card-foot">
        <span />
        <button ref={flipRef} type="button" className="btn ghost small" onClick={onFlip}><RotateCw size={15} aria-hidden="true" />Flip back</button>
      </div>
    </div>
  );
}

export function ProfCard({ p, rank, best, badge = "Best pick", link = true, heading: H = "h2", flip = true, deal = false }) {
  const { ids } = useCompare();
  const [flipped, setFlipped] = useState(false);
  const [opened, setOpened] = useState(false);  // the back mounts (and fetches) on first flip, then stays
  const frontBtn = useRef(null), backBtn = useRef(null);
  const score = useCountUp(p.avg_rating, deal);
  const canFlip = flip && hasBack(p);
  const few = p.num_ratings < FEW;

  function turn() {
    setOpened(true);
    setFlipped((f) => !f);
    requestAnimationFrame(() => (flipped ? frontBtn : backBtn).current?.focus());
  }

  const name = link ? <Link className="card-name" to={`/professors/${p.professor_id}`}>{p.name}</Link> : <span className="card-name">{p.name}</span>;
  return (
    <div className="slot">
      <article className={`card${best ? " best" : ""}${ids.includes(p.professor_id) ? " picked" : ""}${flipped ? " flipped" : ""}`}>
        <div className="side front" aria-hidden={flipped || undefined} inert={flipped || undefined}>
          <div className="card-head">
            <div>
              {rank && <div className="rank num">No. {rank}</div>}
              <H className="card-title">{name}</H>
              <div className="card-dept">{p.department}</div>
            </div>
            <div className="head-actions">
              {best && <span className="badge"><Star size={12} fill="currentColor" aria-hidden="true" />{badge}</span>}
              <SaveButton id={p.professor_id} name={p.name} />
            </div>
          </div>
          <div className={`score${few ? " few" : ""}`}>
            <span className="num">{one(score)}</span><span className="of">/ 5 overall</span>
          </div>
          {few && <p className="few-note">Based on {p.num_ratings} rating{p.num_ratings === 1 ? "" : "s"}, so treat it as a hint.</p>}
          <div className="stats">
            <Stat label="Difficulty" text={one(p.avg_difficulty)} fill={p.avg_difficulty == null ? null : p.avg_difficulty * 20} />
            {p.would_take_again != null && <Stat label="Would take again" text={pct(p.would_take_again)} fill={p.would_take_again} tone="green" />}
            {p.graded_reviews >= MIN_GRADES && <Stat label="A- or better" text={pct(100 * p.grade_a_pct)} fill={100 * p.grade_a_pct} tone="violet" />}
            <Stat label="Ratings" text={p.num_ratings} />
          </div>
          <Tags tags={p.top_tags} />
          {p.verdict && <p className="verdict">{p.verdict}</p>}
          <div className="card-foot">
            {p.common_exam_style ? <span>Exams: {p.common_exam_style.replace("_", " ")}</span> : <span />}
            <div className="foot-actions">
              {canFlip && <button ref={frontBtn} type="button" className="btn ghost small" aria-label={`Flip ${p.name}'s card for details`} onClick={turn}><RotateCw size={15} aria-hidden="true" />Flip</button>}
              <CompareButton id={p.professor_id} name={p.name} />
            </div>
          </div>
        </div>
        {canFlip && opened && <Back p={p} flipped={flipped} onFlip={turn} flipRef={backBtn} heading={H} />}
      </article>
    </div>
  );
}

export function LoadingCard() {
  return <div className="slot"><div className="card loading" aria-hidden="true"><div className="skeleton" style={{ height: 24, width: "60%" }} /><div className="skeleton" style={{ height: 52, width: "40%" }} /><div className="skeleton" style={{ height: 90 }} /></div></div>;
}
