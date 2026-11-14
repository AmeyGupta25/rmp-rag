-- Subject code -> RMP department, learned from our own data: the department most professors
-- reviewed for that subject's courses belong to (e.g. CSE -> Computer Science).
select regexp_extract(r.course_code, '^[A-Z]+') as subject, mode(p.department) as department
from {{ ref('fct_review') }} r join {{ ref('dim_professor') }} p using (professor_id)
where p.department is not null and regexp_matches(r.course_code, '^[A-Z]{2,5}[0-9]')
group by 1
