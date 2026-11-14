-- SCD2 invariant: every professor has exactly one open (current) rating period.
select professor_id
from {{ ref('mart_professor_rating_history') }}
group by professor_id
having count(*) filter (where is_current) != 1
