"""Score retrieval (and optionally answers, rankings and attributes) against the hand-labeled sets.

Retrieval (eval/golden.jsonl): recall@1/5/10 and MRR (mean reciprocal rank of the first relevant review).
With --llm:
- answers: latency, tokens, and groundedness judged by a second model
- rankings (eval/ranking.jsonl): the app's SQL router vs the approved reference SQL, top pick and top 3
- attributes (eval/attributes_gold.jsonl): the pipeline's extraction prompt vs hand labels
Writes eval/results.json and eval/results.md (scores only, never review text).
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from data.vectorstore import rerank, search

NAMESPACE = "reviews"  # the pipeline's namespace: vector id == review id


def recall_at(ranked_ids, relevant, k):
    return len(set(ranked_ids[:k]) & set(relevant)) / len(relevant)


def reciprocal_rank(ranked_ids, relevant):
    return next((1 / i for i, rid in enumerate(ranked_ids, 1) if rid in relevant), 0.0)


def p(values, q):
    return round(statistics.quantiles(values, n=100)[q - 1], 1) if len(values) > 1 else (values or [0])[0]


VARIANTS = {
    "dense": lambda q: search(q, top_k=10, namespace=NAMESPACE),
    "dense + rerank": lambda q: rerank(q, search(q, top_k=25, namespace=NAMESPACE), top_n=10),
}


def score_retrieval(golden, variants):
    results = {}
    for name in variants:
        r1, r5, r10, rr, ms = [], [], [], [], []
        for g in golden:
            t = time.perf_counter()
            ids = [m["id"] for m in VARIANTS[name](g["question"])]
            ms.append((time.perf_counter() - t) * 1000)
            r1.append(recall_at(ids, g["relevant"], 1))
            r5.append(recall_at(ids, g["relevant"], 5))
            r10.append(recall_at(ids, g["relevant"], 10))
            rr.append(reciprocal_rank(ids, g["relevant"]))
        results[name] = {
            "recall@1": round(statistics.mean(r1), 3), "recall@5": round(statistics.mean(r5), 3),
            "recall@10": round(statistics.mean(r10), 3), "mrr": round(statistics.mean(rr), 3),
            "p50_ms": p(ms, 50), "p95_ms": p(ms, 95), "questions": len(golden),
        }
        print(name, results[name])
    return results


JUDGE = """Does every factual claim in ANSWER appear in, or follow directly from, CONTEXT?
Reply with exactly YES or NO.

CONTEXT:
{context}

ANSWER:
{answer}"""


def score_answers(golden, models):
    from groq import Groq

    from api.main import SYSTEM_PROMPT

    groq = Groq()
    results = {}
    for model in models:
        ms, tokens, grounded = [], [], []
        for g in golden:
            context = "\n\n---\n\n".join(m["text"] for m in search(g["question"], top_k=8, namespace=NAMESPACE))
            t = time.perf_counter()
            resp = groq.chat.completions.create(
                model=model, temperature=0.3, max_tokens=800, reasoning_effort="low",
                messages=[{"role": "system", "content": SYSTEM_PROMPT},
                          {"role": "system", "content": f"Context from Rate My Professor reviews:\n\n{context}"},
                          {"role": "user", "content": g["question"]}],
            )
            ms.append((time.perf_counter() - t) * 1000)
            tokens.append(resp.usage.total_tokens)
            judge = groq.chat.completions.create(  # the smaller model judges, to spare the chat model's budget
                model="openai/gpt-oss-20b", temperature=0, max_tokens=200, reasoning_effort="low",
                messages=[{"role": "user", "content": JUDGE.format(context=context,
                                                                   answer=resp.choices[0].message.content)}],
            )
            grounded.append((judge.choices[0].message.content or "").strip().upper().startswith("YES"))
            time.sleep(4)  # stay under the provider's per-minute token limit
        results[model] = {"grounded": round(statistics.mean(grounded), 3), "llm_p50_ms": p(ms, 50),
                          "llm_p95_ms": p(ms, 95), "avg_tokens": round(statistics.mean(tokens)),
                          "questions": len(golden)}
        print(model, results[model])
    return results


def _labels(rows):
    """What an answer names, in order: professors, or departments for department questions. A count
    question has neither, so its one number is the answer."""
    key = next((k for k in ("name", "department") if rows and k in rows[0]), None)
    if key:
        return [r[key] for r in rows]
    return [v for v in rows[0].values() if isinstance(v, int | float)][:1] if len(rows) == 1 else []


def ranking_match(got, ref):
    """(same top pick, share of the reference top 3 that the answer's top 3 also names)."""
    g, r = _labels(got), _labels(ref)
    if not r:
        return None
    return bool(g) and g[0] == r[0], len(set(g[:3]) & set(r[:3])) / min(3, len(r))


def score_ranking(questions):
    from groq import Groq

    from api import router
    from api.main import GROQ_MODEL, db  # the app's own locked connection, so SQL runs under its rules

    groq, cur = Groq(), db.cursor()
    top1, top3, failed, ms = [], [], 0, []
    for q in questions:
        ref = router.run_sql(cur, q["sql"])
        t = time.perf_counter()
        try:
            _, sql = router.database_context(groq, GROQ_MODEL, cur, q["question"])
            got = router.run_sql(cur, sql)
        except Exception as e:  # a router error is a wrong answer, not a crashed eval
            print(f"q{q['qid']} failed: {type(e).__name__}")
            failed, got = failed + 1, []
        ms.append((time.perf_counter() - t) * 1000)
        if (m := ranking_match(got, ref)) is not None:
            top1.append(m[0])
            top3.append(m[1])
        time.sleep(2)  # stay under the provider's per-minute token limit
    result = {"top1": round(statistics.mean(top1), 3), "top3_overlap": round(statistics.mean(top3), 3),
              "failed": failed, "p50_ms": p(ms, 50), "questions": len(top1)}
    print("ranking", result)
    return result


def attribute_scores(pairs):
    """pairs: (hand label, model label) per review, for one field. "Stated" means the hand label isn't unknown.
    stated_correct: the model got the stated ones right. invented: it gave a value where the review says nothing."""
    stated = [(g, m) for g, m in pairs if g != "unknown"]
    silent = [m for g, m in pairs if g == "unknown"]
    return {"accuracy": round(statistics.mean(g == m for g, m in pairs), 3),
            "stated": len(stated),
            "stated_correct": round(statistics.mean(g == m for g, m in stated), 3) if stated else None,
            "invented": round(statistics.mean(m != "unknown" for m in silent), 3) if silent else None}


def score_attributes(gold):
    import duckdb

    from pipeline import attributes, llm

    con = duckdb.connect(attributes.WAREHOUSE_PATH, read_only=True)
    text = dict(con.execute("select review_id, comment from fct_review where review_id in (select unnest(?))",
                            [[g["review_id"] for g in gold]]).fetchall())
    batch_all = [(g["review_id"], text[g["review_id"]], "") for g in gold if g["review_id"] in text]
    client, got = llm.client(), {}
    for start in range(0, len(batch_all), attributes.BATCH):  # same prompt, model and batching as the pipeline
        batch = batch_all[start:start + attributes.BATCH]
        reviews = "\n\n".join(f"[{i}] {c}" for i, (_, c, _) in enumerate(batch, 1))
        reply, _ = llm.complete_json(client, attributes.MODEL, attributes.PROMPT.format(reviews=reviews), 2500)
        rows, _ = attributes.parse(batch, reply)
        got |= {r["review_id"]: r for r in rows}
        time.sleep(4)
    scored = [g for g in gold if g["review_id"] in got]
    result = {f: attribute_scores([(g[f], got[g["review_id"]][f]) for g in scored])
              for f in ("exam_style", "curve", "workload")} | {"reviews": len(scored)}
    print("attributes", result)
    return result


def write_report(results):
    """Write everything scored so far. Called after each part, so a later part failing (a provider's daily
    token limit) keeps the finished ones, and parts can be run on different days."""
    json.dump(results, open("eval/results.json", "w"), indent=1)
    retrieval, answers = results.get("retrieval", {}), results.get("answers", {})
    ranking, attrs = results.get("ranking"), results.get("attributes")
    lines = ["| Retrieval | recall@1 | recall@5 | recall@10 | MRR | p50 ms | p95 ms |", "|---|---|---|---|---|---|---|"]
    lines += [f"| {n} | {r['recall@1']} | {r['recall@5']} | {r['recall@10']} | {r['mrr']} | {r['p50_ms']} | "
              f"{r['p95_ms']} |" for n, r in retrieval.items()]
    if answers:
        lines += ["", "| Answer model | grounded | p50 ms | p95 ms | tokens/answer |", "|---|---|---|---|---|"]
        lines += [f"| {m} | {a['grounded']} | {a['llm_p50_ms']} | {a['llm_p95_ms']} | {a['avg_tokens']} |"
                  for m, a in answers.items()]
    if ranking:
        lines += ["", "| SQL rankings | same top pick | top-3 overlap | failed | p50 ms | questions |",
                  "|---|---|---|---|---|---|",
                  f"| router vs reference | {ranking['top1']} | {ranking['top3_overlap']} | {ranking['failed']} | "
                  f"{ranking['p50_ms']} | {ranking['questions']} |"]
    if attrs:
        lines += ["", f"| Attribute ({attrs['reviews']} reviews) | accuracy | stated in review | stated, correct | "
                  "invented when unstated |", "|---|---|---|---|---|"]
        lines += [f"| {f} | {s['accuracy']} | {s['stated']} | {s['stated_correct']} | {s['invented']} |"
                  for f, s in attrs.items() if f != "reviews"]
    open("eval/results.md", "w").write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="first N questions only (CI uses a small subset)")
    ap.add_argument("--variants", nargs="+", default=list(VARIANTS))
    ap.add_argument("--stages", nargs="*", default=[], choices=["answers", "ranking", "attributes"],
                    help="LLM parts to score too (they use the provider's daily token limit)")
    ap.add_argument("--models", nargs="+", default=["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
                    help="answer models to compare")
    ap.add_argument("--skip-retrieval", action="store_true", help="keep the saved retrieval scores")
    ap.add_argument("--min-recall5", type=float, help="exit 1 if the first variant scores below this")
    a = ap.parse_args()

    def labeled(name):
        return [x for line in open(f"eval/{name}.jsonl")
                if (x := json.loads(line)).get("reviewed", True) and not x.get("dropped")][: a.limit]

    results = json.load(open("eval/results.json")) if Path("eval/results.json").exists() else {}

    def save(key, value):
        results[key] = value
        if a.limit is None:  # a subset run never overwrites the full scores
            write_report(results)

    golden = labeled("golden")
    if not a.skip_retrieval:
        retrieval = score_retrieval(golden, a.variants)
        save("retrieval", retrieval)
        if a.min_recall5 is not None and retrieval[a.variants[0]]["recall@5"] < a.min_recall5:
            raise SystemExit(f"recall@5 {retrieval[a.variants[0]]['recall@5']} below {a.min_recall5}")
    if "answers" in a.stages:
        for model in a.models:
            save("answers", results.get("answers", {}) | score_answers(golden, [model]))
    if "ranking" in a.stages:
        save("ranking", score_ranking(labeled("ranking")))
    if "attributes" in a.stages:
        save("attributes", score_attributes(labeled("attributes_gold")))


if __name__ == "__main__":
    main()
