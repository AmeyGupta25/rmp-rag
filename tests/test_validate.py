from pipeline import validate

GOOD = {"id": "R1", "professor_id": "T1", "date": "2026-11-11 06:48:53 +0000 UTC",
        "clarityRating": 5, "helpfulRating": 4, "difficultyRating": 3, "wouldTakeAgain": None}


def test_good_record_passes():
    assert validate.split([GOOD]) == ([GOOD], [])


def test_each_structural_problem_is_rejected_with_its_reason():
    bad = [
        {**GOOD, "id": ""},
        {**GOOD, "date": "yesterday"},
        {**GOOD, "difficultyRating": 9},
        {**GOOD, "wouldTakeAgain": 2},
    ]
    valid, rejects = validate.split(bad)
    assert valid == []
    reasons = [r["reason"].split(":")[0] for r in rejects]
    assert reasons == ["id", "date", "difficultyRating", "wouldTakeAgain"]
    assert rejects[2]["record"]["difficultyRating"] == 9
