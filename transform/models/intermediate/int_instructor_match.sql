-- Entity resolution: schedule instructor name -> RMP professor.
--   exact      name + department agree
--   name_only  name agrees with exactly one professor, department differs or unknown
--   ambiguous  name matches several professors and department can't break the tie
--   override   fixed by hand in seeds/instructor_overrides.csv
with s as (select distinct schedule_instructor, name_key, subject from {{ ref('stg_schedule') }}),
candidates as (
    select s.schedule_instructor, s.subject, p.professor_id,
           p.department = d.department as same_department,
           count(*) over (partition by s.schedule_instructor, s.subject) as n_candidates
    from s
    join {{ ref('dim_professor') }} p on lower(p.name) = s.name_key
    left join {{ ref('int_subject_department') }} d on d.subject = s.subject
),
picked as (
    select schedule_instructor, subject,
           -- a unique department match wins; otherwise a unique name match; otherwise ambiguous
           case when count(*) filter (where same_department) = 1
                    then any_value(professor_id) filter (where same_department)
                when max(n_candidates) = 1 then any_value(professor_id) end as professor_id,
           case when count(*) filter (where same_department) = 1 then 'exact'
                when max(n_candidates) = 1 then 'name_only'
                else 'ambiguous' end as match_type
    from candidates group by all
)
select s.schedule_instructor, s.subject,
       coalesce(o.professor_id, p.professor_id)                                   as professor_id,
       case when o.professor_id is not null then 'override'
            else coalesce(p.match_type, 'no_rmp_profile') end                    as match_type
from s
left join picked p using (schedule_instructor, subject)
left join {{ ref('instructor_overrides') }} o using (schedule_instructor)
