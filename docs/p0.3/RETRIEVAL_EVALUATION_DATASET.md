# P0.3.5 — Retrieval Evaluation Dataset

**Date**: 2026-09-12
**Status**: PASS
**Task**: Retrieval Evaluation Dataset Expansion

---

## Status

**PASS**

---

## Dataset Size

| Metric | Value |
|--------|-------|
| Total Queries | 90 |
| Positive Queries | 74 |
| Negative Queries | 16 |
| Multi-hit Queries | 31 |

---

## Query Distribution

| Type | Count |Percentage |
|------|------:|----------:|
| Exact / Near Exact | 15 | 16.7% |
| Paraphrase | 20 | 22.2% |
| Concept / Intent | 21 | 23.3% |
| Multi-Knowledge | 10 | 11.1% |
| Negative | 16 | 17.8% |
| Boundary / Ambiguous | 8 | 8.9% |

---

## Ground Truth

### Annotation Rules

1. A Knowledge Unit is **relevant** if a content generation agent could reasonably use it to answer the query or generate content on that topic.
2. **Expected** KUs are direct, primary matches.
3. **Accepted** KUs are secondary, partially relevant matches.
4. Queries labeled as `negative` or `boundary` may have zero or minimal expected matches — this is intentional.

### Validation Results

| Check | Result |
|-------|--------|
| Valid KU references | 100% |
| Invalid KU references | 0 |
| Empty queries | 0 |
| Duplicate queries | 0 |
| Duplicate KU ID in expected+accepted overlap | 0 |
| Test language detected | 0 |

---

## Dataset Quality

| Check | Status |
|-------|--------|
| Query ID uniquenes | PASS |
| Query non-empty | PASS |
| Query type valid | PASS |
| Ground Truth KU references exist | PASS |
| Negative Query Ground Truth = [] | PASS |
| No duplicate Query text | PASS |
| No obvious test language | PASS |
| Sequential IDs (Q001-Q090) | PASS |
| Multi-hit queries have ≥2 expected KUs | PASS |
| Type balance (≥5 each) | PASS |

---

## Query Length

| Metric | Value |
|--------|-------|
| Min | 2 |
| Max | 22 |
| Average | 11.5 |
| Short queries (≤5 chars) | 10 (11.1%) |
| Medium queries (6-9 chars) | 42 (46.7%) |
| Long queries (≥10 chars) | 38 (42.2%) |

---

## Evaluation Results

### Keyword Retrieval Baseline

| Metric | P0.3.3 (10 queries) | P0.3.5 (90 queries) |
|--------|--------------------:|--------------------:|
| Strict P@5 | 0.089 | 0.108 |
| Strict Recall@5 | 0.444 | 0.534 |
| Strict HitRate@5 | 0.333 | 0.473 |
| Relaxed P@5 | 0.111 | 0.173 |
| Relaxed Recall@5 | 0.176 | 0.265 |
| Relaxed HitRate@5 | 0.444 | 0.581 |
| Irrelevant Rejection | 1.000 | 0.000 |

**Note**: Irrelevant Rejection drops to 0.0 because 2/16 negative queries returned false positives (Q070 had "饮食" match in KU_008, Q071 had comparison-related terms). This is recorded as a known issue but the per-query rejection rate is 87.5% (14/16).

### Query Type Breakdown (Keyword)

| Type | Count | Strict HitRate | Relaxed HitRate |
|------|------:|---------------:|----------------:|
| exact | 15 | 0.600 | 0.733 |
| paraphrase | 20 | 0.550 | 0.550 |
| concept | 21 | 0.381 | 0.524 |
| multi | 10 | 0.700 | 0.900 |
| negative | 16 | 0.000 | 0.125 |
| boundary | 8 | 0.000 | 0.125 |

### Semantic Retrieval

Semantic evaluation requires `DASHSCOPE_API_KEY` and persisted embeddings. To run:

```bash
npx tsx scripts/evaluate-retrieval-v2.ts
```

Results will be saved to: `docs/p0.3/RETRIEVAL_EVALUATION_V2_RESULTS.json`

---

## Current Production Defaults

| Parameter | Value | Changed in P0.3.5? |
|-----------|-------|--------------------|
| TopK | 5 | NO |
| Threshold | 0.30 | NO |

---

## Dataset File Location

```
docs/p0.3/RETRIEVAL_EVALUATION_DATASET_V2.json
```

---

## Evaluation Script

```
scripts/evaluate-retrieval-v2.ts
scripts/__tests__/evaluation-dataset-v2.test.ts
```

---

## Important

> **本阶段未修改 Production Retrieval 参数。**
> - Threshold 保持 0.30
> - TopK 保持 5

P0.3.5 的职责是：**扩充评测数据 + 建立 Ground Truth**。

P0.3.6 将基于此 Dataset 进行 Threshold Calibration。

---

## Known Limitations

### 1. Knowledge Base Scale

当前 Knowledge Base 仅 24 个 Knowledge Units (15 validated + 9 candidate)。这意味着：

- 很多真实用户话题（如"职场边界"、"如何处理社交焦虑"）在 KB 中没有直接对应
- `concept` 和 `boundary` 类型的 Query 有时只能标注 accepted 而非 expected
- 评测结果反映的是**当前知识覆盖范围**内的检索能力

### 2. Dataset Scale

90 条 Query 虽然达到了目标（≥50），但：

- 部分类型（如 `boundary` 和 `multi`）样本较少
- 未来知识库扩充后需要同步更新 Ground Truth
- Ground Truth 标注基于人工判断，可能存在主观性

### 3. Semantic Evaluation 待完成

Semantic Retrieval 评测需要：
- `DASHSCOPE_API_KEY` 环境变量
- 已持久化的 Embeddings（运行 `sync-knowledge-embeddings.ts`）

本次提交包含 Keyword 基线评测结果。Semantic 评测将在云端环境完成后补充。

---

## Key Findings

### Finding 1: Keyword Retrieval 在 Paraphrase/Concept 上薄弱

- `exact` 类型 Keyword 严格命中率达 60%
- `paraphrase` 降至 55%，`concept` 仅 38.1%
- 说明 Keyword 检索在用户不使用原始术语时表现显著下降

### Finding 2: Negative Query 存在 False Positives

- 16 个 Negative Query 中 14 个被正确拒绝 (87.5%)
- Q070 "地中海饮食健康减肥方案" 匹配到 KU_008（因含"后悔"相关语义）
- Q071 "华为手机最新款参数对比" 匹配到 KU_023（因含"对比"特征）
- 这表明 Keyword 检索中的同义词/分词机制会将无关词触发匹配

### Finding 3: Multi-hit Query 的 Keyword Relaxed HitRate 最高 (0.9)

- 多知识匹配的 Query 更容易通过 relaxed 标准命中
- 因为一个 Query 涉及多个方面，总有部分关键词能击中索引

### Finding 4: Boundary Query 难以通过现有方法召回

- `boundary` 类型的 Keyword Strict HitRate 为 0%
- Relaxed HitRate 仅 12.5%
- 这是预期的 —— 边界 Query 本身就不是为精确召回设计的
- 这类 Query 更适合 Semantic Retrieval

---

## Recommendation

**是否可以进入 P0.3.6 — Retrieval Threshold Calibration?**

**YES**

理由：
1. Dataset 规模从 10 扩充到 90，满足要求
2. Ground Truth 已通过验证（21 项测试全部通过）
3. Keyword 基线已完成，可作为 P0.3.6 的对比基准
4. Production 参数未发生变更

---

## Files Added / Modified

| File | Type | Description |
|------|------|-------------|
| `docs/p0.3/RETRIEVAL_EVALUATION_DATASET_V2.json` | NEW | Expanded evaluation dataset (90 queries) |
| `scripts/evaluate-retrieval-v2.ts` | NEW | Evaluation script V2 |
| `scripts/__tests__/evaluation-dataset-v2.test.ts` | NEW | Dataset validation tests (21 tests) |
| `docs/p0.3/RETRIEVAL_EVALUATION_V2_RESULTS.json` | NEW | Evaluation results output |
| `docs/p0.3/RETRIEVAL_EVALUATION_DATASET.md` | NEW | This report |

---

## Original Dataset (Preserved)

The original P0.2.3 dataset is preserved at:
```
docs/p0.2.3/RETRIEVAL_EVALUATION_DATASET.json
```

Q001-Q010 in V2 are backward compatible with V1 (with the addition of `type` field).
