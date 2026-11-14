-- SCD Type 2: one row per period during which a professor's RMP averages stayed the same.
-- Built from the weekly snapshots (not a dbt snapshot): the warehouse is rebuilt every run,
-- and the raw layer already keeps every snapshot.
with snaps as (
    select professor_id, avg_rating, avg_difficulty, num_ratings, fetched_at,
           lag(avg_rating) over w as prev_rating,
           lag(avg_difficulty) over w as prev_difficulty,
           lag(num_ratings) over w as prev_count
    from {{ ref('stg_professor_snapshots') }}
    window w as (partition by professor_id order by fetched_at)
),
changes as (
    select * from snaps
    where prev_count is null  -- first time seen
       or avg_rating is distinct from prev_rating
       or avg_difficulty is distinct from prev_difficulty
       or num_ratings is distinct from prev_count
)
select
    professor_id, avg_rating, avg_difficulty, num_ratings,
    fetched_at                                                         as valid_from,
    lead(fetched_at) over (partition by professor_id order by fetched_at) as valid_to,
    lead(fetched_at) over (partition by professor_id order by fetched_at) is null as is_current
from changes
