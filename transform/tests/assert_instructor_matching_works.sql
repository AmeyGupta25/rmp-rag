-- Entity-resolution quality: of the schedule instructors whose name exists on RMP, at least
-- 90% must resolve to a single professor (exact, name_only or override). Passes when empty.
select count(*) filter (where match_type = 'ambiguous') as ambiguous, count(*) as name_found
from {{ ref('int_instructor_match') }}
where match_type != 'no_rmp_profile'
having count(*) > 0 and count(*) filter (where match_type = 'ambiguous') > 0.1 * count(*)
