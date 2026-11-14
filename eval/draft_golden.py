"""Draft the golden question set: one realistic student question per sampled review.

Writes eval/golden.jsonl with the question and the id of the review that answers it.
Review text is never written, since the repo is public. Every line starts with
"reviewed": false; the owner flips it after checking the question.
"""

import json
import os
import time

import duckdb
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

WAREHOUSE_PATH = os.getenv("WAREHOUSE_PATH", "data/warehouse.duckdb")
OUT = "eval/golden.jsonl"
MODEL = "openai/gpt-oss-20b"

# Spread across departments; long-enough recent reviews so a question can be specific.
SAMPLE_SQL = """
select review_id, professor_id, course_code, comment, name, department from (
    select r.review_id, r.professor_id, r.course_code, r.comment, p.name, p.department,
           row_number() over (partition by p.department order by hash(r.review_id)) as k
    from fct_review r join dim_professor p using (professor_id)
    where length(r.comment) >= 150 and year(r.reviewed_at) >= 2020 and p.department is not null
)
order by k, hash(review_id)
limit ?
"""

PROMPT = """Write ONE short question (under 15 words) the way a UCSD student would type it into a
professor-review chatbot, which this specific review would answer. Use the professor's last name
and the course code. Ask about one concrete topic the review covers (exams, workload, grading,
attendance...) in casual words. Do not reuse the review's wording. Output only the question.

Professor: {name} ({department})
Course: {course_code}
Review: {comment}"""


def draft(n=50):
    groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
    con = duckdb.connect(WAREHOUSE_PATH, read_only=True)
    cur = con.execute(SAMPLE_SQL, [n])
    cols = [d[0] for d in cur.description]
    with open(OUT, "w") as f:
        for qid, row in enumerate((dict(zip(cols, r, strict=True)) for r in cur.fetchall()), 1):
            resp = groq.chat.completions.create(
                model=MODEL, messages=[{"role": "user", "content": PROMPT.format(**row)}],
                temperature=0.7, max_tokens=300, reasoning_effort="low",
            )
            question = (resp.choices[0].message.content or "").strip().strip('"')
            f.write(json.dumps({"qid": qid, "question": question, "relevant": [row["review_id"]],
                                "professor_id": row["professor_id"], "reviewed": False}) + "\n")
            print(qid, question)
            time.sleep(2)  # stay well under the provider's per-minute token limit


if __name__ == "__main__":
    draft()
