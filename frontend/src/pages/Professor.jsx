import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../api.js";
import { Grades, Tags, hasGrades } from "../components/Grades.jsx";
import { LoadingCard, ProfCard, Stat, one, pct } from "../components/ProfCard.jsx";
import { TrendChart } from "../components/TrendChart.jsx";

const monthYear = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

const ratingPoints = (prof) => prof.rating_history.map((h) => ({ label: monthYear(h.valid_from), value: h.avg_rating }));

function Summary({ summary }) {
  const id = useId();
  if (!summary) return null;
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 id={id} className="label-caps">Students say</h2>
      <div className="procon">
        {summary.pros?.length > 0 && <div><h3>Pros</h3><ul>{summary.pros.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {summary.cons?.length > 0 && <div><h3>Cons</h3><ul>{summary.cons.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>
      {summary.exams && <p className="kv"><b>Exams</b>{summary.exams}</p>}
      {summary.workload && <p className="kv"><b>Workload</b>{summary.workload}</p>}
    </section>
  );
}

// Long tables open short: the rows that matter first, the rest one click away.
function ShowAll({ hidden, open, setOpen, what }) {
  if (!hidden) return null;
  return <button type="button" className="link-btn show-all" aria-expanded={open} onClick={() => setOpen(!open)}>
    {open ? "Show fewer" : `Show ${hidden} more ${what}`}</button>;
}

export function Professor() {
  const { id } = useParams();
  const [allCourses, setAllCourses] = useState(false);
  const [allQuarters, setAllQuarters] = useState(false);
  const { data: p, error, loading } = useApi(`/professors/${encodeURIComponent(id)}`);
  if (loading) return <div className="detail"><LoadingCard /></div>;
  if (error) return <div className="empty"><p>{error.status === 404 ? "We don’t have this professor." : error.message}</p><Link to="/search">Search professors</Link></div>;

  // Courses with one review are mostly one-off codes ("POL13", "ADAMSMITH"): fold them away.
  const mainCourses = p.by_course.filter((c) => c.reviews > 1);
  const courses = allCourses || !mainCourses.length ? p.by_course : mainCourses;
  const quarters = [...p.by_quarter].reverse();
  const hasAttributes = p.attendance_mandatory_pct != null || p.curve_pct != null || p.workload_score != null;
  return (
    <>
      <p className="crumb"><Link to="/search">Search</Link> / {p.name}</p>
      <div className="detail">
        <ProfCard p={p} link={false} heading="h1" flip={false} />
        <div>
          {hasGrades(p.grades) && (
            <section className="panel" aria-labelledby="grades-head">
              <h2 id="grades-head" className="label-caps">Grades students reported</h2>
              <Grades grades={p.grades} />
            </section>
          )}
          {p.top_tags?.length > 0 && (
            <section className="panel" aria-labelledby="tags-head">
              <h2 id="tags-head" className="label-caps">What reviewers tag them with</h2>
              <Tags tags={p.top_tags} max={4} counts />
            </section>
          )}
          <Summary summary={p.summary} />
          {hasAttributes && (
            <section className="panel" aria-labelledby="attr-head">
              <h2 id="attr-head" className="label-caps">From reviews that mention it</h2>
              <div className="stats">
                {p.attendance_mandatory_pct != null && <Stat label="Attendance required" text={pct(p.attendance_mandatory_pct)} fill={p.attendance_mandatory_pct} />}
                {p.curve_pct != null && <Stat label="Curved" text={pct(p.curve_pct)} fill={p.curve_pct} />}
                {p.workload_score != null && <Stat label="Workload" text={`${Math.round(p.workload_score)}/100`} fill={p.workload_score} />}
              </div>
            </section>
          )}
          {p.rating_history.length > 1 && (
            <section className="panel"><TrendChart points={ratingPoints(p)} label="Overall rating over time" /></section>
          )}
          {p.by_course.length > 0 && (
            <section className="panel" aria-labelledby="course-head">
              <h2 id="course-head" className="label-caps">Ratings by course</h2>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th scope="col">Course</th><th scope="col" className="n">Reviews</th><th scope="col" className="n">Quality</th><th scope="col" className="n">Difficulty</th><th scope="col" className="n">Last reviewed</th></tr></thead>
                  <tbody>{courses.map((c) => (
                    <tr key={c.course_code}>
                      <td><Link to={`/search?tab=classes&course=${encodeURIComponent(c.course_code)}`}>{c.course_code}</Link></td>
                      <td className={`n${c.reviews === 1 ? " muted" : ""}`}>{c.reviews === 1 ? "1 review" : c.reviews}</td>
                      <td className="n">{one(c.avg_quality)}</td>
                      <td className="n">{one(c.avg_difficulty)}</td>
                      <td className="n muted">{new Date(c.last_reviewed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <ShowAll hidden={p.by_course.length - mainCourses.length && mainCourses.length ? p.by_course.length - mainCourses.length : 0}
                open={allCourses} setOpen={setAllCourses} what="courses with 1 review" />
            </section>
          )}
          {p.by_quarter.length > 0 && (
            <section className="panel" aria-labelledby="q-head">
              <h2 id="q-head" className="label-caps">Reviews by quarter, newest first</h2>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th scope="col">Quarter</th><th scope="col" className="n">Reviews</th><th scope="col" className="n">Quality</th><th scope="col" className="n">Difficulty</th></tr></thead>
                  <tbody>{(allQuarters ? quarters : quarters.slice(0, 8)).map((q) => (
                    <tr key={q.review_quarter}><td>{q.review_quarter}</td><td className="n">{q.reviews}</td><td className="n">{one(q.avg_quality)}</td><td className="n">{one(q.avg_difficulty)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <ShowAll hidden={Math.max(0, quarters.length - 8)} open={allQuarters} setOpen={setAllQuarters} what="quarters" />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
