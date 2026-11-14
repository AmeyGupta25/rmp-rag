-- Grades students reported and the RMP tags they picked, per professor. Counts only: no review text.
-- "Not sure yet", "Rather not say", Incomplete, Drop, Audit and Pass are not grades on the A-F scale, so they're left out.
with banded as (
    select
        professor_id,
        case
            when grade in ('A+', 'A', 'A-') then 'a'
            when grade in ('B+', 'B', 'B-') then 'b'
            when grade in ('C+', 'C', 'C-') then 'c'
            when grade in ('D+', 'D', 'D-', 'F') then 'below'
        end as band
    from {{ ref('fct_review') }}
),

grades as (
    select
        professor_id,
        count(*) filter (where band = 'a')     as grade_a,
        count(*) filter (where band = 'b')     as grade_b,
        count(*) filter (where band = 'c')     as grade_c,
        count(*) filter (where band = 'below') as grade_below,
        count(band)                            as graded_reviews
    from banded
    group by professor_id
),

-- RMP stores a review's tags as one string: "Tough Grader--Get ready to read--Hilarious".
-- Case varies between reviews ("ACCESSIBLE OUTSIDE CLASS"), so tags are compared lowercased.
tag_rows as (
    select professor_id, lower(trim(unnest(string_split(rating_tags, '--')))) as tag
    from {{ ref('fct_review') }}
    where rating_tags is not null
),

tag_counts as (
    select professor_id, tag, count(*) as n
    from tag_rows
    where tag <> ''
    group by all
    having count(*) >= 2  -- one student's tag isn't a pattern
),

top_tags as (
    select professor_id, list({'tag': tag, 'n': n} order by n desc, tag)[1:4] as top_tags
    from tag_counts
    group by professor_id
)

select
    g.*,
    round(g.grade_a / nullif(g.graded_reviews, 0), 3) as grade_a_pct,
    t.top_tags
from grades g
left join top_tags t using (professor_id)
