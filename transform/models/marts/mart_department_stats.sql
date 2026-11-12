select
    p.department,
    count(distinct p.professor_id)                                   as professors,
    count(r.review_id)                                               as reviews,
    round(avg(r.quality), 2)                                         as avg_quality,
    round(avg(r.difficulty), 2)                                      as avg_difficulty,
    round(100 * avg(case when r.would_take_again then 1.0
                         when not r.would_take_again then 0.0 end), 1) as would_take_again_pct
from {{ ref('dim_professor') }} p
left join {{ ref('fct_review') }} r using (professor_id)
where p.department is not null
group by p.department
