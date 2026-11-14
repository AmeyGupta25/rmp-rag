{#- Read one raw table (every dt partition, every run file) with an explicit schema,
    so an upstream field change fails loudly here instead of drifting silently.
    allow_empty is only for LLM-derived tables, which have no files before the first
    backfill; DuckDB then returns no columns, so a typed zero-row select supplies them. -#}
{% macro raw_json(table, columns, allow_empty=false) %}
{%- set source -%}
read_json(
    '{{ var("raw_root") }}/{{ table }}/*/*.jsonl',
    format = 'newline_delimited',
    hive_partitioning = true,
    columns = {{ columns }}{% if allow_empty %},
    allow_empty = true{% endif %}
)
{%- endset -%}
{%- if allow_empty -%}
(select {{ columns.keys() | join(', ') }} from (
    select {% for c, t in columns.items() %}null::{{ t }} as {{ c }}{{ ", " if not loop.last }}{% endfor %} where false
    union all by name
    select * from {{ source }}
))
{%- else -%}
{{ source }}
{%- endif -%}
{% endmacro %}
