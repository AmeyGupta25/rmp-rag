import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { CompareProvider } from "./compare.jsx";
import { ShortlistProvider } from "./shortlist.jsx";
import { Shell } from "./components/Shell.jsx";
import { Ask } from "./pages/Ask.jsx";
import { Compare } from "./pages/Compare.jsx";
import { Professor } from "./pages/Professor.jsx";
import { Search } from "./pages/Search.jsx";
import { Shortlist } from "./pages/Shortlist.jsx";
import "./styles.css";

// Old links keep working: /professors and /courses became Search.
function OldProfessors() {
  const p = new URLSearchParams(useLocation().search);
  if (p.has("search")) { p.set("q", p.get("search")); p.delete("search"); }
  return <Navigate to={`/search?${p}`} replace />;
}
function OldCourse() {
  const { code } = useParams();
  return <Navigate to={code ? `/search?tab=classes&course=${encodeURIComponent(code.toUpperCase())}` : "/search?tab=classes"} replace />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <CompareProvider>
      <ShortlistProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Ask />} />
            <Route path="search" element={<Search />} />
            <Route path="shortlist" element={<Shortlist />} />
            <Route path="professors" element={<OldProfessors />} />
            <Route path="professors/:id" element={<Professor />} />
            <Route path="courses/:code?" element={<OldCourse />} />
            <Route path="compare" element={<Compare />} />
            <Route path="*" element={<div className="empty"><p>This page doesn’t exist.</p><Link to="/">Back to Ask</Link></div>} />
          </Route>
        </Routes>
      </ShortlistProvider>
      </CompareProvider>
    </BrowserRouter>
  </StrictMode>,
);
