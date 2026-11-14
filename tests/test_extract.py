import json

import pytest

from pipeline import extract


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


class FakeSession:
    """Returns canned GraphQL pages in order and records the cursors it was asked for."""

    def __init__(self, pages):
        self.pages = list(pages)
        self.cursors = []

    def post(self, url, json, timeout):
        self.cursors.append(json["variables"]["cursor"])
        return FakeResponse(self.pages.pop(0))


def review_page(ids, has_next, end_cursor=None):
    return {"data": {"node": {"ratings": {
        "edges": [{"node": {"id": i}} for i in ids],
        "pageInfo": {"hasNextPage": has_next, "endCursor": end_cursor},
    }}}}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch, tmp_path):
    monkeypatch.setattr(extract, "REQUEST_DELAY", 0)
    monkeypatch.setattr(extract, "RAW_ROOT", tmp_path)


def test_fetch_reviews_follows_every_page():
    s = FakeSession([review_page(["a", "b"], True, "c1"), review_page(["c"], False)])
    assert [r["id"] for r in extract.fetch_reviews(s, "T1")] == ["a", "b", "c"]
    assert s.cursors == ["", "c1"]


def test_graphql_errors_raise_instead_of_truncating():
    s = FakeSession([{"errors": [{"message": "rate limited"}], "data": None}])
    with pytest.raises(extract.ExtractError):
        extract.fetch_reviews(s, "T1")


def test_changed_professors_picks_new_and_changed_only():
    profs = [
        {"id": "same", "numRatings": 10},
        {"id": "changed", "numRatings": 12},
        {"id": "new", "numRatings": 5},
        {"id": "too_few", "numRatings": 2},
    ]
    previous = {"same": 10, "changed": 11}
    assert [p["id"] for p in extract.changed_professors(profs, previous)] == ["changed", "new"]


def test_same_day_runs_never_overwrite_and_latest_snapshot_wins(tmp_path):
    extract.write_jsonl("professors", "2026-11-11", "20261111T100000Z", [{"id": "p", "numRatings": 3}])
    extract.write_jsonl("professors", "2026-11-11", "20261111T120000Z", [{"id": "p", "numRatings": 4}])
    files = sorted((tmp_path / "professors").glob("dt=*/run=*.jsonl"))
    assert len(files) == 2
    assert not list(tmp_path.rglob("*.tmp"))
    assert extract.previous_rating_counts() == {"p": 4}
    assert json.loads(files[0].read_text()) == {"id": "p", "numRatings": 3}
