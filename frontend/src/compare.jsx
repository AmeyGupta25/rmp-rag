import { createContext, useContext, useEffect, useState } from "react";

const Compare = createContext(null);

function saved() {
  try { return JSON.parse(sessionStorage.getItem("compare")) || []; } catch { return []; }
}

export function CompareProvider({ children }) {
  const [ids, setIds] = useState(saved);
  useEffect(() => {
    try { sessionStorage.setItem("compare", JSON.stringify(ids)); } catch { /* private mode: just don't persist */ }
  }, [ids]);
  // Up to 3: adding a fourth drops the oldest pick.
  const toggle = (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-3)));
  return <Compare.Provider value={{ ids, toggle }}>{children}</Compare.Provider>;
}

export const useCompare = () => useContext(Compare);
