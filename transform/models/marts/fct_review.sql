select
    r.*,
    -- RMP has no term field; a review's posting month approximates the quarter it covers.
    year(r.reviewed_at) || '-' || case
        when month(r.reviewed_at) <= 3 then 'WI'
        when month(r.reviewed_at) <= 6 then 'SP'
        when month(r.reviewed_at) <= 9 then 'SU'
        else 'FA' end                                            as review_quarter
from {{ ref('stg_reviews') }} r
where r.professor_id in (select professor_id from {{ ref('dim_professor') }})
