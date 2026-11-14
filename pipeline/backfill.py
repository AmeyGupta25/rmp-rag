"""Daily LLM backfill: review attributes (C) and professor summaries (D), then publish.

Each step spends at most LLM_DAILY_TOKEN_CAP tokens and resumes where it stopped, so the
one-time backfill takes about 9 days; after that, daily runs find almost nothing to do.
Publishing still goes through dbt tests first (write-audit-publish).
"""

from pipeline import attributes, run, summaries


def main():
    if not run.dbt("build"):  # the steps read the warehouse to find pending work
        raise RuntimeError("dbt build failed before backfill")
    stats = {"attributes": attributes.run(), "summaries": summaries.run()}
    if not run.dbt("build"):
        raise RuntimeError("dbt build failed after backfill: serving data not updated")
    run.publish()
    print(stats)


if __name__ == "__main__":
    main()
