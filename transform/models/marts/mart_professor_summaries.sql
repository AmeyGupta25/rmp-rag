select professor_id, pros, cons, exams, workload, cited_review_ids, generated_at
from {{ ref('stg_professor_summaries') }}
where professor_id in (select professor_id from {{ ref('dim_professor') }})
