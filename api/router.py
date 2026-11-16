"""Feature A: answer ranking/comparison questions from the ratings tables, not from 8 reviews.

Routing is a keyword check (no extra LLM call). For a ranking-style question the LLM writes one
SQL query; the query is only run if DuckDB's own parser shows a single SELECT over allow-listed
tables. It runs on the API's locked connection (no file or network access) with a timeout.
LLM output is untrusted input here. Any failure falls back to the normal review search.
"""

import json
import re
import threading

ALLOWED_TABLES = {"dim_professor", "mart_professor_attributes", "mart_course_professors", "mart_department_stats"}
MAX_ROWS = 20
TIMEOUT_S = 2.0

ANALYTICAL = re.compile(
    r"\b(best|worst|easiest|hardest|highest|lowest|top|most|least|rank\w*|compare|versus|vs\.?|"
    r"how many|average|better|harder|easier)\b", re.I)

SCHEMA = """Tables (DuckDB):
dim_professor(professor_id, name, department, avg_rating 0-5, avg_difficulty 0-5, num_ratings,
              would_take_again_pct 0-100)
mart_professor_attributes(professor_id, attendance_mandatory_pct 0-100,
                          says_curved_pct 0-100 (share of reviews mentioning a curve that say yes; null under 5),
                          says_curved, curve_mentions,
                          workload_score 0-100 (higher = heavier), common_exam_style, attribute_reviews)
mart_course_professors(course_code like 'CSE101', professor_id, name, department, reviews,
                       avg_quality 1-5, avg_difficulty 1-5, last_reviewed_at)
mart_department_stats(department, professors, reviews, avg_quality, avg_difficulty, would_take_again_pct)"""

PROMPT = """Write ONE DuckDB SELECT that answers the student's question from these tables.
{schema}
Rules: a single SELECT (no CTEs, no other statements), only these tables, include name and the numbers
that justify the answer, prefer professors with num_ratings >= 5 for rankings, LIMIT {max_rows}.
Course codes have no spaces ("CSE 101" -> 'CSE101'). {department}
Reply with JSON: {{"sql": "..."}}

Question: {question}"""


def is_analytical(question):
    return bool(ANALYTICAL.search(question))


def _walk(node, found):
    if isinstance(node, dict):
        if node.get("type") == "BASE_TABLE":
            found.append(node.get("table_name"))
        elif node.get("type") == "TABLE_FUNCTION":
            found.append("function:" + str(node.get("function", {}).get("function_name")))
        for v in node.values():
            _walk(v, found)
    elif isinstance(node, list):
        for v in node:
            _walk(v, found)
    return found


def check_sql(cursor, sql):
    """Raise ValueError unless sql is exactly one SELECT reading only allow-listed tables."""
    parsed = json.loads(cursor.execute("select json_serialize_sql(?)", [sql]).fetchall()[0][0])
    if parsed.get("error"):
        raise ValueError(f"not a single SELECT: {parsed.get('error_message')}")
    if len(parsed["statements"]) != 1:
        raise ValueError("more than one statement")
    used = set(_walk(parsed, []))
    if not used or not used <= ALLOWED_TABLES:
        raise ValueError(f"disallowed tables or functions: {sorted(used - ALLOWED_TABLES)}")


def run_sql(cursor, sql):
    check_sql(cursor, sql)
    timer = threading.Timer(TIMEOUT_S, cursor.interrupt)  # a runaway query is cancelled, not waited on
    timer.start()
    try:
        result = cursor.execute(f"select * from ({sql.rstrip().rstrip(';')}) limit {MAX_ROWS}")
        cols = [d[0] for d in result.description]
        return [dict(zip(cols, r, strict=True)) for r in result.fetchall()]
    finally:
        timer.cancel()


def database_context(groq_client, model, cursor, question, department=""):
    """Rows answering an analytical question, formatted for the prompt, plus the SQL used."""
    dept = f"The student filtered to the {department} department." if department else ""
    resp = groq_client.chat.completions.create(
        model=model, temperature=0, max_tokens=700, reasoning_effort="low",
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": PROMPT.format(
            schema=SCHEMA, max_rows=MAX_ROWS, department=dept, question=question)}],
    )
    sql = json.loads(resp.choices[0].message.content)["sql"]
    found = run_sql(cursor, sql)
    if not found:
        return "", sql
    header = " | ".join(found[0])
    lines = [" | ".join(str(v) for v in r.values()) for r in found]
    return ("Results from the ratings database. These are the authoritative numbers: base any ranking, order "
            "and figures ONLY on these rows (each is a professor's average over all reviews). Use the reviews "
            "only to explain why, never as a source of ratings:\n" + "\n".join([header, *lines])), sql
