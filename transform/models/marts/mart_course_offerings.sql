-- Who taught which course in which term (schedule archive), linked to RMP where possible.
select sc.term, sc.course_code, sc.schedule_instructor, m.professor_id, m.match_type, p.name, p.avg_rating
from {{ ref('stg_schedule') }} sc
left join {{ ref('int_instructor_match') }} m using (schedule_instructor, subject)
left join {{ ref('dim_professor') }} p using (professor_id)
