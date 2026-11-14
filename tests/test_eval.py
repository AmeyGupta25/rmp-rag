from eval.run_eval import recall_at, reciprocal_rank


def test_recall_counts_relevant_reviews_found_in_top_k():
    assert recall_at(["a", "b", "c"], ["c"], 2) == 0.0
    assert recall_at(["a", "b", "c"], ["c"], 3) == 1.0
    assert recall_at(["a", "b"], ["a", "z"], 5) == 0.5


def test_reciprocal_rank_is_one_over_first_relevant_position():
    assert reciprocal_rank(["x", "y", "a"], ["a"]) == 1 / 3
    assert reciprocal_rank(["x"], ["a"]) == 0.0
