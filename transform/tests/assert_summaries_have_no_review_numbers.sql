-- Invariant: summary text carries no prompt review numbers ("(1,5,24)", "[3]", "【24】"); citations live in cited_review_ids.
select professor_id from {{ ref('stg_professor_summaries') }}
where regexp_matches(array_to_string(pros || cons || [exams, workload], ' | '), '\(\s*(e\.g\.,?\s*)?\d+(\s*,\s*\d+)*\)|\[\d+(\s*,\s*\d+)*\]|【')
