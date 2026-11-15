// The grades students reported getting, as one stacked bar. Grades are ordered, so the bar is one
// ink ramp, darkest for A (violet is kept for actions); every segment is also named with its share in the
// legend (the light shades alone are too faint to read against white).
const BANDS = [
  ["a", "A", "#1f2024"],
  ["b", "B", "#4a4c55"],
  ["c", "C", "#8a8d96"],
  ["below", "Below C", "#c9ccd3"],
];
export const MIN_GRADES = 5;  // fewer reports than this say little, so the breakdown is left out
const totalOf = (grades) => (grades ? BANDS.reduce((n, [k]) => n + grades[k], 0) : 0);
export const hasGrades = (grades) => totalOf(grades) >= MIN_GRADES;

export function Grades({ grades }) {
  const total = totalOf(grades);
  if (total < MIN_GRADES) return null;
  const pct = (k) => Math.round((100 * grades[k]) / total);
  const shown = BANDS.filter(([k]) => grades[k] > 0);
  return (
    <figure className="grades">
      <div className="grade-bar" role="img"
        aria-label={`Reported grades: ${BANDS.map(([k, l]) => `${l} ${pct(k)}%`).join(", ")}`}>
        {shown.map(([k, , color]) => <span key={k} style={{ flexGrow: grades[k], background: color }} />)}
      </div>
      <ul className="grade-legend">
        {BANDS.map(([k, l, color]) => (
          <li key={k}><i style={{ background: color }} aria-hidden="true" />{l} <b className="num">{pct(k)}%</b></li>
        ))}
      </ul>
      <figcaption>From {total} students who reported a grade. Self-reported on Rate My Professors.</figcaption>
    </figure>
  );
}

const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function Tags({ tags, max = 3, counts = false }) {
  if (!tags?.length) return null;
  return (
    <ul className="tags" aria-label="Most common review tags">
      {tags.slice(0, max).map(({ tag, n }) => <li key={tag} className="tag">{sentence(tag)}{counts && <small className="num">{n}</small>}</li>)}
    </ul>
  );
}
