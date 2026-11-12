select
    professor_id,
    review_quarter,
    count(*)                    as reviews,
    round(avg(quality), 2)      as avg_quality,
    round(avg(difficulty), 2)   as avg_difficulty
from {{ ref('fct_review') }}
group by professor_id, review_quarter
