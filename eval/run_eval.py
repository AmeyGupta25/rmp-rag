"""Score retrieval (and optionally answers) against eval/golden.jsonl.

Retrieval: recall@1/5/10 and MRR (mean reciprocal rank of the first relevant review).
Answers (--llm): latency, tokens, and groundedness judged by a second model.
Writes eval/results.json and eval/results.md (scores only, never review text).
"""

import argparse
import json
import statistics
import time

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


def write_report(retrieval, answers):
    json.dump({"retrieval": retrieval, "answers": answers}, open("eval/results.json", "w"), indent=1)
    lines = ["| Retrieval | recall@1 | recall@5 | recall@10 | MRR | p50 ms | p95 ms |", "|---|---|---|---|---|---|---|"]
    lines += [f"| {n} | {r['recall@1']} | {r['recall@5']} | {r['recall@10']} | {r['mrr']} | {r['p50_ms']} | "
              f"{r['p95_ms']} |" for n, r in retrieval.items()]
    if answers:
        lines += ["", "| Answer model | grounded | p50 ms | p95 ms | tokens/answer |", "|---|---|---|---|---|"]
        lines += [f"| {m} | {a['grounded']} | {a['llm_p50_ms']} | {a['llm_p95_ms']} | {a['avg_tokens']} |"
                  for m, a in answers.items()]
    open("eval/results.md", "w").write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="first N questions only (CI uses a small subset)")
    ap.add_argument("--variants", nargs="+", default=list(VARIANTS))
    ap.add_argument("--llm", action="store_true", help="also score answers (uses LLM tokens)")
    ap.add_argument("--min-recall5", type=float, help="exit 1 if the first variant scores below this")
    a = ap.parse_args()

    golden = [g for line in open("eval/golden.jsonl") if not (g := json.loads(line)).get("dropped")][: a.limit]
    retrieval = score_retrieval(golden, a.variants)
    answers = score_answers(golden, ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) if a.llm else {}
    if a.limit is None:
        write_report(retrieval, answers)
    if a.min_recall5 is not None and retrieval[a.variants[0]]["recall@5"] < a.min_recall5:
        raise SystemExit(f"recall@5 {retrieval[a.variants[0]]['recall@5']} below {a.min_recall5}")


if __name__ == "__main__":
    main()
