"""Run the pipeline end to end: extract -> dbt build (audit) -> embed -> publish.

Write-audit-publish: dbt builds and tests into the warehouse. Only when every test
passes are the marts copied into serving.duckdb, the file the API reads. A failed run
leaves the previous serving.duckdb untouched.
"""

import os
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from pipeline import embed, extract

WAREHOUSE_PATH = os.getenv("WAREHOUSE_PATH", "data/warehouse.duckdb")
SERVING_PATH = os.getenv("SERVING_PATH", "data/serving.duckdb")
# Tables the API may read. fct_review is excluded on purpose: it holds raw review text.
SERVING_TABLES = ["dim_professor", "mart_department_stats", "mart_professor_term_trends"]


def dbt(*args):
    cmd = [sys.executable, "-m", "dbt.cli.main", *args, "--project-dir", "transform", "--profiles-dir", "transform"]
    return subprocess.run(cmd, check=False).returncode == 0


def publish():
    tmp = Path(SERVING_PATH).with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    con.execute(f"attach '{WAREHOUSE_PATH}' as wh (read_only)")
    for t in SERVING_TABLES:
        con.execute(f"create table {t} as select * from wh.main.{t}")
    # Facts for the site's "Data updated <date> · <n> reviews" line.
    con.execute("""create table serving_meta as select
        now() as built_at,
        (select count(*) from wh.main.fct_review) as reviews,
        (select count(*) from wh.main.dim_professor) as professors""")
    con.close()
    shutil.move(tmp, SERVING_PATH)  # atomic swap: the API never sees a half-written file


def run(limit=500, skip_embed=False):
    started = datetime.now(UTC)
    timings, stats, status = {}, {}, "success"

    def stage(name, fn):
        t = time.perf_counter()
        result = fn()
        timings[name] = round(time.perf_counter() - t, 2)
        return result

    try:
        stats["extract"] = stage("extract", lambda: extract.run(limit=limit))
        if not stage("dbt_build", lambda: dbt("build")):
            raise RuntimeError("dbt build failed: serving data not updated")
        if not skip_embed:
            stats["embed"] = stage("embed", embed.run)
        stage("publish", publish)
    except Exception as e:
        status = f"failed: {e}"
        raise
    finally:
        log = {"run_id": stats.get("extract", {}).get("run_id", started.strftime("%Y%m%dT%H%M%SZ")),
               "started_at": started.isoformat(), "finished_at": datetime.now(UTC).isoformat(),
               "status": status, "stage_seconds": timings, **_flatten(stats)}
        extract.write_jsonl("pipeline_runs", started.date().isoformat(), log["run_id"], [log])
        print(log)


def _flatten(stats):
    return {f"{stage}_{k}": v for stage, s in stats.items() for k, v in s.items() if k != "run_id"}


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--skip-embed", action="store_true")
    a = ap.parse_args()
    run(limit=a.limit, skip_embed=a.skip_embed)
