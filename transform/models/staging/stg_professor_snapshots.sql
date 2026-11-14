-- One row per professor per pipeline run: the history that rating trends are built from.
with raw as (
    select * from {{ raw_json('professors', {
        'id': 'VARCHAR', 'firstName': 'VARCHAR', 'lastName': 'VARCHAR', 'department': 'VARCHAR',
        'avgRating': 'DOUBLE', 'avgDifficulty': 'DOUBLE', 'numRatings': 'INTEGER',
        'wouldTakeAgainPercent': 'DOUBLE', 'fetched_at': 'TIMESTAMPTZ'
    }) }}
)
select distinct on (id, fetched_at)
    id                                         as professor_id,
    trim(firstName || ' ' || lastName)         as name,
    nullif(trim(department), '')               as department,
    avgRating                                  as avg_rating,
    avgDifficulty                              as avg_difficulty,
    numRatings                                 as num_ratings,
    -- RMP sends -1 when nobody answered "would take again"
    case when wouldTakeAgainPercent < 0 then null else wouldTakeAgainPercent end as would_take_again_pct,
    fetched_at
from raw
