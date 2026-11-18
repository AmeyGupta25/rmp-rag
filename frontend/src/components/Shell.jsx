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

// A graduation cap, drawn from scratch in the product's violet. Same drawing as public/favicon.svg.
const CAP = "M2.96 12.15Q1.50 11.50 2.96 10.85L14.54 5.65Q16.00 5.00 17.46 5.65L29.04 10.85Q30.50 11.50 29.04 12.15L17.46 17.35Q16.00 18.00 14.54 17.35ZM8.00 16.21L14.00 18.90Q16.00 19.95 18.00 18.90L24.00 16.21L24.00 22.60C24.00 25.40 20.40 27.00 16.00 27.00C11.60 27.00 8.00 25.40 8.00 22.60ZM28.60 11.60L29.80 11.60L29.80 20.80L28.60 20.80ZM27.90 21.10Q27.90 20.20 28.80 20.20L29.60 20.20Q30.50 20.20 30.50 21.10L30.50 24.50Q30.50 25.40 29.60 25.40L28.80 25.40Q27.90 25.40 27.90 24.50Z";

function Logo() {
  return <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><path d={CAP} fill="var(--violet)" /></svg>;
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
