-- Freshness: the newest professor snapshot must be recent, or the weekly pipeline has stopped.
-- An empty table fails too (max() is null). CI runs against old fixtures and raises freshness_days.
select max(last_seen_at) as newest
from {{ ref('dim_professor') }}
having max(last_seen_at) is null
    or max(last_seen_at) < now() - interval ({{ var('freshness_days', 8) }}) day
