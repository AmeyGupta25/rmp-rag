-- Runs only on CI's synthetic data (var ci_fixtures): the known schedule names must resolve as expected.
{% if var('ci_fixtures', false) %}
with expected(schedule_instructor, match_type) as (values
    ('Lovelace, Ada K', 'exact'), ('Turing, Alan Mathison', 'exact'), ('Nobody, Some', 'no_rmp_profile'))
select e.*, m.match_type as got
from expected e left join {{ ref('int_instructor_match') }} m using (schedule_instructor)
where m.match_type is distinct from e.match_type
{% else %}
select 1 where false
{% endif %}
