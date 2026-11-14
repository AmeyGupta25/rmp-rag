import { Bookmark, Columns3, MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useApi } from "../api.js";
import { useCompare } from "../compare.jsx";
import { useShortlist } from "../shortlist.jsx";

const REPO = "https://github.com/AmeyGupta25/rmp-rag";

// A solid trident in the form of UCSD's (U-shaped yoke, barbed blades flaring outward), drawn from scratch in the product's violet (no navy/gold, no card frame),
// so it reads as a nod to UCSD rather than an official mark. Same drawing as public/favicon.svg.
const TRIDENT = "M14.3 7.9h3.4l-.6 23.1h-2.2z M16 .8l4.2 8.4-2.5-1.2h-3.4l-2.5 1.2z M28.2 10.5c0 6.5-5.3 11.5-12.2 11.5S3.8 17 3.8 10.5h3.4c0 4.7 3.9 8.1 8.8 8.1s8.8-3.4 8.8-8.1z M7.2 1.6V11H3.8V9.6l-2.6 1z M24.8 1.6l6 9-2.6-1V11h-3.4z";

function Logo() {
  return <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><path d={TRIDENT} fill="var(--violet)" /></svg>;
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
          {ids.length > 0 && <NavLink to="/compare" state={{ from: pathname + search }}><Columns3 size={17} aria-hidden="true" />Compare<span key={ids.length} className="count pop">{ids.length}</span></NavLink>}
        </nav>
        <Account />
        <p className="rail-note">Answers come from student reviews, with sources you can check.</p>
      </header>
      <div className="main">
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
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
