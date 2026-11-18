import json

import duckdb
import pytest

from api import router


@pytest.fixture
def cur():
    con = duckdb.connect(config={"enable_external_access": False, "lock_configuration": True})
    con.execute("create table dim_professor as select 'T1' as professor_id, 'Ada' as name, 4.9::double as avg_rating")
    con.execute("create table secrets as select 'x' as k")
    return con.cursor()


def test_routing_is_a_keyword_check():
    assert router.is_analytical("Who are the hardest CS professors?")
    assert router.is_analytical("Compare Kane vs Dasgupta")
    assert not router.is_analytical("Is Professor Kane a good lecturer?")


def test_a_plain_select_on_allowed_tables_runs(cur):
    assert router.run_sql(cur, "select name, avg_rating from dim_professor order by 2 desc;") == [
        {"name": "Ada", "avg_rating": 4.9}]


@pytest.mark.parametrize("sql", [
    "delete from dim_professor",                       # not a SELECT
    "select 1; select * from dim_professor",           # two statements
    "select * from secrets",                           # table not on the allow-list
    "select * from read_text('/etc/passwd')",          # file-reading table function
    "select * from dim_professor, read_csv('https://example.com/x.csv')",
    "with t as (select * from secrets) select * from t",
    "select 1",                                        # reads no allowed table
])
def test_anything_else_is_refused_before_running(cur, sql):
    with pytest.raises(ValueError):
        router.run_sql(cur, sql)


def test_results_are_capped(cur):
    cur.execute("create table mart_department_stats as select range as department from range(100)")
    assert len(router.run_sql(cur, "select * from mart_department_stats")) == router.MAX_ROWS


class FakeGroq:
    """Replies with the given SQL strings in order and keeps the prompts it was sent."""

    def __init__(self, *sqls):
        self.replies, self.sent = [json.dumps({"sql": s}) for s in sqls], []
        self.chat = self.completions = self

    def create(self, messages, **_):
        self.sent.append(messages)
        content = self.replies.pop(0)
        return type("R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": content})})]})


def test_the_prompt_lists_real_department_names_and_a_failed_query_is_retried_once(cur):
    cur.execute("alter table dim_professor add column department varchar default 'Mathematics'")
    groq = FakeGroq("select name, workload from dim_professor", "select name, avg_rating from dim_professor")
    table, sql = router.database_context(groq, "m", cur, "Easiest math professor?")
    assert "Mathematics" in groq.sent[0][0]["content"]
    assert "workload" in groq.sent[1][-1]["content"]  # the retry is shown its own error
    assert sql == "select name, avg_rating from dim_professor" and "Ada" in table


def test_a_query_that_fails_twice_raises_so_the_api_falls_back_to_reviews(cur):
    cur.execute("alter table dim_professor add column department varchar default 'Mathematics'")
    with pytest.raises(duckdb.BinderException):
        router.database_context(FakeGroq("select nope from dim_professor", "select nope2 from dim_professor"),
                                "m", cur, "q")
