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
