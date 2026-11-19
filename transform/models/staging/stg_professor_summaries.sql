-- LLM summaries, latest per professor. Empty until the first backfill run.
-- The model sometimes writes the prompt's review numbers into the text ("(e.g., 1,5,24)", "[3,4]", "【24】").
-- They mean nothing to a reader (the real citations are cited_review_ids), so they are stripped here.
{% set review_refs = '\s*(\((e\.g\.,?\s*)?\d+(\s*,\s*\d+)*\)|\[\d+(\s*,\s*\d+)*\]|【\d+(\s*,\s*\d+)*】)' %}
select * exclude (rn) replace (
    list_transform(pros, lambda x: trim(regexp_replace(x, '{{ review_refs }}', '', 'g'))) as pros,
    list_transform(cons, lambda x: trim(regexp_replace(x, '{{ review_refs }}', '', 'g'))) as cons,
    trim(regexp_replace(exams, '{{ review_refs }}', '', 'g'))                         as exams,
    trim(regexp_replace(workload, '{{ review_refs }}', '', 'g'))                      as workload
) from (
    select *, row_number() over (partition by professor_id order by generated_at desc) as rn
    from {{ raw_json('professor_summaries', {
        'professor_id': 'VARCHAR', 'reviews_hash': 'VARCHAR', 'pros': 'VARCHAR[]', 'cons': 'VARCHAR[]',
        'exams': 'VARCHAR', 'workload': 'VARCHAR', 'cited_review_ids': 'VARCHAR[]',
        'model': 'VARCHAR', 'generated_at': 'TIMESTAMPTZ'
    }, allow_empty=true) }}
) where rn = 1
