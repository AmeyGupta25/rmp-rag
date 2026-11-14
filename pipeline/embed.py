"""Embed new or changed reviews from the warehouse into Pinecone.

Idempotent: vector id = RMP review id, and each vector stores the sha256 of the exact
document it was built from. Pinecone is the record of what is already embedded, so
only reviews whose hash is missing or different get re-embedded.
"""

import hashlib
import os
import time

import duckdb
from dotenv import load_dotenv
from pinecone import Pinecone
from pinecone.exceptions import PineconeApiException

load_dotenv()

WAREHOUSE_PATH = os.getenv("WAREHOUSE_PATH", "data/warehouse.duckdb")
NAMESPACE = os.getenv("PINECONE_NAMESPACE", "reviews")
MODEL = "multilingual-e5-large"
EMBED_BATCH = 96  # Pinecone inference limit per call for this model
UPSERT_BATCH = 100

REVIEWS_SQL = """
select r.review_id, r.course_code, r.comment, r.grade, r.quality, r.difficulty,
       r.would_take_again, r.reviewed_at, p.name as professor, p.department
from fct_review r join dim_professor p using (professor_id)
where r.comment is not null
"""


def build_document(row):
    wta = {True: "Yes", False: "No"}.get(row["would_take_again"], "Unknown")
    return "\n".join([
        f"Professor: {row['professor']}",
        f"Department: {row['department'] or 'Unknown'}",
        f"Class: {row['course_code'] or 'Unknown'}",
        # This review's own ratings only. The professor's averages change with every new
        # review, and would force re-embedding all of their reviews; the API adds them live.
        f"Quality: {row['quality']}/5",
        f"Difficulty: {row['difficulty']}/5",
        f"Would Take Again: {wta}",
        f"Grade Received: {row['grade'] or 'N/A'}",
        f"Reviewed: {row['reviewed_at']:%Y-%m-%d}",
        f"Student Review: {row['comment']}",
    ])


def content_hash(document):
    return hashlib.sha256(document.encode()).hexdigest()


def plan_upserts(rows, existing_hashes):
    """Rows whose document is new or changed, each paired with its document and hash."""
    todo = []
    for row in rows:
        doc = build_document(row)
        h = content_hash(doc)
        if existing_hashes.get(row["review_id"]) != h:
            todo.append((row, doc, h))
    return todo


def embed_with_backoff(pc, docs, attempts=6):
    """On a 429 (provider rate limit) wait and retry instead of failing the run."""
    for attempt in range(attempts):
        try:
            return pc.inference.embed(model=MODEL, inputs=docs, parameters={"input_type": "passage"})
        except PineconeApiException as e:
            if e.status != 429 or attempt == attempts - 1:
                raise
            time.sleep(15 * (attempt + 1))


def stale_ids(existing_hashes, rows):
    """Vectors whose review is gone from the warehouse (e.g. removed on RMP)."""
    return sorted(existing_hashes.keys() - {row["review_id"] for row in rows})


def existing_hashes(index):
    hashes = {}
    for ids in index.list(namespace=NAMESPACE):
        fetched = index.fetch(ids=ids, namespace=NAMESPACE).vectors
        hashes.update({vid: v.metadata.get("content_hash") for vid, v in fetched.items()})
    return hashes


def load_rows():
    con = duckdb.connect(WAREHOUSE_PATH, read_only=True)
    cur = con.execute(REVIEWS_SQL)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r, strict=True)) for r in cur.fetchall()]


def run():
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX"))

    rows = load_rows()
    existing = existing_hashes(index)
    todo = plan_upserts(rows, existing)
    stale = stale_ids(existing, rows)
    print(f"{len(rows)} reviews in warehouse, {len(todo)} new or changed, {len(stale)} to delete")

    for i in range(0, len(stale), 1000):  # Pinecone accepts up to 1000 ids per delete
        index.delete(ids=stale[i:i + 1000], namespace=NAMESPACE)

    for i in range(0, len(todo), EMBED_BATCH):
        batch = todo[i:i + EMBED_BATCH]
        embeddings = embed_with_backoff(pc, [doc for _, doc, _ in batch])
        vectors = [{
            "id": row["review_id"],
            "values": emb.values,
            "metadata": {
                "text": doc,
                "content_hash": h,
                "professor": row["professor"],
                "department": row["department"] or "",
                "class": row["course_code"] or "",
                "reviewed_at": row["reviewed_at"].isoformat(),
            },
        } for (row, doc, h), emb in zip(batch, embeddings, strict=True)]
        for j in range(0, len(vectors), UPSERT_BATCH):
            index.upsert(vectors=vectors[j:j + UPSERT_BATCH], namespace=NAMESPACE)
        print(f"  embedded {min(i + EMBED_BATCH, len(todo))}/{len(todo)}")

    return {"reviews": len(rows), "embedded": len(todo), "deleted": len(stale)}


if __name__ == "__main__":
    print(run())
