-- Latest version of every review. A professor's reviews are re-fetched whenever their
-- rating count changes, so the same review id can appear in several runs.
with raw as (
    select * from {{ raw_json('reviews', {
        'id': 'VARCHAR', 'professor_id': 'VARCHAR', 'date': 'VARCHAR', 'class': 'VARCHAR',
        'comment': 'VARCHAR', 'grade': 'VARCHAR', 'helpfulRating': 'INTEGER', 'clarityRating': 'INTEGER',
        'difficultyRating': 'INTEGER', 'wouldTakeAgain': 'INTEGER', 'attendanceMandatory': 'VARCHAR',
        'textbookUse': 'INTEGER', 'isForCredit': 'BOOLEAN', 'ratingTags': 'VARCHAR',
        'thumbsUpTotal': 'INTEGER', 'thumbsDownTotal': 'INTEGER', 'fetched_at': 'TIMESTAMPTZ'
    }) }}
),
-- Each fetch pulls ALL of a professor's reviews, so the latest fetch is the complete,
-- current set. Older fetches only matter for professors not re-fetched since.
-- This drops reviews that were removed on RMP.
current_fetch as (
    select * from raw
    qualify fetched_at = max(fetched_at) over (partition by professor_id)
),
latest as (
    select * from current_fetch
    qualify row_number() over (partition by id order by fetched_at desc) = 1
)
select
    id                                                             as review_id,
    professor_id,
    strptime(date, '%Y-%m-%d %H:%M:%S %z UTC')                     as reviewed_at,
    nullif(trim(class), '')                                        as class_raw,
    -- "CSE 101", "cse101", "CSE-101" -> "CSE101"
    nullif(upper(regexp_replace(class, '[^A-Za-z0-9]', '', 'g')), '') as course_code,
    nullif(trim(comment), '')                                      as comment,
    nullif(trim(grade), '')                                        as grade,
    (helpfulRating + clarityRating) / 2.0                          as quality,
    difficultyRating                                               as difficulty,
    case wouldTakeAgain when 1 then true when 0 then false end     as would_take_again,
    -- RMP sends both spellings: 'mandatory'/'non mandatory' and 'Y'/'N'
    case when attendanceMandatory in ('mandatory', 'Y') then true
         when attendanceMandatory in ('non mandatory', 'N') then false end as attendance_mandatory,
    textbookUse                                                    as textbook_use_code,
    isForCredit                                                    as is_for_credit,
    nullif(ratingTags, '')                                         as rating_tags,
    thumbsUpTotal                                                  as thumbs_up,
    thumbsDownTotal                                                as thumbs_down,
    fetched_at
from latest
