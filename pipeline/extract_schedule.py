"""Feature B: one-time import of who taught which course, from UCSD's public schedule archive.

UCSD's current class system needs a login (never automated). The old public Schedule of
Classes still serves past terms, so this runs once per term, rate-limited, and keeps the
result in the raw layer. Only subjects that appear in our reviews are fetched.
"""

import argparse
import re
import time
from datetime import UTC, datetime

import duckdb

from pipeline import extract

URL = "https://act.ucsd.edu/scheduleOfClasses/scheduleOfClassesStudentResult.htm"
DEFAULT_TERMS = ["FA25", "WI26", "SP26"]
DELAY = 1.0  # one request per second
SUBJECTS_PER_SEARCH = 1  # one per search: an unknown subject code makes the whole search return nothing

COURSE = re.compile(r"courseId=([A-Z]+\d+[A-Z]*)\s*'")
INSTRUCTOR = re.compile(r"sendMail\([^)]*\)\">\s*([^<]+?)\s*</a>")


def parse_page(html):
    """(course_code, instructor) for every lecture or seminar section on one results page."""
    found, course = [], None
    # A course header (with its courseId link) precedes that course's section rows.
    for chunk in re.split(r'(?=<tr class="sectxt">)|(?=courseId=)', html):
        if m := COURSE.match(chunk):
            course = m.group(1)
        elif chunk.startswith('<tr class="sectxt">') and re.search(r'title="(Lecture|Seminar)"', chunk) and course:
            found += [(course, name) for name in INSTRUCTOR.findall(chunk)]
    return found


def page_count(html):
    m = re.search(r"Page\s*\(\d+&nbsp;of&nbsp;(\d+)\)", html)
    return int(m.group(1)) if m else 1


def subjects(warehouse="data/warehouse.duckdb"):
    con = duckdb.connect(warehouse, read_only=True)
    rows = con.execute("""select distinct regexp_extract(course_code, '^[A-Z]+') from fct_review
                          where regexp_matches(course_code, '^[A-Z]{2,5}[0-9]')""").fetchall()
    return sorted(r[0] for r in rows)


def get(session, params):
    time.sleep(DELAY)
    r = session.get(URL, params=params, timeout=30)
    r.raise_for_status()
    return r.text


def fetch_term(term, subject_codes):
    rows = []
    for i in range(0, len(subject_codes), SUBJECTS_PER_SEARCH):
        group = subject_codes[i:i + SUBJECTS_PER_SEARCH]
        session = extract.make_session()  # the site keeps one search per session; start each group clean
        html = get(session, {"selectedTerm": term, "selectedSubjects": group})
        rows += parse_page(html)
        for page in range(2, page_count(html) + 1):  # paging continues the search stored in the session
            rows += parse_page(get(session, {"page": page}))
        print(f"  {term}: subjects {i + len(group)}/{len(subject_codes)}, {len(rows)} lecture rows")
    if not rows:
        raise RuntimeError(f"{term}: no lectures parsed; the page format may have changed")
    return rows


def run(terms):
    codes = subjects()
    now = datetime.now(UTC)
    for term in terms:
        rows = fetch_term(term, codes)
        unique = sorted(set(rows))
        extract.write_jsonl("schedule", now.date().isoformat(), f"{now:%Y%m%dT%H%M%SZ}-{term}",
                            [{"term": term, "course_code": c, "instructor": i, "fetched_at": now.isoformat()}
                             for c, i in unique])
        print(f"{term}: {len(unique)} course-instructor pairs from {len(codes)} subjects")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--terms", nargs="+", default=DEFAULT_TERMS)
    run(ap.parse_args().terms)
