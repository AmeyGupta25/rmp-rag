import { ArrowLeft, ChevronDown, Search as SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../api.js";
import { sortRows } from "../sort-rows.js";
import { ErrorNotice } from "../components/ErrorNotice.jsx";
import { CompareButton, FEW, LoadingCard, ProfCard, one, spaced } from "../components/ProfCard.jsx";

const COURSE = /^\s*([a-z]{2,5})\s*(\d{1,3}[a-z]{0,2})\s*$/i;  // "CSE 101", "math20c"
const SORTS = [
  ["rating", "Top rated", "Rating, adjusted so a few ratings can't top the list"],
  ["grades", "Best grades", "Share of students who reported an A- or better"],
];
// Ratings-range stops: buckets are [edge, next edge); the last stop means "no limit".
const EDGES = [0, 5, 10, 20, 50, 100, Infinity];
const BUCKETS = ["0–4", "5–9", "10–19", "20–49", "50–99", "100+"];
const RATING = [["3.0", "3+"], ["4.0", "4+"], ["4.5", "4.5+"]];
const DIFFICULTY = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
const WTA = [["70", "70%+"], ["85", "85%+"]];
const TABS = [["professors", "Professors"], ["classes", "Classes"]];
const STYLE = [["no_attendance", "Attendance optional"], ["curved", "Usually curved"], ["light_workload", "Light workload"]];

// Every write starts from the live URL, never from a copy an older render captured
// (that copy is what made a filter click get undone by the search box's delayed write).
function useFilters() {
  const [params, setParams] = useSearchParams();
  const update = (change, replace = true) => setParams(() => {
    const p = new URLSearchParams(window.location.search);
    change(p);
    return p;
  }, { replace });
  return {
    params,
    update,
    set: (k, v) => update((p) => (v ? p.set(k, v) : p.delete(k))),
    pick: (k, v) => update((p) => (p.get(k) === v ? p.delete(k) : p.set(k, v))),  // one choice; tap again to clear
    flip: (k, v) => update((p) => {  // many choices in one group
      const all = p.getAll(k);
      p.delete(k);
      (all.includes(v) ? all.filter((x) => x !== v) : [...all, v]).forEach((x) => p.append(k, x));
    }),
    clear: () => update((p) => [...new Set(p.keys())].filter((k) => !["q", "sort", "tab"].includes(k)).forEach((k) => p.delete(k))),
  };
}

function Toggle({ on, count, onClick, children }) {
  return (
    <button type="button" className="chip-toggle" aria-pressed={on} disabled={!on && count === 0} onClick={onClick}>
      {children}{count != null && <small className="num">{count}</small>}
    </button>
  );
}

// One filter category as a dropdown: the button names what's chosen, the panel holds the toggles.
// Closes on Esc (focus returns to the button), on a click outside, or when another one opens.
function Dropdown({ id, label, summary, open, setOpen, onClear, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      ref.current?.querySelector(".dd-btn")?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, setOpen]);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={`dd-btn${summary ? " on" : ""}`} aria-expanded={open} aria-controls={`dd-${id}`}
        onClick={() => setOpen(open ? null : id)}>
        <span className="dd-text">{label}{summary && <>: <span className="dd-summary">{summary}</span></>}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={`dd-${id}`} className="dd-panel" role="group" aria-label={label}>
          {children}
          {summary && <button type="button" className="link-btn dd-clear" onClick={onClear}>Clear {label.toLowerCase()}</button>}
        </div>
      )}
    </div>
  );
}

function DepartmentList({ facets, chosen, flip }) {
  const [find, setFind] = useState("");
  const names = Object.keys(facets)
    .filter((d) => !find || d.toLowerCase().includes(find.toLowerCase()))
    .sort((a, b) => chosen.includes(b) - chosen.includes(a) || facets[b] - facets[a]);
  return (
    <>
      <input className="input find" type="search" placeholder="Find a department" aria-label="Find a department"
        value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
      <div className="chips dd-scroll">
        {names.map((d) => <Toggle key={d} on={chosen.includes(d)} count={facets[d]} onClick={() => flip("department", d)}>{d}</Toggle>)}
        {!names.length && <p className="muted">No department matches “{find}”.</p>}
      </div>
    </>
  );
}

function rangeText(lo, hi) {
  if (lo === 0 && hi === EDGES.length - 1) return "";
  if (hi === EDGES.length - 1) return `${EDGES[lo]}+`;
  if (lo === 0) return `up to ${EDGES[hi] - 1}`;
  return `${EDGES[lo]}–${EDGES[hi] - 1}`;
}

// How many ratings a professor has, as a range: a histogram of the current results (click a bar to pick
// that bucket) over two linked sliders. Dragging is local; the URL is written after a short pause.
function RatingsRange({ params, set, hist, drop }) {
  const last = EDGES.length - 1;
  const fromUrl = () => {
    const lo = EDGES.indexOf(Number(params.get("min_ratings") ?? 0));
    const hi = params.has("max_ratings") ? EDGES.indexOf(Number(params.get("max_ratings")) + 1) : last;
    return [lo < 0 ? 0 : lo, hi < 1 ? last : hi];
  };
  const [[lo, hi], setRange] = useState(fromUrl);
  const key = `${params.get("min_ratings")}-${params.get("max_ratings")}`;
  useEffect(() => setRange(fromUrl()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const [ulo, uhi] = fromUrl();
    if (ulo === lo && uhi === hi) return;
    const t = setTimeout(() => {
      set("min_ratings", lo ? String(EDGES[lo]) : "");
      set("max_ratings", hi < last ? String(EDGES[hi] - 1) : "");
    }, 250);
    return () => clearTimeout(t);
  }, [lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = BUCKETS.map((_, i) => hist[String(EDGES[i])] ?? 0);
  const peak = Math.max(1, ...counts);
  return (
    <Dropdown {...drop} label="Ratings" summary={rangeText(...fromUrl())} onClear={() => setRange([0, last])}>
      <p className="dd-hint">How many students rated them. More ratings means a more reliable score.</p>
      <div className="histo">
        {counts.map((n, i) => (
          <button key={i} type="button" className={`histo-bar${i >= lo && i < hi ? " in" : ""}`}
            aria-label={`${BUCKETS[i]} ratings: ${n} professors`} onClick={() => setRange([i, i + 1])}>
            <span style={{ height: `${Math.max(4, (100 * n) / peak)}%` }} />
          </button>
        ))}
      </div>
      <div className="range">
        <input type="range" min="0" max={last} step="1" value={lo} aria-label="Fewest ratings"
          aria-valuetext={`${EDGES[lo]} ratings`} onChange={(e) => setRange([Math.min(+e.target.value, hi - 1), hi])} />
        <input type="range" min="0" max={last} step="1" value={hi} aria-label="Most ratings"
          aria-valuetext={hi === last ? "no limit" : `${EDGES[hi] - 1} ratings`} onChange={(e) => setRange([lo, Math.max(+e.target.value, lo + 1)])} />
      </div>
      <div className="range-ticks" aria-hidden="true">
        {["0", "5", "10", "20", "50", "100", "Any"].map((t, i) => <span key={t} style={{ left: `${(100 * i) / last}%` }}>{t}</span>)}
      </div>
      <p className="range-now" aria-live="polite">{rangeText(lo, hi) ? `${rangeText(lo, hi)} ratings` : "Any number of ratings"}</p>
    </Dropdown>
  );
}

// One row per instructor: their reviews for this course joined with the terms the schedule lists them.
function byInstructor({ professors, offerings }) {
  const list = professors.map((p) => ({ ...p, terms: [] }));
  for (const o of offerings) {
    let row = list.find((r) => (o.professor_id ? r.professor_id === o.professor_id : r.name === o.schedule_instructor));
    if (!row) list.push(row = { professor_id: o.professor_id, name: o.name || o.schedule_instructor, terms: [] });
    if (!row.terms.includes(o.term)) row.terms.push(o.term);
  }
  return list;
}

// Course-table columns you can sort by: [key, label, phone label, direction (1 = high first, -1 = low first)].
const COURSE_COLS = [["reviews", "Reviews here", "Reviews", 1], ["avg_quality", "Quality", "Quality", 1], ["avg_difficulty", "Difficulty", "Difficulty", -1]];

function Course({ code }) {
  const { data, error, loading, retry } = useApi(`/courses/${encodeURIComponent(code)}`);
  const [by, setBy] = useState("reviews");
  if (error) return <ErrorNotice error={error} retry={retry} />;
  if (loading) return <div className="skeleton course-skeleton" aria-hidden="true" />;
  const dir = COURSE_COLS.find(([k]) => k === by)[3];
  const rows = sortRows(byInstructor(data), by, dir);
  // Columns nobody has data for are left out, like on Compare.
  const anyTerms = rows.some((r) => r.terms.length);
  // Rate My Professors sometimes has two profiles with one name (one per department); say which is which.
  const twins = new Set(rows.map((r) => r.name).filter((n, i, all) => all.indexOf(n) !== i));
  const cols = rows.some((r) => r.reviews) ? COURSE_COLS : [];
  if (!rows.length) {
    return <div className="empty"><p>No reviews or schedule history for {spaced(data.course_code)}.</p><Link to="/search?tab=classes">Browse all classes</Link></div>;
  }
  return (
    <section className="course" aria-labelledby="course-head">
      <div className="course-head">
        <Link className="crumb-link" to="/search?tab=classes"><ArrowLeft size={15} aria-hidden="true" />All classes</Link>
        <h2 id="course-head">{spaced(data.course_code)}</h2>
        <p className="muted">{rows.length} instructor{rows.length === 1 ? "" : "s"}, with their ratings for this course. Terms taught come from UCSD’s public schedule archive, which only covers recent quarters.</p>
      </div>
      <div className="scroll-x">
        <table className="table rows-phone">
          <thead><tr>
            <th scope="col">Instructor</th>{anyTerms && <th scope="col">Terms taught</th>}
            {cols.map(([k, label]) => (
              <th key={k} scope="col" className="n" aria-sort={by === k ? (k === "avg_difficulty" ? "ascending" : "descending") : undefined}>
                <button type="button" className={`th-sort${by === k ? " on" : ""}`} onClick={() => setBy(k)}>{label}</button>
              </th>
            ))}
            <th scope="col"><span className="sr-only">Compare</span></th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.professor_id || r.name} className={r.reviews < FEW ? "few" : undefined}>
              <td>{r.professor_id ? <Link to={`/professors/${r.professor_id}`}>{r.name}</Link> : r.name}{twins.has(r.name) && r.department && <span className="muted twin-dept"> · {r.department}</span>}</td>
              {anyTerms && <td className={`terms-cell${r.terms.length ? "" : " none"}`}>{r.terms.length ? <span className="terms">{r.terms.map((t) => <span key={t} className="term">{t}</span>)}</span> : <span className="muted">—</span>}</td>}
              {cols.map(([k, , short]) => <td key={k} className="n" data-label={short}>{k === "reviews" ? r.reviews ?? "—" : one(r[k])}</td>)}
              <td className="act">{r.professor_id && <CompareButton id={r.professor_id} name={r.name} />}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

const classLink = (code) => `/search?tab=classes&course=${encodeURIComponent(code)}`;

// Every course with reviews, most-reviewed first; the search box narrows it by code ("CSE", "MATH 20").
function CourseList({ q }) {
  const { data, error, loading, retry } = useApi(`/courses?search=${encodeURIComponent(q)}`, { smooth: true });
  if (error) return <ErrorNotice error={error} retry={retry} />;
  if (!data) return <div className="skeleton course-skeleton" aria-hidden="true" />;
  return (
    <section className="results" aria-labelledby="results-count">
      <div className="results-bar">
        <p id="results-count" className="results-count" aria-live="polite">
          <b className="num">{data.total.toLocaleString()}</b> class{data.total === 1 ? "" : "es"}{q ? ` starting with “${q}”` : ""}{data.total > data.courses.length ? `, top ${data.courses.length} shown` : ""}
        </p>
      </div>
      {!data.courses.length ? (
        <div className="empty"><p>No classes start with “{q}”.</p><p>Try just the department, like “CSE” or “MATH”.</p></div>
      ) : (
        <div className={`scroll-x${loading ? " busy" : ""}`}>
          <table className="table course-list">
            <thead><tr>
              <th scope="col">Class</th><th scope="col" className="n">Instructors</th><th scope="col" className="n">Reviews</th>
              <th scope="col" className="n">Avg quality</th><th scope="col">Last taught</th>
            </tr></thead>
            <tbody>{data.courses.map((c) => (
              <tr key={c.course_code} className={c.reviews < FEW ? "few" : undefined}>
                <td><Link className="course-code" to={classLink(c.course_code)}>{spaced(c.course_code)}</Link></td>
                <td className="n">{c.instructors}</td>
                <td className="n">{c.reviews}</td>
                <td className="n">{one(c.avg_quality)}</td>
                <td>{c.last_term ? <span className="term">{c.last_term}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Search() {
  const { params, update, set, pick, flip, clear } = useFilters();
  const q = params.get("q") || "";
  const classes = params.get("tab") === "classes";
  const courseCode = classes && params.get("course");
  const [text, setText] = useState(q);
  const box = useRef(null);

  // Typing writes the query after a short pause; the URL is the source of truth for everything else.
  // Typing in Classes also leaves an open class, back to the narrowed list.
  // Checked against the live URL: a delayed write of what's already there must not close the open class.
  const write = (v) => update((p) => {
    if ((p.get("q") || "") === v) return;
    v ? p.set("q", v) : p.delete("q");
    p.delete("course");
  });
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => write(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  // ...and when the URL changes some other way (Back, a link), the box follows unless you're typing in it.
  useEffect(() => { if (document.activeElement !== box.current) setText(q); }, [q]);

  // A full course code typed on Professors (or an old ?q=CSE101 link) opens that class.
  const course = !classes && COURSE.exec(q);
  useEffect(() => {
    if (!course) return;
    setText("");
    update((p) => { p.set("tab", "classes"); p.set("course", `${course[1]}${course[2]}`.toUpperCase()); p.delete("q"); });
  }, [course?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchTo = (tab) => {
    if (tab === (classes ? "classes" : "professors")) return;
    setText("");
    update((p) => { tab === "classes" ? p.set("tab", tab) : p.delete("tab"); p.delete("q"); p.delete("course"); }, false);
  };

  // Standard tabs keys: arrows move between tabs (wrapping), Home/End jump; the tab opens as focus lands.
  const tabKeys = (e) => {
    const at = classes ? 1 : 0;
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const [id] = TABS[(to + TABS.length) % TABS.length];
    switchTo(id);
    document.getElementById(`tab-${id}`)?.focus();
  };

  const apiParams = new URLSearchParams(params);
  ["q", "tab", "course"].forEach((k) => apiParams.delete(k));
  if (q) apiParams.set("search", q);
  const { data, error, loading, retry } = useApi(classes || course ? null : `/professors?${apiParams}`, { smooth: true });
  const f = data?.facets;

  const departments = params.getAll("department");
  const difficulty = params.getAll("difficulty");
  const [menu, setMenu] = useState(null);  // which dropdown is open
  const label = (list, v) => list.find(([k]) => k === v)?.[1];
  const styles = STYLE.filter(([k]) => params.has(k)).map(([, l]) => l);
  const anyOn = departments.length || difficulty.length || styles.length
    || ["min_rating", "min_wta", "min_ratings", "max_ratings"].some((k) => params.has(k));
  const drop = (id) => ({ id, open: menu === id, setOpen: setMenu });
  const sort = SORTS.find(([v]) => v === params.get("sort")) || SORTS[0];  // old sort links fall back

  return (
    <>
      <h1 className="sr-only">Search professors and classes</h1>
      <div className="tabs" role="tablist" aria-label="Search for" onKeyDown={tabKeys}>
        {TABS.map(([id, l]) => {
          const on = classes === (id === "classes");
          return <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={on} tabIndex={on ? 0 : -1}
            aria-controls="search-panel" onClick={() => switchTo(id)}>{l}</button>;
        })}
      </div>
      <div id="search-panel" role="tabpanel" aria-labelledby={`tab-${classes ? "classes" : "professors"}`}>
      <form className="search-hero" role="search" onSubmit={(e) => { e.preventDefault(); write(text.trim()); }}>
        <SearchIcon size={20} aria-hidden="true" />
        <label htmlFor="q" className="sr-only">{classes ? "Class code or department" : "Professor name"}</label>
        <input id="q" ref={box} className="input" type="search" autoComplete="off" value={text}
          placeholder={classes ? "Class code, like CSE or MATH 20C" : "Professor name"}
          onChange={(e) => setText(e.target.value)} />
      </form>

      {classes ? (courseCode ? <Course code={courseCode} /> : <CourseList q={q} />) : course ? null : (
        <section className="results" aria-labelledby="results-count">
          <div className="fbar" role="group" aria-label="Filters">
            {f ? (
              <>
                <Dropdown {...drop("department")} label="Department" onClear={() => set("department", "")}
                  summary={departments.length > 1 ? `${departments.length} selected` : departments[0]}>
                  <DepartmentList facets={f.department} chosen={departments} flip={flip} />
                </Dropdown>
                <Dropdown {...drop("rating")} label="Rating" summary={label(RATING, params.get("min_rating"))} onClear={() => set("min_rating", "")}>
                  <div className="chips">{RATING.map(([v, l]) => <Toggle key={v} on={params.get("min_rating") === v} count={f.min_rating[v]} onClick={() => pick("min_rating", v)}>{l} overall</Toggle>)}</div>
                </Dropdown>
                <Dropdown {...drop("difficulty")} label="Difficulty" summary={difficulty.map((d) => label(DIFFICULTY, d)).join(", ")} onClear={() => set("difficulty", "")}>
                  <p className="dd-hint">Average difficulty out of 5: easy is under 2.5, hard is over 3.5.</p>
                  <div className="chips">{DIFFICULTY.map(([v, l]) => <Toggle key={v} on={difficulty.includes(v)} count={f.difficulty[v]} onClick={() => flip("difficulty", v)}>{l}</Toggle>)}</div>
                </Dropdown>
                <Dropdown {...drop("wta")} label="Would take again" summary={label(WTA, params.get("min_wta"))} onClear={() => set("min_wta", "")}>
                  <div className="chips">{WTA.map(([v, l]) => <Toggle key={v} on={params.get("min_wta") === v} count={f.min_wta[v]} onClick={() => pick("min_wta", v)}>{l}</Toggle>)}</div>
                </Dropdown>
                <Dropdown {...drop("style")} label="Class style" summary={styles.join(", ")} onClear={() => STYLE.forEach(([k]) => set(k, ""))}>
                  <p className="dd-hint">From reviews that mention it.</p>
                  <div className="chips">{STYLE.map(([k, l]) => <Toggle key={k} on={params.has(k)} count={f[k]} onClick={() => pick(k, "true")}>{l}</Toggle>)}</div>
                </Dropdown>
                <RatingsRange params={params} set={set} hist={f.ratings_histogram} drop={drop("ratings")} />
                {anyOn && <button type="button" className="link-btn" onClick={clear}>Clear all</button>}
              </>
            ) : [120, 90, 100, 150, 110].map((w) => <div key={w} className="skeleton" style={{ height: 40, width: w, borderRadius: 999 }} />)}
          </div>

          <div className="results-bar">
            <p id="results-count" className="results-count" aria-live="polite">
              {data ? <><b className="num">{data.total.toLocaleString()}</b> professor{data.total === 1 ? "" : "s"}{data.total > data.professors.length ? `, top ${data.professors.length} shown` : ""}</> : " "}
            </p>
            <div className="sort" role="group" aria-label="Sort by">
              {SORTS.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={sort[0] === v} aria-describedby="sort-help"
                  onClick={() => set("sort", v === "rating" ? "" : v)}>{l}</button>
              ))}
            </div>
            <p id="sort-help" className="sort-help">Sorted by {sort[2].charAt(0).toLowerCase() + sort[2].slice(1)}.</p>
          </div>

          {error ? <ErrorNotice error={error} retry={retry} />
            : loading && !data ? <div className="deck">{[1, 2, 3, 4, 5, 6].map((i) => <LoadingCard key={i} />)}</div>
            : data.professors.length === 0 ? (
              <div className="empty">
                <p>No professors match {q ? `“${q}”` : "these filters"}{q && anyOn ? " with these filters" : ""}.</p>
                {anyOn
                  ? <p>Loosen a filter above, or <button type="button" className="link-btn" onClick={clear}>clear them all</button>.</p>
                  : <p>Try another spelling, or look it up under <Link to="/search?tab=classes">Classes</Link>.</p>}
              </div>
            ) : <div className={`deck${loading ? " busy" : ""}`}>{data.professors.map((p) => <ProfCard key={p.professor_id} p={p} />)}</div>}
        </section>
      )}
      </div>
    </>
  );
}
