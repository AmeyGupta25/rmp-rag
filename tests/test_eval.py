from eval.run_eval import recall_at, reciprocal_rank


def test_recall_counts_relevant_reviews_found_in_top_k():
    assert recall_at(["a", "b", "c"], ["c"], 2) == 0.0
    assert recall_at(["a", "b", "c"], ["c"], 3) == 1.0
    assert recall_at(["a", "b"], ["a", "z"], 5) == 0.5


def test_reciprocal_rank_is_one_over_first_relevant_position():
    assert reciprocal_rank(["x", "y", "a"], ["a"]) == 1 / 3
    assert reciprocal_rank(["x"], ["a"]) == 0.0


def test_labeling_pools_both_variants_and_saves_in_place(monkeypatch, tmp_path):
    from eval import label

    hits = [{"id": f"r{i}", "text": f"t{i}"} for i in range(12)]
    monkeypatch.setattr(label, "search", lambda q, top_k, namespace: hits)
    monkeypatch.setattr(label, "rerank", lambda q, m, top_n: [hits[11], hits[0]])
    pool = {r["id"]: r for r in label.pooled("q")}
    assert len(pool) == 11  # dense top 10 plus the reranker's pick from outside it
    assert pool["r11"] == {"id": "r11", "text": "t11", "rerank": 1}
    assert pool["r0"]["dense"] == 1 and pool["r0"]["rerank"] == 2

    monkeypatch.setitem(label.FILES, "search", tmp_path / "g.jsonl")
    (tmp_path / "g.jsonl").write_text('{"qid": 1, "relevant": ["a"]}\n{"qid": 2, "relevant": ["b"]}\n')
    label.save("search", {"qid": 2, "relevant": ["b", "c"], "reviewed": True})
    assert label.load("search") == [{"qid": 1, "relevant": ["a"]}, {"qid": 2, "relevant": ["b", "c"], "reviewed": True}]
