-- Course offerings from UCSD's public schedule archive (one-time import per term).
select distinct
    term,
    course_code,
    trim(instructor)                                                       as schedule_instructor,
    -- "Jones, Miles E" -> "miles jones" (first given name + family name), the form RMP uses
    lower(trim(split_part(split_part(instructor, ',', 2), ' ', 2)) || ' ' || trim(split_part(instructor, ',', 1)))
                                                                           as name_key,
    regexp_extract(course_code, '^[A-Z]+')                                 as subject
from {{ raw_json('schedule', {
    'term': 'VARCHAR', 'course_code': 'VARCHAR', 'instructor': 'VARCHAR', 'fetched_at': 'TIMESTAMPTZ'
}, allow_empty=true) }}
where instructor is not null and instructor not ilike '%staff%'
