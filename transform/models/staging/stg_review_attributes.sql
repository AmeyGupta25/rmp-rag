-- LLM-extracted attributes, latest per review. Empty until the first backfill run.
select * exclude (rn) from (
    select *, row_number() over (partition by review_id order by extracted_at desc) as rn
    from {{ raw_json('review_attributes', {
        'review_id': 'VARCHAR', 'comment_hash': 'VARCHAR', 'exam_style': 'VARCHAR',
        'curve': 'VARCHAR', 'workload': 'VARCHAR', 'model': 'VARCHAR', 'extracted_at': 'TIMESTAMPTZ'
    }, allow_empty=true) }}
) where rn = 1
