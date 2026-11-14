// Who wins what on the Compare page. Rows are [label, key, format, better, title]:
// better +1 means higher wins, -1 lower wins, 0 shown but never judged.

// The single best value in a row, or null on a tie or when fewer than two professors have data.
export function rowWinner(list, key, dir) {
  const vals = list.map((p) => p[key]).filter((v) => v != null);
  if (!dir || vals.length < 2) return null;
  const win = dir > 0 ? Math.max(...vals) : Math.min(...vals);
  return vals.filter((v) => v === win).length === 1 ? win : null;
}

// [title, professor] for every judged row that has a clear winner, in row order.
export function verdict(list, rows) {
  return rows.filter(([, , , dir]) => dir).map(([, key, , dir, title]) => {
    const best = rowWinner(list, key, dir);
    return best == null ? null : [title, list.find((p) => p[key] === best)];
  }).filter(Boolean);
}
