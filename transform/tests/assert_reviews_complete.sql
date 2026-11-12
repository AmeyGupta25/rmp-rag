-- Completeness: held reviews should match RMP's own rating count for nearly every professor.
-- Catches truncated pagination (the original scraper silently kept only 20 per professor).
-- Aggregate on purpose: one small professor with a deleted review must not block publishing.
with held as (
    select professor_id, count(*) as held from {{ ref('fct_review') }} group by professor_id
),
per_professor as (
    select p.num_ratings, coalesce(h.held, 0) as held
    from {{ ref('dim_professor') }} p
    left join held h using (professor_id)
    where p.num_ratings >= 3
)
select
    count(*) filter (where held < 0.9 * num_ratings) as professors_short,
    count(*) as professors_checked
from per_professor
having count(*) filter (where held < 0.9 * num_ratings) > 0.02 * count(*)
