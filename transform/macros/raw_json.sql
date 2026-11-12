{#- Read one raw table (every dt partition, every run file) with an explicit schema,
    so an upstream field change fails loudly here instead of drifting silently. -#}
{% macro raw_json(table, columns) %}
read_json(
    '{{ var("raw_root") }}/{{ table }}/*/*.jsonl',
    format = 'newline_delimited',
    hive_partitioning = true,
    columns = {{ columns }}
)
{% endmacro %}
