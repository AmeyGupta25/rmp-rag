import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const BLUE = "#1565C0";
const GREEN = "#00897B";
const RED = "#E53935";
const GRAY = "#6B7280";
const BG = "#F8F9FA";
const WHITE = "#FFFFFF";
const TEXT = "#1A1A2E";
const BORDER = "#E0E0E0";

export default function App() {
  const [page, setPage] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [profSearch, setProfSearch] = useState("");
  const [profDept, setProfDept] = useState("");
  const [profSort, setProfSort] = useState("rating");
  const [profLoading, setProfLoading] = useState(false);
  const bottomRef = useRef(null);

  const suggestions = [
    "Who is the best CS professor at UCSD?",
    "Which professors are easiest for GE requirements?",
    "Who should I take for CSE 101?",
    "Which professors give the most extra credit?",
    "Who are the hardest professors at UCSD?",
  ];

  useEffect(() => {
    axios.get(`${API}/departments`).then(r => setDepartments(r.data.departments));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (page === "professors") loadProfessors();
  }, [page, profDept, profSort, loadProfessors]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProfessors = async () => {
    setProfLoading(true);
    const r = await axios.get(`${API}/professors`, {
      params: { department: profDept, sort: profSort, search: profSearch }
    });
    setProfessors(r.data.professors);
    setProfLoading(false);
  };

  const ask = async (q) => {
    const question = q || input;
    if (!question.trim()) return;
    setInput("");
    setLoading(true);
    const newMessages = [...messages, { role: "user", content: question }];
    setMessages(newMessages);
    try {
      const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const r = await axios.post(`${API}/ask`, { question, history, department });
      setMessages([...newMessages, {
        role: "assistant",
        content: r.data.answer,
        sources: r.data.sources,
        professors: r.data.professors
      }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  const RatingCard = ({ prof }) => (
    <div style={{ background: WHITE, border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{prof.name}</div>
        <div style={{ fontSize: 11, color: GRAY }}>{prof.department}</div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Rating", value: prof.avg_rating?.toFixed(1), color: prof.avg_rating >= 4 ? GREEN : prof.avg_rating >= 3 ? "#F57C00" : RED },
          { label: "Difficulty", value: prof.avg_difficulty?.toFixed(1), color: TEXT },
          { label: "Reviews", value: prof.num_ratings, color: BLUE }
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 9, color: GRAY, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter', Arial, sans-serif" }}>
      <div style={{ background: BLUE, padding: "0 32px", display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ padding: "14px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: WHITE, letterSpacing: "0.2px" }}>UCSD ProfAI</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Powered by Rate My Professor + AI · 7,565 reviews</div>
        </div>
        <div style={{ display: "flex", gap: 0, marginLeft: 24 }}>
          {["chat", "professors"].map(p => (
            <button key={p} onClick={() => setPage(p)} style={{ padding: "0 20px", height: 56, border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: page === p ? WHITE : "rgba(255,255,255,0.55)", borderBottom: page === p ? `3px solid ${WHITE}` : "3px solid transparent", letterSpacing: "0.2px" }}>
              {p === "chat" ? "Ask AI" : "Browse Professors"}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 10, background: "rgba(255,255,255,0.15)", color: WHITE, padding: "4px 12px", borderRadius: 20, fontWeight: 600, letterSpacing: "0.5px" }}>RAG</span>
      </div>

      {page === "chat" && (
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "12px 24px", display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
          <div style={{ marginBottom: 12 }}>
            <select value={department} onChange={e => setDepartment(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, color: TEXT, background: WHITE, cursor: "pointer", outline: "none" }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
            {messages.length === 0 && (
              <div style={{ background: WHITE, border: `0.5px solid ${BORDER}`, borderRadius: 16, padding: "32px 28px", textAlign: "center" }}>
                <div style={{ width: 48, height: 48, background: BLUE, borderRadius: 12, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="white"/></svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Ask anything about UCSD professors</div>
                <div style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>Based on 7,565 real student reviews from Rate My Professor</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => ask(s)} style={{ padding: "7px 14px", background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 20, fontSize: 12, color: TEXT, cursor: "pointer", fontWeight: 500 }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "assistant" && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: BLUE, marginBottom: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>AI Answer</div>
                )}
                <div style={{ maxWidth: "85%", background: msg.role === "user" ? BLUE : WHITE, border: msg.role === "user" ? "none" : `0.5px solid ${BORDER}`, borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px", padding: "10px 14px", color: msg.role === "user" ? WHITE : TEXT, fontSize: 14, lineHeight: 1.65 }}>
                  {msg.content}
                </div>
                {msg.professors?.length > 0 && (
                  <div style={{ maxWidth: "85%", width: "100%", marginTop: 4 }}>
                    {msg.professors.map((p, j) => <RatingCard key={j} prof={p} />)}
                  </div>
                )}
                {msg.sources?.length > 0 && (
                  <details style={{ maxWidth: "85%", marginTop: 4 }}>
                    <summary style={{ fontSize: 11, color: GRAY, cursor: "pointer", padding: "4px 0", fontWeight: 500 }}>View sources ({msg.sources.length})</summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                      {msg.sources.map((s, j) => (
                        <div key={j} style={{ background: BG, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: GRAY, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{s}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div style={{ background: WHITE, border: `0.5px solid ${BORDER}`, borderRadius: "4px 16px 16px 16px", padding: "10px 14px", fontSize: 13, color: GRAY }}>Searching 7,565 reviews...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: 8, background: WHITE, border: `1.5px solid ${BLUE}`, borderRadius: 12, padding: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="Ask about UCSD professors..." style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: TEXT, padding: "6px 8px", background: "transparent" }} />
            <button onClick={() => ask()} disabled={loading} style={{ padding: "8px 20px", background: loading ? GRAY : BLUE, color: WHITE, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}>
              {loading ? "..." : "Ask"}
            </button>
          </div>
        </div>
      )}

      {page === "professors" && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <input value={profSearch} onChange={e => setProfSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadProfessors()} placeholder="Search professor name..." style={{ flex: 1, minWidth: 200, padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: "none", color: TEXT }} />
            <select value={profDept} onChange={e => setProfDept(e.target.value)} style={{ padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: WHITE, color: TEXT, outline: "none" }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={profSort} onChange={e => setProfSort(e.target.value)} style={{ padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: WHITE, color: TEXT, outline: "none" }}>
              <option value="rating">Highest Rated</option>
              <option value="difficulty">Easiest First</option>
              <option value="num_ratings">Most Reviewed</option>
            </select>
            <button onClick={loadProfessors} style={{ padding: "9px 20px", background: BLUE, color: WHITE, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Search</button>
          </div>

          {profLoading ? (
            <div style={{ textAlign: "center", padding: 60, color: GRAY }}>Loading professors...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {professors.map((prof, i) => (
                <div key={i} style={{ background: WHITE, border: `0.5px solid ${BORDER}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{prof.name}</div>
                      <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>{prof.department}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: prof.avg_rating >= 4 ? GREEN : prof.avg_rating >= 3 ? "#F57C00" : RED }}>{prof.avg_rating?.toFixed(1)}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "Difficulty", value: prof.avg_difficulty?.toFixed(1) },
                      { label: "Reviews", value: prof.num_ratings },
                      { label: "Take Again", value: prof.would_take_again > 0 ? `${Math.round(prof.would_take_again)}%` : "N/A" }
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: BG, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{value}</div>
                        <div style={{ fontSize: 9, color: GRAY, textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setPage("chat"); setDepartment(prof.department); setTimeout(() => ask(`Tell me more about Professor ${prof.name}`), 100); }} style={{ marginTop: "auto", width: "100%", padding: "9px", background: BLUE, border: "none", borderRadius: 8, fontSize: 12, color: WHITE, cursor: "pointer", fontWeight: 700, letterSpacing: "0.2px" }}>
                    Ask about this professor
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}