-- Every professor who has taught a course (per reviews), side by side. No review text.
select
    r.course_code,
    r.professor_id,
    p.name,
    p.department,
    count(*)                    as reviews,
    round(avg(r.quality), 2)    as avg_quality,
    round(avg(r.difficulty), 2) as avg_difficulty,
    max(r.reviewed_at)          as last_reviewed_at
from {{ ref('fct_review') }} r
join {{ ref('dim_professor') }} p using (professor_id)
where r.course_code is not null
group by all
