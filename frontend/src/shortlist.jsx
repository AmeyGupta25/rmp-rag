import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authEnabled, firebase, hadSession, loadList, saveList, signIn, signOut, watchUser } from "./auth.js";

// Professors a student starred. Unlike Compare (this tab only), it stays on the device across visits,
// and when they sign in with Google it follows them to their other devices too.
const Shortlist = createContext(null);
export const SHORTLIST_MAX = 30;

function saved() {
  try { return JSON.parse(localStorage.getItem("shortlist")) || []; } catch { return []; }
}

export function ShortlistProvider({ children }) {
  const [ids, setIds] = useState(saved);
  const [user, setUser] = useState(null);
  const cloud = useRef(null);  // the list as last read from or written to the account; null until loaded

  const watching = useRef(false);
  const watch = () => {
    if (watching.current) return;
    watching.current = true;
    watchUser(setUser);
  };
  useEffect(() => {
    if (!authEnabled) return;
    if (hadSession()) { watch(); return; }
    // Fetch Firebase in the background, so the Google popup opens right from the tap: Safari blocks
    // a popup that first has to wait for a download.
    const t = setTimeout(() => firebase().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, []);

  // On sign-in, merge this device's list into the account's, so nothing saved before signing in is lost.
  useEffect(() => {
    if (!user) return;
    let live = true;
    loadList(user.uid).then((theirs) => {
      if (!live) return;
      cloud.current = theirs;
      setIds((mine) => [...new Set([...theirs, ...mine])].slice(-SHORTLIST_MAX));
    }, () => { /* account unreachable: keep the device list, try again next sign-in */ });
    return () => { live = false; cloud.current = null; };
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem("shortlist", JSON.stringify(ids)); } catch { /* private mode: lasts this visit only */ }
    if (!user || !cloud.current || cloud.current.join() === ids.join()) return;
    cloud.current = ids;
    // shortcut: last write wins (the whole list is saved); switch to per-id updates if people edit on two devices at once
    saveList(user.uid, ids).catch(() => { cloud.current = []; });  // failed: the next change saves the full list again
  }, [ids, user]);

  const toggle = (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-SHORTLIST_MAX)));
  const add = (more) => setIds((cur) => [...new Set([...cur, ...more])].slice(-SHORTLIST_MAX));
  const remove = (id) => setIds((cur) => cur.filter((x) => x !== id));
  const account = authEnabled && {
    user,
    signIn: async () => { watch(); await signIn(); },
    // The list is safe in the account, so it leaves this device: on a shared computer the next
    // person must not see it, or get it merged into their own account when they sign in.
    signOut: async () => {
      cloud.current = null;  // stops the save effect from writing the emptied list to the account
      await signOut().catch(() => {});
      setIds([]);
    },
  };
  return <Shortlist.Provider value={{ ids, toggle, add, remove, account }}>{children}</Shortlist.Provider>;
}

export const useShortlist = () => useContext(Shortlist);
