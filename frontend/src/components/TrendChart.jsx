import { useEffect, useRef, useState } from "react";

const H = 170, L = 28, R = 12, T = 12, B = 26;

// One series (overall rating over time) on a fixed 0–5 scale, so charts side by side compare honestly.
export function TrendChart({ points, label }) {
  const [hover, setHover] = useState(null);
  // Draw at the box's real width, so the axis text stays 11px instead of scaling with the chart.
  const [W, setW] = useState(320);
  const box = useRef(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return null;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((5 - v) * (H - T - B)) / 5;
  const ticks = [0, 1, 2, 3, 4, 5];
  const shown = hover ?? points.length - 1;
  return (
    <figure className="chart-fig" ref={box}>
      <figcaption className="chart-head">
        <span className="label-caps">{label}</span>
        <span className="muted" aria-live="polite">{points[shown].label}: <b className="num">{points[shown].value.toFixed(1)}</b></span>
      </figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${label}: ${points.map((p) => `${p.label} ${p.value.toFixed(1)}`).join(", ")}`}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t ? "var(--track)" : "var(--frame)"} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
          </g>
        ))}
        {[0, points.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i ? "end" : "start"} className="axis">{points[i].label}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--frame)" />}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - (W - L - R) / (points.length - 1) / 2} y={T} width={(W - L - R) / (points.length - 1)} height={H - T - B} fill="transparent" />
            {(points.length <= 24 || hover === i || i === points.length - 1) &&  // dots on every point would merge into a smear
              <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 4} fill="var(--page)" stroke="var(--ink)" strokeWidth="2" />}
          </g>
        ))}
      </svg>
    </figure>
  );
}
