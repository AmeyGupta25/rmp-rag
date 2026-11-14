-- Current state of each professor (their most recent snapshot).
select * exclude (fetched_at), fetched_at as last_seen_at
from {{ ref('stg_professor_snapshots') }}
qualify row_number() over (partition by professor_id order by fetched_at desc) = 1
