import { ArrowLeft, Check, Plus, Star, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useCompare } from "../compare.jsx";
import { Grades, MIN_GRADES, hasGrades } from "../components/Grades.jsx";
import { one, pct } from "../components/ProfCard.jsx";
import { rowWinner, verdict } from "../compare-rules.js";

// better (see compare-rules.js): +1 higher wins, -1 lower wins, 0 never judged. Only rows where "better" isn't a
// matter of taste get a winner (and a name in the verdict); how many ratings someone has is how sure we are,
// not a merit, and whether attendance, a curve or a heavy workload is bad depends on the student.
const GROUPS = [
  ["Ratings", [
    ["Overall rating", "avg_rating", one, 1, "Best rated"],
    ["Difficulty (lower is easier)", "avg_difficulty", one, -1, "Easiest"],
    ["Would take again", "would_take_again", pct, 1, "Most would take again"],
    ["Number of ratings", "num_ratings", (v) => v ?? "—", 0],
  ]],
  ["The class", [
    ["A- or better", "a_or_better", pct, 1, "Best grades"],
    ["Attendance required", "attendance_mandatory_pct", pct, 0],
    ["Curved", "curve_pct", pct, 0],
    ["Workload (out of 100)", "workload_score", (v) => (v == null ? "—" : `${Math.round(v)}/100`), 0],
  ]],
];

function Said({ items, all }) {
  if (!items?.length) return <span className="muted">—</span>;
  return <ul>{(all ? items : items.slice(0, 2)).map((x) => <li key={x}>{x}</li>)}</ul>;
}

export function Compare() {
  const { ids, toggle } = useCompare();
  const [profs, setProfs] = useState({});
  const [error, setError] = useState(null);
  const [allSaid, setAllSaid] = useState(false);
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  // Straight back to the search they came from (filters and scroll intact); from anywhere else, a fresh Search.
  const exit = () => (from?.startsWith("/search") ? navigate(-1) : navigate("/search"));

  useEffect(() => {
    setError(null);
    ids.filter((id) => !profs[id]).forEach((id) =>
      api(`/professors/${encodeURIComponent(id)}`).then(
        (p) => setProfs((cur) => ({ ...cur, [id]: p })),
        (e) => (e.status === 404 ? toggle(id) : setError(e)),  // drop picks that no longer exist
      ));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = (
    <div className="cmp-head">
      <h1>Compare</h1>
      <div className="list-actions">
        {ids.length > 0 && ids.length < 3 && <Link className="btn ghost small" to="/search"><Plus size={16} aria-hidden="true" />Add a professor</Link>}
        <button type="button" className="btn ghost small" onClick={exit}><ArrowLeft size={16} aria-hidden="true" />Back to search</button>
      </div>
    </div>
  );
  if (ids.length < 2) {
    return <>{head}<div className="empty"><p>Pick {ids.length ? "one more professor" : "two or three professors"} with the Compare button on any card to see them side by side.</p><Link to="/search">Find professors</Link></div></>;
  }
  if (error) return <>{head}<div className="notice error" role="alert">{error.message}</div></>;

  const list = ids.map((id) => profs[id] && {
    ...profs[id], a_or_better: profs[id].graded_reviews >= MIN_GRADES ? 100 * profs[id].grade_a_pct : null,
  });
  if (!list.every(Boolean)) return <>{head}<div className="skeleton cmp-skeleton" aria-hidden="true" /></>;

  // Rows nobody has data for say nothing, so they're left out (and so is a group left empty).
  const groups = GROUPS.map(([name, rows]) => [name, rows.filter(([, key]) => list.some((p) => p[key] != null))]).filter(([, rows]) => rows.length);
  // One winner per category, named in the verdict; the gold frame goes to whoever is best rated.
  const wins = verdict(list, groups.flatMap(([, rows]) => rows));
  const leader = list.indexOf(wins.find(([t]) => t === "Best rated")?.[1]);
  const byProf = list.map((p) => [p, wins.filter(([, w]) => w === p).map(([t]) => t)]).filter(([, ts]) => ts.length);
  const summaries = list.some((p) => p.summary);
  const more = list.some((p) => p.summary?.pros?.length > 2 || p.summary?.cons?.length > 2);
  const group = (name) => <tr className="cmp-group"><th scope="colgroup" colSpan={list.length + 1}>{name}</th></tr>;

  return (
    <>
      {head}
      {wins.length ? (
        <ul className="cmp-verdict" aria-label="Who wins what">
          {byProf.map(([p, ts]) => <li key={p.professor_id}><b>{p.name}</b>: {ts.join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</li>)}
        </ul>
      ) : <p className="cmp-verdict">Too close to call: nobody is clearly ahead on any measure.</p>}
      <p className="cmp-how">How we count: a check marks the one clear best value for rating, difficulty, would take again and A- or better. Number of ratings, attendance, curve and workload are shown but never judged, since what’s better there depends on you.</p>
      <div className="scroll-x cmp-scroll">
        <table className="cmp" style={{ "--n": list.length }}>
          <thead>
            <tr>
              <td className="cmp-corner" />
              {list.map((p, i) => (
                <th key={p.professor_id} scope="col">
                  <div className={`cmp-prof${i === leader ? " lead" : ""}`}>
                    <div className="cmp-prof-top">
                      <Link className="card-name" to={`/professors/${p.professor_id}`}>{p.name}</Link>
                      <button type="button" className="icon-btn" aria-label={`Remove ${p.name} from compare`} onClick={() => toggle(p.professor_id)}><X size={16} aria-hidden="true" /></button>
                    </div>
                    <span className="card-dept">{p.department}</span>
                    <span className="cmp-score"><span className="num">{one(p.avg_rating)}</span><span className="of">/ 5</span></span>
                    {i === leader && <span className="badge"><Star size={12} fill="currentColor" aria-hidden="true" />Best rated</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([name, rows]) => (
              <Fragment key={name}>
                {group(name)}
                {rows.map(([label, key, fmt, dir]) => {
                  const best = rowWinner(list, key, dir);
                  return (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {list.map((p) => {
                        const win = best != null && p[key] === best;
                        return (
                          <td key={p.professor_id} className={`cmp-val${win ? " win" : ""}`}>
                            <span className="num">{fmt(p[key])}</span>{win && <Check size={15} role="img" aria-label="Better" />}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {list.some((p) => hasGrades(p.grades)) && <>
              {group("Grades students reported")}
              <tr><th scope="row">Breakdown</th>{list.map((p) => <td key={p.professor_id}>{hasGrades(p.grades) ? <Grades grades={p.grades} /> : <span className="muted">Too few reports</span>}</td>)}</tr>
            </>}
            {summaries && <>
              <tr className="cmp-group"><th scope="colgroup" colSpan={list.length + 1}>
                Students say
                {more && <button type="button" className="link-btn" aria-expanded={allSaid} onClick={() => setAllSaid(!allSaid)}>{allSaid ? "Show fewer" : "Show all"}</button>}
              </th></tr>
              <tr className="cmp-said"><th scope="row">Pros</th>{list.map((p) => <td key={p.professor_id}><Said items={p.summary?.pros} all={allSaid} /></td>)}</tr>
              <tr className="cmp-said"><th scope="row">Cons</th>{list.map((p) => <td key={p.professor_id}><Said items={p.summary?.cons} all={allSaid} /></td>)}</tr>
              {list.some((p) => p.summary?.exams) && <tr className="cmp-said"><th scope="row">Exams</th>{list.map((p) => <td key={p.professor_id}>{p.summary?.exams || <span className="muted">—</span>}</td>)}</tr>}
            </>}
          </tbody>
        </table>
      </div>
    </>
  );
}
