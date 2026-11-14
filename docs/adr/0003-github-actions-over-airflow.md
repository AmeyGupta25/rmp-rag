# 3. GitHub Actions over Airflow for orchestration

- **Status:** Accepted
- **Date:** 2026-11-13

## Context
ProfAI runs two scheduled jobs:
- **Weekly pipeline:** extract → validate → dbt build and tests → embed → publish.
- **Daily LLM backfill:** attributes → summaries → audit → publish.

A third workflow, a daily freshness check, guards both. Each job is a straight line of steps on one machine, over a few MB of data.

Airflow is the industry-standard orchestrator, so we evaluated it before deciding.

## Decision
GitHub Actions schedules and runs the jobs. Airflow is not used.

## Why
- **The workload doesn't need an orchestrator.** Airflow earns its keep with many interdependent jobs: sensors that wait on other systems, retrying single tasks out of dozens, backfilling hundreds of partitions from a UI, and teams sharing one scheduler. ProfAI has none of these.
- **The guarantees an orchestrator would provide are already in the pipeline:**
  - **Idempotent loads:** Pinecone IDs are review IDs.
  - **Incremental work:** content hashes skip unchanged reviews.
  - **Write-audit-publish:** a failed dbt test blocks the publish to `serving/`.
  - **Failures are visible:** raw files and run logs upload even when a run fails.
  - **Staleness alerts:** a daily freshness check fails loudly if data is over 8 days old.
  - **Resumable backfill:** it is checkpointed per batch.
  - **No overlap:** a shared concurrency group stops the two jobs from overlapping.
- **Hosting Airflow doesn't fit the budget.** Managed Airflow (MWAA, Cloud Composer, Astronomer) costs about $100–400 a month. A self-hosted server needs 2–4 GB of RAM running 24/7. The project runs at about $0.
- **Airflow with no server adds a layer without adding capability.** Running `airflow dags test` inside Actions keeps Actions as the scheduler, keeps no run history and has no UI.
- **It would also need a second Python environment.** Measured on 2026-11-13 with this repo's pins and Python 3.12:
  - Airflow 3.4.0's official constraints pin `pathspec==1.1.1` and `isodate==0.7.2`. dbt (`dbt-common`) requires `pathspec<1.1`, and older releases require `isodate<0.7`. So Airflow and `dbt-duckdb==1.11.1` cannot be installed together the supported way.
  - The API's `fastapi==0.135.2` is too old for Airflow 3.4.0. An unconstrained install falls back to Airflow 3.3.2, with untested versions such as SQLAlchemy 2.1.8 where Airflow tested 2.0.55.

  Every run would pay that extra install time, and the second environment is one more thing to maintain.

## Consequences
- Run history, logs and failure emails come from the GitHub Actions tab. There is no orchestrator UI.
- **Retries are per run, not per step.** Re-running a workflow is safe because every step is idempotent.
- GitHub disables scheduled workflows after 60 days without repo activity. Each workflow re-enables the others through the GitHub API.

## When to revisit
Move to a real orchestrator if any of these become true:
- a third data source, or jobs that depend on each other
- manual reruns or backfills of many past dates
- per-step retries and alerting beyond rerunning the workflow
- more than one person operating the pipeline

At that point, run a hosted Airflow server or use Dagster, which models dbt assets natively. The migration is small: each stage in `pipeline/run.py` and `pipeline/backfill.py` already has a clean boundary and becomes one task.
