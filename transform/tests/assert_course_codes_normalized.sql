-- Invariant: course codes are uppercase letters and digits only ("CSE 101", "cse-101" -> "CSE101").
select course_code from {{ ref('stg_reviews') }}
where course_code is not null and not regexp_full_match(course_code, '[A-Z0-9]+')
