import os
import sys
import tempfile
import types
from unittest.mock import MagicMock

import duckdb
import pytest
from fastapi.testclient import TestClient

# A tiny serving DB in the same shape the pipeline publishes.
SERVING = os.path.join(tempfile.mkdtemp(), "serving.duckdb")
_db = duckdb.connect(SERVING)
_db.execute("""create table dim_professor as select * from (values
    ('T1', 'Brian Shotwell', 'Physics', 2.6, 4.1, 212, 38.2),
    ('T2', 'Miles Jones', 'Mathematics', 3.7, 3.1, 60, 62.8),
    ('T3', 'Miles Jones', 'Computer Science', 3.7, 3.6, 31, 72.4),
    ('T4', 'Ada Lovelace', 'Computer Science', 4.9, 3.0, 12, 100.0),
    ('T5', 'Ivy Few', 'Mathematics', 5.0, 1.0, 1, 100.0)
) t(professor_id, name, department, avg_rating, avg_difficulty, num_ratings, would_take_again_pct)""")
_db.execute("""create table mart_professor_rating_history as select * from (values
    ('T1', 2.8, 4.0, 200, timestamp '2026-10-01', timestamp '2026-11-01'),
    ('T1', 2.6, 4.1, 212, timestamp '2026-11-01', null)
) t(professor_id, avg_rating, avg_difficulty, num_ratings, valid_from, valid_to)""")
_db.execute("""create table mart_professor_term_trends as
    select 'T1' as professor_id, '2026-FA' as review_quarter, date '2026-10-01' as quarter_start, 5 as reviews,
           3.0 as avg_quality, 4.0 as avg_difficulty""")
_db.execute("""create table mart_course_professors as select * from (values
    ('PHYS2C', 'T1', 'Brian Shotwell', 'Physics', 40, 2.9, 4.2, timestamp '2026-11-10'),
    ('CSE101', 'T4', 'Ada Lovelace', 'Computer Science', 9, 4.9, 3.0, timestamp '2026-06-01')
) t(course_code, professor_id, name, department, reviews, avg_quality, avg_difficulty, last_reviewed_at)""")
_db.execute("""create table mart_professor_attributes as select * from (values
    ('T1', 90.0, 10.0, 80.0, 'free_response', 20),
    ('T4', 5.0, 75.0, 20.0, 'multiple_choice', 6),
    ('T2', 10.0, 100.0, 10.0, 'mixed', 1)
) t(professor_id, attendance_mandatory_pct, curve_pct, workload_score, common_exam_style, attribute_reviews)""")
_db.execute("""create table mart_professor_summaries as select 'T1' as professor_id, ['Clear'] as pros,
    ['Hard exams'] as cons, 'Tough.' as exams, 'Heavy.' as workload, ['R9'] as cited_review_ids,
    timestamp '2026-11-09' as generated_at""")
_db.execute("""create table mart_course_offerings as select * from (values
    ('WI26', 'PHYS2C', 'Shotwell, Brian', 'T1', 'Brian Shotwell', 2.6, 'exact'),
    ('WI26', 'PHYS2C', 'Jones, Miles', null, null, null, 'ambiguous'),
    ('FA25', 'CSE101', 'Lovelace, Ada', 'T4', 'Ada Lovelace', 4.9, 'exact'),
    ('SP26', 'CSE101', 'Lovelace, Ada', 'T4', 'Ada Lovelace', 4.9, 'exact'),
    ('S225', 'CSE101', 'Lovelace, Ada', 'T4', 'Ada Lovelace', 4.9, 'exact'),
    ('WI26', 'CSE101', 'Lovelace, Ada', 'T4', 'Ada Lovelace', 4.9, 'exact')
) t(term, course_code, schedule_instructor, professor_id, name, avg_rating, match_type)""")
_db.execute("""create table mart_professor_review_stats as select * from (values
    ('T1', 2, 10, 5, 3, 20, 0.1, [{'tag': 'tough grader', 'n': 9}]),
    ('T4', 9, 1, 0, 0, 10, 0.9, [{'tag': 'amazing lectures', 'n': 4}]),
    ('T2', 1, 0, 0, 0, 1, 1.0, null)
) t(professor_id, grade_a, grade_b, grade_c, grade_below, graded_reviews, grade_a_pct, top_tags)""")
_db.execute("""create table serving_meta as
    select timestamp '2026-11-09 09:00' as built_at, 21649 as reviews, 500 as professors""")
_db.close()
os.environ["SERVING_PATH"] = SERVING
os.environ.setdefault("GROQ_API_KEY", "test-key")  # CI has no key; the client is replaced with a mock below

# Stub the vector store so importing the API doesn't connect to Pinecone.
fake_vs = types.ModuleType("data.vectorstore")
fake_vs.query = MagicMock(return_value=["Professor: Brian Shotwell\nStudent Review: hard but fair"])
fake_vs.search = MagicMock(return_value=[])
fake_vs.rerank = MagicMock(side_effect=lambda q, matches, top_n=8: matches[:top_n])
sys.modules["data.vectorstore"] = fake_vs

import api.main as main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset():
    fake_vs.query.side_effect = None
    fake_vs.query.reset_mock()
    main.groq_client = MagicMock()
    main._calls.clear()
    main._cache.clear()
    yield


def test_ask_returns_answer_and_uses_configured_model():
    msg = MagicMock(content="Brian Shotwell is hard but fair.")
    main.groq_client.chat.completions.create.return_value = MagicMock(choices=[MagicMock(message=msg)])
    r = client.post("/ask", json={"question": "Who teaches physics?"})
    assert r.status_code == 200
    assert r.json()["answer"] == "Brian Shotwell is hard but fair."
    assert main.groq_client.chat.completions.create.call_args.kwargs["model"] == main.GROQ_MODEL


def test_upstream_failure_is_502_without_leaking_details():
    fake_vs.query.side_effect = RuntimeError("quota exceeded for index rmp-rag")
    r = client.post("/ask", json={"question": "anything"})
    assert r.status_code == 502
    assert "quota" not in r.text and "rmp-rag" not in r.text


def test_professor_names_with_no_break_spaces_are_matched():
    found = main.extract_professors("Take Prof. Brian Shotwell or Brian Shotwell.")
    assert [p["name"] for p in found] == ["Brian Shotwell"]


def test_empty_model_answer_is_502_not_crash():
    msg = MagicMock(content=None)
    main.groq_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=msg, finish_reason="length")]
    )
    r = client.post("/ask", json={"question": "anything"})
    assert r.status_code == 502


def test_oversized_or_malformed_requests_are_rejected_before_any_llm_call():
    too_long = client.post("/ask", json={"question": "x" * 501})
    too_long_department = client.post("/ask", json={"question": "hi", "department": "x" * 101})
    assert [too_long.status_code, too_long_department.status_code] == [422, 422]
    main.groq_client.chat.completions.create.assert_not_called()


def test_professors_filters_sorts_and_never_takes_sql_from_input():
    r = client.get("/professors", params={"department": "Computer Science", "sort": "rating"}).json()
    assert [p["name"] for p in r["professors"]] == ["Ada Lovelace", "Miles Jones"] and r["total"] == 2
    # An unknown sort falls back to the whitelist default instead of reaching the SQL.
    evil = client.get("/professors", params={"sort": "avg_rating; drop table dim_professor", "search": "' or 1=1 --"})
    assert evil.status_code == 200 and evil.json()["total"] == 0


def test_search_filters_combine_and_each_is_toggleable():
    names = lambda **f: [p["name"] for p in client.get("/professors", params=f).json()["professors"]]  # noqa: E731
    total = lambda **f: client.get("/professors", params=f).json()["total"]  # noqa: E731
    assert total(department=["Physics", "Mathematics"]) == 3       # departments are OR'd together
    assert names(min_rating=4) == ["Ada Lovelace", "Ivy Few"]
    assert names(difficulty="easy") == ["Ivy Few"]
    assert total(difficulty=["easy", "hard"]) == 3                 # difficulty levels are OR'd too
    assert total(min_wta=70) == 3 and total(min_ratings=10) == 4
    assert total(department="Computer Science", min_rating=4) == 1  # different groups are AND'd


def test_facets_count_what_each_toggle_would_give():
    f = client.get("/professors", params={"department": "Computer Science"}).json()["facets"]
    # a group's own counts ignore that group's choice, so other departments still show their sizes
    assert f["department"] == {"Computer Science": 2, "Mathematics": 2, "Physics": 1}
    assert f["difficulty"] == {"easy": 0, "medium": 1, "hard": 1}
    assert f["min_rating"]["4.0"] == 1


def test_ratings_range_and_histogram():
    total = lambda **f: client.get("/professors", params=f).json()["total"]  # noqa: E731
    assert total(min_ratings=10, max_ratings=60) == 3   # 60, 31 and 12 ratings
    assert total(min_ratings=50, max_ratings=10) == 0   # an upside-down range matches nothing
    hist = client.get("/professors").json()["facets"]["ratings_histogram"]
    assert hist == {"0": 1, "5": 0, "10": 1, "20": 1, "50": 1, "100": 1}  # bucket lower edges


def test_best_grades_sort_discounts_few_reports():
    names = [p["name"] for p in client.get("/professors", params={"sort": "grades"}).json()["professors"]]
    # Miles Jones has 1 reported A (100%) but ranks below Ada's 9 of 10; no grade data goes last
    assert names[:3] == ["Ada Lovelace", "Miles Jones", "Brian Shotwell"]
    card = client.get("/professors", params={"search": "Ada"}).json()["professors"][0]
    assert card["grade_a_pct"] == 0.9 and card["top_tags"][0]["tag"] == "amazing lectures"


def test_bad_filter_values_are_rejected():
    assert client.get("/professors", params={"difficulty": "extreme"}).status_code == 422
    assert client.get("/professors", params={"min_rating": 9}).status_code == 422


def test_top_rated_needs_more_than_one_rating():
    # a single 5.0 must not outrank 3.7 across 60 ratings
    r = client.get("/professors", params={"department": "Mathematics"}).json()
    assert [p["name"] for p in r["professors"]] == ["Miles Jones", "Ivy Few"]


def test_departments_and_health():
    assert client.get("/departments").json()["departments"] == ["Computer Science", "Mathematics", "Physics"]
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["reviews"] == 21649


def test_cards_follow_mention_order_and_duplicate_names_keep_bigger_profile():
    cards = main.extract_professors("Try Miles Jones first, or Brian Shotwell.")
    assert [(c["name"], c["num_ratings"]) for c in cards] == [("Miles Jones", 60), ("Brian Shotwell", 212)]


def test_llm_gets_current_averages_for_retrieved_professors():
    line = main.current_ratings(["Professor: Brian Shotwell\nStudent Review: x"])
    assert "Brian Shotwell: overall 2.6/5, difficulty 4.1/5, would take again 38%, 212 ratings" in line


def test_sql_cannot_read_files_on_the_server():
    with pytest.raises(duckdb.PermissionException):
        main.rows("select * from read_text('requirements.txt')")


def answer_with(text):
    msg = MagicMock(content=text)
    main.groq_client.chat.completions.create.return_value = MagicMock(choices=[MagicMock(message=msg)])


def test_repeat_question_is_served_from_cache():
    answer_with("Cached answer.")
    first = client.post("/ask", json={"question": "Who is easy?"})
    second = client.post("/ask", json={"question": "  who IS easy? "})
    assert first.json() == second.json()
    assert main.groq_client.chat.completions.create.call_count == 1


def test_eleventh_question_in_a_minute_is_rate_limited():
    answer_with("ok")
    codes = [client.post("/ask", json={"question": f"q{i}"}).status_code for i in range(11)]
    assert codes == [200] * 10 + [429]


def test_rate_limit_uses_proxy_appended_ip_not_spoofed_first_entry():
    req = MagicMock(headers={"x-forwarded-for": "6.6.6.6, 203.0.113.9"})
    assert main.client_ip(req) == "203.0.113.9"


def test_security_headers_present():
    h = client.get("/health").headers
    assert h["x-content-type-options"] == "nosniff" and "frame-ancestors 'none'" in h["content-security-policy"]


def test_professor_detail_has_grades_and_courses():
    p = client.get("/professors/T1").json()
    assert p["grades"] == {"a": 2, "b": 10, "c": 5, "below": 3}
    assert [c["course_code"] for c in p["by_course"]] == ["PHYS2C"]
    assert client.get("/professors/T3").json()["grades"] is None


def test_professor_courses_show_the_last_term_taught():
    # T4 taught CSE101 in FA25, S225, WI26 and SP26: SP26 is newest (text order would wrongly say WI26)
    assert client.get("/professors/T4").json()["by_course"][0]["last_term"] == "SP26"
    assert client.get("/professors/T1").json()["by_course"][0]["last_term"] == "WI26"


def test_professor_detail_has_history_and_quarters():
    p = client.get("/professors/T1").json()
    assert p["name"] == "Brian Shotwell" and [h["avg_rating"] for h in p["rating_history"]] == [2.8, 2.6]
    assert p["by_quarter"][0]["review_quarter"] == "2026-FA"
    assert client.get("/professors/NOPE").status_code == 404


def test_course_lookup_normalizes_the_code():
    assert [p["name"] for p in client.get("/courses/phys 2c").json()["professors"]] == ["Brian Shotwell"]
    assert client.get("/courses/cse-101").json()["course_code"] == "CSE101"
    # ambiguous name matches are left out rather than shown with a guessed professor
    assert [o["schedule_instructor"] for o in client.get("/courses/PHYS2C").json()["offerings"]] == ["Shotwell, Brian"]


def test_course_terms_are_newest_first():
    # term codes sort wrong as text ("WI26" > "SP26" > "FA25"); order by year, then quarter
    terms = [o["term"] for o in client.get("/courses/CSE101").json()["offerings"]]
    assert terms == ["SP26", "WI26", "FA25", "S225"]


def test_attribute_filters_need_enough_evidence():
    names = lambda **f: [p["name"] for p in client.get("/professors", params=f).json()["professors"]]  # noqa: E731
    assert names(curved=True) == ["Ada Lovelace"]          # Miles Jones has 100% curve but 1 review
    assert names(no_attendance=True, light_workload=True) == ["Ada Lovelace"]
    assert "Brian Shotwell" not in names(no_attendance=True)


def test_professor_detail_includes_summary_when_present():
    assert client.get("/professors/T1").json()["summary"]["cons"] == ["Hard exams"]
    assert client.get("/professors/T4").json()["summary"] is None
    assert client.get("/professors/T1").json()["verdict"] == "Clear"
    assert client.get("/professors/T4").json()["verdict"] is None


def test_sources_are_numbered_citation_cards():
    doc = ("Professor: Brian Shotwell\nDepartment: Physics\nClass: PHYS2C\nReviewed: 2026-02-14\n"
           "Student Review: Hard: but fair.")
    assert main.parse_source(3, doc) == {"n": 3, "professor": "Brian Shotwell", "department": "Physics",
                                         "course": "PHYS2C", "reviewed": "2026-02-14", "quote": "Hard: but fair."}


def test_fullwidth_citations_are_normalized():
    assert main.normalize_citations("Hard exams【2】 and quizzes【7†L1-L4】.") == "Hard exams[2] and quizzes[7]."


def test_course_list_filters_by_code_prefix_and_shows_last_term():
    every = client.get("/courses").json()
    assert [c["course_code"] for c in every["courses"]] == ["PHYS2C", "CSE101"] and every["total"] == 2
    cse = client.get("/courses", params={"search": "cse 1"}).json()["courses"]
    assert cse == [{"course_code": "CSE101", "instructors": 1, "reviews": 9, "avg_quality": 4.9, "last_term": "SP26"}]
    assert client.get("/courses", params={"search": "x" * 21}).status_code == 422
