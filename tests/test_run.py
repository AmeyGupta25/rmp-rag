import json

import pytest

from pipeline import extract, run


def latest_run_log(tmp_path):
    (f,) = (tmp_path / "raw" / "pipeline_runs").glob("*/*.jsonl")
    return json.loads(f.read_text())


@pytest.fixture
def paths(monkeypatch, tmp_path):
    monkeypatch.setattr(extract, "RAW_ROOT", tmp_path / "raw")
    monkeypatch.setattr(run, "SERVING_PATH", str(tmp_path / "serving.duckdb"))
    monkeypatch.setattr(extract, "run", lambda limit: {"run_id": "20260105T120000Z", "reviews": 7})
    return tmp_path


def test_failed_audit_publishes_nothing_but_records_the_failure(monkeypatch, paths):
    monkeypatch.setattr(run, "dbt", lambda *args: False)
    with pytest.raises(RuntimeError, match="dbt build failed"):
        run.run(skip_embed=True)

    assert not (paths / "serving.duckdb").exists()
    log = latest_run_log(paths)
    assert log["status"].startswith("failed")
    assert log["extract_reviews"] == 7


def test_successful_run_publishes(monkeypatch, paths):
    monkeypatch.setattr(run, "dbt", lambda *args: True)
    published = []
    monkeypatch.setattr(run, "publish", lambda: published.append(True))
    run.run(skip_embed=True)

    assert published == [True]
    assert latest_run_log(paths)["status"] == "success"
