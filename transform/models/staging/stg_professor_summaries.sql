-- LLM summaries, latest per professor. Empty until the first backfill run.
select * exclude (rn) from (
    select *, row_number() over (partition by professor_id order by generated_at desc) as rn
    from {{ raw_json('professor_summaries', {
        'professor_id': 'VARCHAR', 'reviews_hash': 'VARCHAR', 'pros': 'VARCHAR[]', 'cons': 'VARCHAR[]',
        'exams': 'VARCHAR', 'workload': 'VARCHAR', 'cited_review_ids': 'VARCHAR[]',
        'model': 'VARCHAR', 'generated_at': 'TIMESTAMPTZ'
    }, allow_empty=true) }}
) where rn = 1
