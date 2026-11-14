import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { LoadingCard, ProfCard } from "../components/ProfCard.jsx";
import { SHORTLIST_MAX, useShortlist } from "../shortlist.jsx";

// Your starred professors, or a list a friend shared (/shortlist?ids=a,b,c), which you can add to yours.
export function Shortlist() {
  const { ids: mine, add, account } = useShortlist();
  const [params] = useSearchParams();
  const shared = params.get("ids")?.split(",").filter(Boolean).slice(0, SHORTLIST_MAX) || null;
  const ids = shared || mine;
  const [profs, setProfs] = useState({});
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    ids.filter((id) => !(id in profs)).forEach((id) =>
      api(`/professors/${encodeURIComponent(id)}`).then(
        (p) => setProfs((cur) => ({ ...cur, [id]: p })),
        () => setProfs((cur) => ({ ...cur, [id]: null })),  // gone from the data: skip it
      ));
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = `${window.location.origin}/shortlist?ids=${mine.join(",")}`;
  async function share() {
    try { await navigator.clipboard.writeText(link); setCopied("Link copied"); }
    catch { setCopied(link); }  // no clipboard access: show the link to copy by hand
  }
  const missing = shared ? shared.filter((id) => !mine.includes(id)) : [];

  return (
    <>
      <div className="list-head">
        <div>
          <h1>{shared ? "A shared shortlist" : "My shortlist"}</h1>
          <p className="muted">
            {shared ? `${shared.length} professor${shared.length === 1 ? "" : "s"} someone shared with you.`
              : account?.user ? "Professors you saved, synced to your Google account so they're on all your devices."
              : "Professors you saved. They stay on this device, so they're here next time."}
          </p>
        </div>
        {shared ? (
          <div className="list-actions">
            {missing.length > 0
              ? <button type="button" className="btn small" onClick={() => add(missing)}>Add {missing.length === shared.length ? "these" : `the ${missing.length} new ones`} to my shortlist</button>
              : <span className="muted"><Check size={16} aria-hidden="true" /> All in your shortlist</span>}
            <Link to="/shortlist" className="btn ghost small">My shortlist</Link>
          </div>
        ) : mine.length > 0 && (
          <div className="list-actions">
            <button type="button" className="btn ghost small" onClick={share}><Link2 size={16} aria-hidden="true" />Copy share link</button>
            {copied && <span className="copied" role="status">{copied}</span>}
          </div>
        )}
      </div>
      {ids.length === 0 ? (
        <div className="empty">
          <p>Nothing saved yet.</p>
          <p>Tap the bookmark on any professor in <Link to="/search">Search</Link> or <Link to="/">Ask</Link> to keep them here.</p>
        </div>
      ) : (
        <div className="deck">
          {ids.map((id) => (id in profs ? profs[id] && <ProfCard key={id} p={profs[id]} /> : <LoadingCard key={id} />))}
        </div>
      )}
    </>
  );
}
