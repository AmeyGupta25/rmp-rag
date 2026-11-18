| Retrieval | recall@1 | recall@5 | recall@10 | MRR | p50 ms | p95 ms |
|---|---|---|---|---|---|---|
| dense | 0.262 | 0.635 | 0.757 | 0.745 | 292.3 | 1519.0 |
| dense + rerank | 0.332 | 0.771 | 0.936 | 0.877 | 546.8 | 800.6 |

| SQL rankings | same top pick | top-3 overlap | failed | p50 ms | questions |
|---|---|---|---|---|---|
| router vs reference | 0.842 | 0.754 | 0 | 662.4 | 19 |
