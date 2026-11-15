from pipeline import attributes, summaries

BATCH = [("R1", "Curved exams, heavy load.", "h1"), ("R2", "Fine.", "h2"), ("R3", "Easy.", "h3")]


def test_numbered_results_map_back_to_the_right_reviews_and_bad_ones_are_rejected():
    reply = {"results": [
        {"i": 2, "exam_style": "unknown", "curve": "unknown", "workload": "light"},
        {"i": 1, "exam_style": "mixed", "curve": "yes", "workload": "heavy"},
        {"i": 3, "exam_style": "essay", "curve": "no", "workload": "light"},  # not an allowed value
    ]}
    rows, rejects = attributes.parse(BATCH, reply)
    got = [(r["review_id"], r["curve"], r["comment_hash"]) for r in rows]
    assert got == [("R1", "yes", "h1"), ("R2", "unknown", "h2")]
    assert rejects[0]["record"] == {"review_id": "R3"}


def test_a_missing_result_is_rejected_not_guessed():
    rows, rejects = attributes.parse(BATCH[:1], {"results": []})
    assert rows == [] and len(rejects) == 1


def test_summary_hash_changes_only_when_the_review_set_changes():
    a = [("R1", "good"), ("R2", "bad")]
    assert summaries.reviews_hash(a) == summaries.reviews_hash(list(a))
    assert summaries.reviews_hash(a) != summaries.reviews_hash([("R1", "good"), ("R2", "edited")])


def test_an_extra_summary_point_is_trimmed_not_rejected():
    s = summaries.Summary.model_validate({"pros": ["a", "b", "c", "d"], "cons": ["x"], "exams": "Fair.",
                                          "workload": "Light.", "cited": list(range(1, 13))})
    assert s.pros == ["a", "b", "c"] and len(s.cited) == 10


def test_invalid_json_from_the_model_rejects_that_item_and_the_run_continues(monkeypatch, tmp_path):
    from unittest.mock import MagicMock

    from pipeline import extract, llm

    ok = MagicMock(total_tokens=100)
    replies = iter([Exception("Error code: 400 - {'code': 'json_validate_failed'}"),
                    ({"pros": ["Clear"], "cons": [], "exams": "Fair.", "workload": "Light.", "cited": [1]}, ok)])

    def fake(*_args, **_kw):
        r = next(replies)
        if isinstance(r, Exception):
            raise llm.BadJSON(str(r))
        return r

    monkeypatch.setattr(llm, "client", lambda: None)
    monkeypatch.setattr(llm, "complete_json", fake)
    monkeypatch.setattr(extract, "RAW_ROOT", tmp_path)
    monkeypatch.setattr(summaries, "pending", lambda: [
        ("P1", {"name": "A", "department": "X", "reviews": [("R1", "bad")]}),
        ("P2", {"name": "B", "department": "X", "reviews": [("R2", "good")]})])
    stats = summaries.run()
    assert (stats["summarized"], stats["rejected"]) == (1, 1)
    assert stats["tokens"] > 100  # the failed call still counts toward the daily cap


def test_groq_json_validate_failed_becomes_bad_json():
    from unittest.mock import MagicMock

    import pytest

    from pipeline import llm

    client = MagicMock()
    client.chat.completions.create.side_effect = Exception("Error code: 400 - {'code': 'json_validate_failed'}")
    with pytest.raises(llm.BadJSON):
        llm.complete_json(client, "m", "p", 10)


def test_groq_daily_limit_stops_at_once_instead_of_retrying(monkeypatch):
    from unittest.mock import MagicMock

    import pytest

    from pipeline import llm

    monkeypatch.setattr(llm.time, "sleep", lambda _s: pytest.fail("should not wait on a daily limit"))
    client = MagicMock()
    client.chat.completions.create.side_effect = Exception(
        "Error code: 429 - Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD)")
    with pytest.raises(llm.DailyLimit):
        llm.complete_json(client, "m", "p", 10)


def test_daily_limit_ends_the_step_and_keeps_finished_work(monkeypatch, tmp_path):
    from unittest.mock import MagicMock

    from pipeline import extract, llm

    replies = iter([({"pros": ["Clear"], "cons": [], "exams": "Fair.", "workload": "Light.", "cited": [1]},
                     MagicMock(total_tokens=100)), llm.DailyLimit("429 tokens per day")])

    def fake(*_args, **_kw):
        r = next(replies)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(llm, "client", lambda: None)
    monkeypatch.setattr(llm, "complete_json", fake)
    monkeypatch.setattr(extract, "RAW_ROOT", tmp_path)
    monkeypatch.setattr(summaries, "pending", lambda: [
        (f"P{i}", {"name": "A", "department": "X", "reviews": [("R1", "ok")]}) for i in range(3)])
    stats = summaries.run()
    assert (stats["summarized"], stats["rejected"]) == (1, 0)
    assert list(tmp_path.glob("professor_summaries/*/*.jsonl"))
