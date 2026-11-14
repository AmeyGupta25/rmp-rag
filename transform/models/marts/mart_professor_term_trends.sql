select
    professor_id,
    review_quarter,
    min(date_trunc('quarter', reviewed_at))::date as quarter_start,  -- for chronological sorting
    count(*)                    as reviews,
    round(avg(quality), 2)      as avg_quality,
    round(avg(difficulty), 2)   as avg_difficulty
from {{ ref('fct_review') }}
group by professor_id, review_quarter
