-- Per-professor filters. Attendance comes from RMP's own field (all reviews); exam style,
-- curve and workload from the LLM step (reviews since 2020, current comment text only).
with a as (
    select r.professor_id, r.attendance_mandatory, x.exam_style, x.curve, x.workload
    from {{ ref('fct_review') }} r
    left join {{ ref('stg_review_attributes') }} x
      on x.review_id = r.review_id and x.comment_hash = sha256(r.comment)
)
select
    professor_id,
    round(100 * avg(case when attendance_mandatory then 1.0 when not attendance_mandatory then 0.0 end), 1)
        as attendance_mandatory_pct,
    -- Of the reviews that say whether grades were curved, the share that say yes. Only 1 in 9 reviews says,
    -- so it stays null under 5 such reviews: "100%" from 3 comments would read as a sure thing.
    case when count(*) filter (where curve in ('yes', 'no')) >= 5
         then round(100 * avg(case curve when 'yes' then 1.0 when 'no' then 0.0 end), 1) end as says_curved_pct,
    count(*) filter (where curve = 'yes')                                        as says_curved,
    count(*) filter (where curve in ('yes', 'no'))                               as curve_mentions,
    round(100 * avg(case workload when 'heavy' then 1.0 when 'light' then 0.0
                                  when 'moderate' then 0.5 end), 1)              as workload_score,
    mode(exam_style) filter (where exam_style not in ('unknown'))                as common_exam_style,
    count(curve) filter (where curve != 'unknown' or workload != 'unknown')      as attribute_reviews
from a
group by professor_id
