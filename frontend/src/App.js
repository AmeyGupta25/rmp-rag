import { useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const suggestions = [
  "Who is the best Computer Science professor at UCSD?",
  "Which professors are easiest for math classes?",
  "Who should I take for CSE 101?",
  "Which professors give the most extra credit?",
  "Who are the hardest professors at UCSD?",
  "Best professors for biology at UCSD?",
];

export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    try {
      const res = await axios.post(`${API}/ask`, { question: query });
      setAnswer(res.data.answer);
      setSources(res.data.sources);
    } catch (e) {
      setError("Failed to get a response. Make sure the API is running.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E0E0E0", padding: "16px 32px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0, color: "#1A1A2E" }}>UCSD Professor Finder</h1>
          <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>Powered by Rate My Professor reviews + AI</p>
        </div>
        <span style={{ marginLeft: "auto", fontSize: "11px", background: "#E8F5E9", color: "#00897B", padding: "4px 10px", borderRadius: "20px" }}>RAG</span>
      </div>

      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 24px" }}>
        <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: "16px", padding: "32px", marginBottom: "24px" }}>
          <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "12px" }}>Ask anything about UCSD professors</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ask()}
              placeholder="e.g. Who is the best professor for CSE 101?"
              style={{ flex: 1, padding: "12px 16px", border: "1px solid #E0E0E0", borderRadius: "8px", fontSize: "14px", outline: "none", color: "#1A1A2E" }}
            />
            <button
              onClick={() => ask()}
              disabled={loading}
              style={{ padding: "12px 24px", background: "#1565C0", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Thinking..." : "Ask"}
            </button>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setQuestion(s); ask(s); }}
                style={{ padding: "6px 12px", background: "#F3F4F6", border: "1px solid #E0E0E0", borderRadius: "20px", fontSize: "12px", color: "#6B7280", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: "12px", padding: "16px", color: "#E53935", fontSize: "14px", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: "16px", padding: "32px", textAlign: "center", color: "#6B7280", fontSize: "14px" }}>
            Searching through 7,565 UCSD professor reviews...
          </div>
        )}

        {answer && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: "16px", padding: "24px" }}>
              <div style={{ fontSize: "11px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Answer</div>
              <p style={{ fontSize: "15px", color: "#1A1A2E", lineHeight: 1.7, margin: 0 }}>{answer}</p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: "16px", padding: "24px" }}>
              <div style={{ fontSize: "11px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "16px" }}>Sources from Rate My Professor</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {sources.map((s, i) => (
                  <div key={i} style={{ background: "#F8F9FA", border: "1px solid #E0E0E0", borderRadius: "8px", padding: "16px" }}>
                    <pre style={{ fontSize: "12px", color: "#6B7280", margin: 0, whiteSpace: "pre-wrap", fontFamily: "Inter, Arial, sans-serif", lineHeight: 1.6 }}>{s}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}