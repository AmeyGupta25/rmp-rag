from eval.run_eval import attribute_scores, ranking_match, recall_at, reciprocal_rank


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


def test_ranking_compares_top_pick_and_top_three_by_name_or_department():
    ref = [{"name": "A", "x": 1}, {"name": "B"}, {"name": "C"}, {"name": "D"}]
    assert ranking_match([{"name": "A"}, {"name": "C"}, {"name": "Z"}], ref) == (True, 2 / 3)
    assert ranking_match([], ref) == (False, 0.0)
    assert ranking_match([{"department": "Music"}], [{"department": "Music"}, {"department": "Art"}]) == (True, 0.5)
    assert ranking_match([{"name": "A"}], []) is None  # an empty reference can't be scored


def test_attribute_scores_separate_stated_labels_from_invented_ones():
    s = attribute_scores([("yes", "yes"), ("no", "yes"), ("unknown", "unknown"), ("unknown", "yes")])
    assert s == {"accuracy": 0.5, "stated": 2, "stated_correct": 0.5, "invented": 0.5}
    assert attribute_scores([("unknown", "unknown")])["stated_correct"] is None


def test_a_count_answer_is_compared_by_its_number():
    assert ranking_match([{"n": 41}], [{"professors": 41}]) == (True, 1.0)
    assert ranking_match([{"n": 12}], [{"professors": 41}])[0] is False


def test_the_eval_client_stops_a_model_at_its_cap_and_keeps_others_open():
    from unittest.mock import MagicMock

    import pytest

    from eval.run_eval import BudgetSpent, MeteredGroq, out_of_budget

    inner = MagicMock()
    inner.chat.completions.create.return_value = MagicMock(usage=MagicMock(total_tokens=60))
    groq = MeteredGroq(inner, cap=100)
    groq.chat.completions.create(model="big", messages=[])
    groq.chat.completions.create(model="big", messages=[])  # 120 used: over the cap only after this call
    with pytest.raises(BudgetSpent) as e:
        groq.chat.completions.create(model="big", messages=[])
    groq.chat.completions.create(model="small", messages=[])
    assert groq.used == {"big": 120, "small": 60} and out_of_budget(e.value)
    assert out_of_budget(Exception("429 tokens per day (TPD)")) and not out_of_budget(Exception("400"))
