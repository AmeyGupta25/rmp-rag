import { ArrowRight, Bookmark, Columns3, MessageSquare, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useApi } from "../api.js";
import { useCompare } from "../compare.jsx";
import { useShortlist } from "../shortlist.jsx";

const REPO = "https://github.com/AmeyGupta25/rmp-rag";
const TITLES = { "/": "Ask", "/search": "Search", "/shortlist": "Shortlist", "/compare": "Compare" };

// A page change in a single-page app is silent: name it in the tab, and move keyboard and screen-reader focus to
// the new page (not on the first load, and not on query changes like typing a search, which only update ?q=).
function useAnnouncePage(pathname, main) {
  const first = useRef(true);
  useEffect(() => {
    const title = TITLES[pathname];
    if (title || !pathname.startsWith("/professors/")) document.title = title ? `${title} · UCSD ProfAI` : "UCSD ProfAI";
    if (first.current) { first.current = false; return; }
    main.current?.focus({ preventScroll: true });
  }, [pathname, main]);
}

// A diagonal trident in the style of UCSD's (barbed blades with cut-outs on a bent crossbar), drawn from scratch in the
// product's violet (no navy/gold, no card frame), so it reads as a nod to UCSD rather than an official mark.
// Same drawing as public/favicon.svg; the cut-outs need fill-rule evenodd.
const TRIDENT = "M24.28 7.72 21.41 17.24 20.25 13.88 14.05 20.08 20.52 21.22 31.37 15.69 25.39 25.22 24.46 23.13 22.33 25.08 11.79 22.33 2.76 31.37 0.63 29.24 9.67 20.21 6.92 9.67 8.87 7.54 6.78 6.61 16.31 0.63 10.78 11.48 11.92 17.95 18.12 11.75 14.76 10.59ZM22.56 10.24 21.14 14.94 20.21 12.86ZM29.16 17.9 25.57 23.53 24.68 21.76ZM14.1 2.84 8.47 6.43 10.24 7.32Z";

function Logo() {
  return <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><path d={TRIDENT} fillRule="evenodd" fill="var(--violet)" /></svg>;
}

// Optional Google sign-in: it only syncs the shortlist, so everything else works signed out.
function Account() {
  const { account } = useShortlist();
  const [failed, setFailed] = useState(false);
  if (!account) return null;  // sign-in isn't configured
  if (account.user) {
    return (
      <div className="account">
        <span>Signed in as {account.user.displayName?.split(" ")[0] || "you"}</span>
        <button type="button" className="link-btn" onClick={account.signOut}>Sign out</button>
      </div>
    );
  }
  const go = () => {
    setFailed(false);
    account.signIn().catch((e) => !["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(e.code) && setFailed(true));
  };
  return (
    <div className="account">
      <button type="button" className="btn ghost small" onClick={go}>Sign in with Google</button>
      <p className="account-note" role={failed ? "alert" : undefined}>{failed ? "Sign-in didn’t work. Please try again." : "Keeps your shortlist on all your devices."}</p>
    </div>
  );
}

export function Shell() {
  const { ids } = useCompare();
  const { pathname, search } = useLocation();
  const main = useRef(null);
  useAnnouncePage(pathname, main);
  // Picked from a class page (or already comparing for one): Compare judges that class.
  const course = ["/search", "/compare"].includes(pathname) && new URLSearchParams(search).get("course");
  const compareTo = { pathname: "/compare", search: course ? `?course=${encodeURIComponent(course)}` : "" };
  const compareState = { from: pathname + search };
  const saved = useShortlist().ids.length;
  const { data: health } = useApi("/health");  // also wakes the API before the first question
  const updated = health && new Date(health.data_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="shell">
      <a className="sr-only skip" href="#main">Skip to content</a>
      <header className="rail">
        <Link className="brand" to="/"><Logo />UCSD ProfAI</Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end><MessageSquare size={17} aria-hidden="true" />Ask</NavLink>
          <NavLink to="/search"><Search size={17} aria-hidden="true" />Search</NavLink>
          <NavLink to="/shortlist"><Bookmark size={17} aria-hidden="true" />Shortlist{saved > 0 && <span key={saved} className="count pop">{saved}</span>}</NavLink>
          {/* Shown once someone is picked; "from" lets Compare's "Back to search" return to the same search */}
          {ids.length > 0 && <NavLink to={compareTo} state={compareState}><Columns3 size={17} aria-hidden="true" />Compare<span key={ids.length} className="count pop">{ids.length}</span></NavLink>}
        </nav>
        <Account />
        <p className="rail-note">Answers come from student reviews, with sources you can check.</p>
      </header>
      <div className="main">
        <main id="main" className="content" tabIndex={-1} ref={main}>
          <Outlet />
        </main>
        {/* Phones: the rail scrolls away, so picks stay one thumb-tap from Compare */}
        {ids.length > 0 && pathname !== "/compare" && (
          <Link className="cmp-bar" to={compareTo} state={compareState}>
            <span>Compare <b className="num">{ids.length}</b> {ids.length === 1 ? "professor" : "professors"}</span>
            <span className="cmp-bar-go">View<ArrowRight size={16} aria-hidden="true" /></span>
          </Link>
        )}
        <footer className="footer">
          <span>
            {health && <>Data updated {updated} · {health.reviews.toLocaleString()} reviews · </>}
            <a href={REPO} target="_blank" rel="noreferrer">How it’s built ↗</a>
          </span>
          <span>Unofficial: not affiliated with UCSD or Rate My Professors.</span>
        </footer>
      </div>
    </div>
  );
}
