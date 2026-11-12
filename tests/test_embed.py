from datetime import UTC, datetime

from pipeline import embed


def row(review_id="R1", comment="Great lectures."):
    return {
        "review_id": review_id, "course_code": "CSE101", "comment": comment,
        "grade": "A", "quality": 4.5, "difficulty": 3, "would_take_again": True,
        "reviewed_at": datetime(2026, 1, 5, tzinfo=UTC),
        "professor": "Sanjoy Dasgupta", "department": "Computer Science",
    }


def test_rerun_with_unchanged_reviews_embeds_nothing():
    rows = [row("R1"), row("R2")]
    existing = {r["review_id"]: embed.content_hash(embed.build_document(r)) for r in rows}
    assert embed.plan_upserts(rows, existing) == []


def test_new_and_edited_reviews_are_embedded():
    old = row("R1")
    existing = {"R1": embed.content_hash(embed.build_document(old))}
    todo = embed.plan_upserts([row("R1", comment="Edited: hard exams."), row("R2")], existing)
    assert [r["review_id"] for r, _, _ in todo] == ["R1", "R2"]


def test_professor_average_is_not_part_of_the_hashed_document():
    # A new review elsewhere moves the professor's average; that must not re-embed this review.
    r = row("R1")
    assert embed.build_document({**r, "avg_rating": 4.0}) == embed.build_document({**r, "avg_rating": 3.1})


def test_reviews_removed_from_warehouse_are_deleted():
    assert embed.stale_ids({"R1": "h", "R2": "h", "GONE": "h"}, [row("R1"), row("R2")]) == ["GONE"]
