"""Extract UCSD professors and reviews from RateMyProfessors into the raw layer.

Raw layout (Hive-partitioned, append-only):
    <RAW_ROOT>/professors/dt=YYYY-MM-DD/run=<run_id>.jsonl
    <RAW_ROOT>/reviews/dt=YYYY-MM-DD/run=<run_id>.jsonl

One file per run, never overwritten, so re-running on the same day loses nothing.

Incremental: a professor's reviews are only re-fetched when their numRatings
changed since the latest professors snapshot.
"""

import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from pipeline import validate

URL = "https://www.ratemyprofessors.com/graphql"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Authorization": "Basic dGVzdDp0ZXN0",
}
UCSD_ID = "U2Nob29sLTEwNzk="
RAW_ROOT = Path(os.getenv("RAW_ROOT", "data/raw"))
REQUEST_DELAY = 0.5  # seconds between requests, to stay polite to RMP
MIN_RATINGS = 3

PROFESSORS_QUERY = """
query TeacherSearchPaginationQuery($count: Int!, $cursor: String, $query: TeacherSearchQuery!) {
  search: newSearch {
    teachers(query: $query, first: $count, after: $cursor) {
      edges { node {
        id firstName lastName department
        avgRating avgDifficulty numRatings wouldTakeAgainPercent
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}
"""

REVIEWS_QUERY = """
query RatingsListQuery($count: Int!, $id: ID!, $cursor: String) {
  node(id: $id) {
    ... on Teacher {
      ratings(first: $count, after: $cursor) {
        edges { node {
          id date class comment grade
          helpfulRating clarityRating difficultyRating wouldTakeAgain
          attendanceMandatory textbookUse isForCredit ratingTags
          thumbsUpTotal thumbsDownTotal
        } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"""


class ExtractError(RuntimeError):
    pass


def make_session():
    s = requests.Session()
    # GraphQL reads are idempotent, so retrying POST is safe.
    retry = Retry(total=5, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=None)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update(HEADERS)
    return s


def graphql(session, query, variables):
    r = session.post(URL, json={"query": query, "variables": variables}, timeout=20)
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        raise ExtractError(f"GraphQL errors: {body['errors']}")
    time.sleep(REQUEST_DELAY)
    return body["data"]


def paginate(session, query, variables, get_connection, page_size):
    """Yield every node of a GraphQL connection, following cursors to the end."""
    cursor = ""
    while True:
        data = graphql(session, query, {**variables, "count": page_size, "cursor": cursor})
        conn = get_connection(data)
        for edge in conn["edges"]:
            yield edge["node"]
        if not conn["pageInfo"]["hasNextPage"]:
            return
        cursor = conn["pageInfo"]["endCursor"]


def fetch_professors(session, limit):
    profs = []
    nodes = paginate(
        session, PROFESSORS_QUERY, {"query": {"schoolID": UCSD_ID, "fallback": True}},
        lambda d: d["search"]["teachers"], page_size=20,
    )
    for node in nodes:
        profs.append(node)
        if len(profs) >= limit:
            break
    return profs


def fetch_reviews(session, professor_id):
    return list(paginate(
        session, REVIEWS_QUERY, {"id": professor_id},
        lambda d: d["node"]["ratings"], page_size=50,
    ))


def latest_file(table):
    files = sorted((RAW_ROOT / table).glob("dt=*/run=*.jsonl"))  # dt, then run_id: both sort by time
    return files[-1] if files else None


def previous_rating_counts():
    latest = latest_file("professors")
    if latest is None:
        return {}
    with open(latest) as f:
        return {p["id"]: p["numRatings"] for p in map(json.loads, f)}


def changed_professors(professors, previous):
    """Professors whose reviews need (re-)fetching: new, or numRatings changed."""
    return [p for p in professors
            if (p.get("numRatings") or 0) >= MIN_RATINGS and previous.get(p["id"]) != p["numRatings"]]


def write_jsonl(table, dt, run_id, rows):
    out = RAW_ROOT / table / f"dt={dt}"
    out.mkdir(parents=True, exist_ok=True)
    final = out / f"run={run_id}.jsonl"
    tmp = final.with_suffix(".tmp")
    with open(tmp, "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    tmp.rename(final)  # atomic: a crashed run never leaves a half file
    return final


def run(limit=500, full=False):
    session = make_session()
    now = datetime.now(UTC)
    dt, run_id, fetched_at = now.date().isoformat(), now.strftime("%Y%m%dT%H%M%SZ"), now.isoformat()

    previous = {} if full else previous_rating_counts()
    professors = fetch_professors(session, limit)
    todo = changed_professors(professors, previous)
    print(f"{len(professors)} professors, {len(todo)} need review fetch")

    reviews = []
    for i, prof in enumerate(todo, 1):
        for r in fetch_reviews(session, prof["id"]):
            reviews.append({**r, "professor_id": prof["id"], "fetched_at": fetched_at})
        if i % 25 == 0:
            print(f"  {i}/{len(todo)} professors, {len(reviews)} reviews")

    # Professors are written last: their counts are the incremental state, so a
    # crash mid-run means the next run simply retries the same professors.
    reviews, rejects = validate.split(reviews)
    write_jsonl("reviews", dt, run_id, reviews)
    if rejects:
        write_jsonl("rejects", dt, run_id, rejects)
    write_jsonl("professors", dt, run_id, [{**p, "fetched_at": fetched_at} for p in professors])
    stats = {"run_id": run_id, "professors": len(professors), "professors_fetched": len(todo),
             "reviews": len(reviews), "rejected": len(rejects)}
    print(stats)
    return stats


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--full", action="store_true", help="ignore previous snapshot, fetch every professor")
    a = ap.parse_args()
    run(limit=a.limit, full=a.full)
