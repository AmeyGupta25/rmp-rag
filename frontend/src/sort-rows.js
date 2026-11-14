// Sort table rows by one numeric column: dir 1 = high first, -1 = low first. Rows missing the value go last either way.
export const sortRows = (rows, key, dir) =>
  [...rows].sort((a, b) => (a[key] == null) - (b[key] == null) || dir * ((b[key] ?? 0) - (a[key] ?? 0)));
