import { useEffect, useState } from "react";

const BASE = (import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || "http://localhost:8000").replace(/\/$/, "");

const MESSAGES = {
  404: "We couldn't find that.",
  429: "Too many questions at once. Please wait a minute.",
};

// Upstream error text never reaches the page: we show our own message per status.
export async function api(path, body, retry = !body) {  // only reads retry: a repeated POST /ask costs a second answer
  let res;
  try {
    res = await fetch(BASE + path, body && {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    if (retry) {  // a quiet second try covers a slow first connection
      await new Promise((r) => setTimeout(r, 2500));
      return api(path, body, false);
    }
    throw new Error("Couldn't reach ProfAI. Check your connection and try again.");
  }
  if (!res.ok) throw Object.assign(new Error(MESSAGES[res.status] || "Something went wrong. Please try again."), { status: res.status });
  return res.json();
}

// Each result is tagged with the path it answers, so a render can never show another request's
// result (that is what showed stale tables, skeletons that never left, and a crash after a path change).
// smooth: keep showing the old data while the next loads, then swap in place. (Cards used to glide to their
// new places with a View Transition, but in a 50-card grid they crossed over each other, so it was removed.)
export function useApi(path, { smooth = false } = {}) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!path) return;
    let live = true;
    const apply = (next) => live && setState(next);
    api(path).then((data) => apply({ path, data }), (error) => apply({ path, error }));
    return () => { live = false; };
  }, [path]);
  if (!path) return {};
  if (state.path === path) return state;
  return smooth && state.data ? { data: state.data, loading: true } : { loading: true };
}
