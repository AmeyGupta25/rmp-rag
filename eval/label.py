"""Local labeling tool for the eval sets. Run `python -m eval.label`, then open http://127.0.0.1:8765

- search: check each golden question and tick which retrieved reviews answer it (eval/golden.jsonl)
- ranking: approve or fix the reference SQL for each ranking question (eval/ranking.jsonl)
- attributes: label exam style, curve and workload for sampled reviews (eval/attributes_gold.jsonl)

Review text is shown in the browser only. Files get IDs and labels, never text (the repo is public).
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import get_args
from urllib.parse import parse_qs, urlparse

import duckdb

from api import router
from data.vectorstore import rerank, search
from eval.run_eval import NAMESPACE
from pipeline.attributes import SINCE_YEAR, WAREHOUSE_PATH, Attributes

EVAL = Path(__file__).parent
FILES = {"search": EVAL / "golden.jsonl", "ranking": EVAL / "ranking.jsonl",
         "attributes": EVAL / "attributes_gold.jsonl"}
KEYS = {"search": "qid", "ranking": "qid", "attributes": "review_id"}
WAREHOUSE, SERVING = WAREHOUSE_PATH, "data/serving.duckdb"
ATTR_FIELDS = {f: list(get_args(Attributes.model_fields[f].annotation)) for f in Attributes.model_fields}
ATTR_SAMPLE = 100
HOST, PORT = "127.0.0.1", 8765
ORIGIN = f"http://{HOST}:{PORT}"


def load(name):
    path = FILES[name]
    return [json.loads(line) for line in open(path)] if path.exists() else []


def save(name, item):
    """Replace the item with the same key, rewriting the file in its original order."""
    items, key = load(name), KEYS[name]
    items = [item if i[key] == item[key] else i for i in items]
    FILES[name].write_text("".join(json.dumps(i) + "\n" for i in items))


def ensure_attribute_sample():
    """Fix the sample on first run, so it can't shift between labeling sessions."""
    if FILES["attributes"].exists():
        return
    con = duckdb.connect(WAREHOUSE, read_only=True)
    ids = con.execute("""select review_id from fct_review
        where comment is not null and length(comment) >= 80 and year(reviewed_at) >= ?
        order by md5(review_id) limit ?""", [SINCE_YEAR, ATTR_SAMPLE]).fetchall()
    FILES["attributes"].write_text("".join(
        json.dumps({"review_id": rid, **dict.fromkeys(ATTR_FIELDS), "reviewed": False}) + "\n" for (rid,) in ids))


def review(review_id):
    con = duckdb.connect(WAREHOUSE, read_only=True)
    row = con.execute("""select r.comment, r.course_code, p.name from fct_review r
        join dim_professor p using (professor_id) where r.review_id = ?""", [review_id]).fetchone()
    return dict(zip(["text", "course", "professor"], row, strict=True)) if row else {"text": "(not found)"}


def pooled(question):
    """Top 10 from both variants run_eval scores, so neither one is judged on the other's picks."""
    dense = search(question, top_k=25, namespace=NAMESPACE)
    reranked = rerank(question, dense, top_n=10)
    out = {}
    for name, ranked in (("dense", dense[:10]), ("rerank", reranked)):
        for rank, m in enumerate(ranked, 1):
            out.setdefault(m["id"], {"id": m["id"], "text": m["text"]})[name] = rank
    return list(out.values())


def run_sql(sql):
    con = duckdb.connect(SERVING, read_only=True)
    try:
        return {"rows": router.run_sql(con.cursor(), sql)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


class Handler(BaseHTTPRequestHandler):
    def reply(self, body, status=200, kind="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/":
            self.reply((EVAL / "label.html").read_bytes(), kind="text/html; charset=utf-8")
        elif url.path == "/api/state":
            self.reply({name: load(name) for name in FILES} | {"attr_fields": ATTR_FIELDS})
        elif url.path == "/api/search":
            self.reply(pooled(q["q"]))
        elif url.path == "/api/review":
            self.reply(review(q["id"]))
        else:
            self.reply({"error": "not found"}, 404)

    def do_POST(self):
        # Browsers send a cross-site text/plain POST without asking: only this tool's own page may write.
        if self.headers.get("Origin", ORIGIN) != ORIGIN:
            return self.reply({"error": "forbidden"}, 403)
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/sql":
            self.reply(run_sql(body["sql"]))
        elif self.path == "/api/save" and body.get("set") in FILES:
            save(body["set"], body["item"])
            self.reply({"ok": True})
        else:
            self.reply({"error": "not found"}, 404)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ensure_attribute_sample()
    print(f"Labeling tool: {ORIGIN}  (Ctrl+C to stop)")
    HTTPServer((HOST, PORT), Handler).serve_forever()  # local only: it serves review text
