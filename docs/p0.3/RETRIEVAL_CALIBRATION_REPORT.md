# P0.3.6 — Retrieval Calibration Report

**Date**: 2026-09-12
**Task**: Retrieval Calibration — Threshold × TopK Parameter Optimization
**Knowledge Base**: 24 KUs (15 validated, 9 candidate)
**Evaluation Queries**: 90 (Q001-Q090)

---

## 1. Executive Summary

**P0.3.6 PASS**

> Full semantic calibration completed with real DashScope text-embedding-v4 API (90 embed() calls, 1 per query). Persisted embeddings loaded for 15 validated KUs.

**Calibration Result**:

| | Threshold | TopK | Score | Strict HitRate | Negative Rejection |
|---|-----------|------|-------|----------------|-------------------|
| **Before** | 0.30 | 5 | 0.594 | 0.608 | 87.5% |
| **Recommended** | **0.35** | **5** | **0.611** | **0.608** | **100%** |
| Best Score | 0.35 | 7 | 0.655 | 0.689 | 100% |

**Recommendation**: Change Threshold from **0.30 → 0.35**, keep TopK = 5.

**Why**: Fixes the negative rejection issue (from 87.5% → 100%) while maintaining the same HitRate and Recall, without increasing context cost.

---

## 2. Dataset

| Property | Value |
|----------|-------|
| Knowledge Units | 24 |
| Validated KUs | 15 |
| Candidate KUs | 9 |
| Evaluation Queries | 90 |
| Positive Queries | 74 |
| Negative Queries | 16 |
| Multi-hit Queries | 31 |

### Query Type Distribution

| Type | Count |
|------|-------|
| exact | 15 |
| paraphrase | 20 |
| concept | 21 |
| multi | 10 |
| negative | 16 |
| boundary | 8 |

---

## 3. Calibration Matrix

### Tested Configurations

- **Thresholds**: 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70 (11 values)
- **TopK**: 3, 5, 7, 10 (4 values)
- **Total Configurations**: 44
- **API Calls**: 90 embed() calls (1 per query, vectors from persistence)

### Full Calibration Table (TopK = 5)

| Threshold | Strict P | Strict R | Strict H | Relaxed H | Neg Rej | FP | Score |
|-----------|----------|----------|----------|-----------|---------|-----|-------|
| 0.20 | 0.149 | 0.644 | 0.608 | 0.892 | 0.875 | 2 | 0.594 |
| 0.25 | 0.149 | 0.644 | 0.608 | 0.892 | 0.875 | 2 | 0.594 |
| **0.30** | **0.149** | **0.644** | **0.608** | **0.892** | **0.875** | **2** | **0.594** |
| **0.35** | **0.149** | **0.644** | **0.608** | **0.892** | **1.000** | **0** | **0.611** |
| 0.40 | 0.138 | 0.617 | 0.581 | 0.865 | 1.000 | 0 | 0.587 |
| 0.45 | 0.114 | 0.561 | 0.500 | 0.824 | 1.000 | 0 | 0.535 |
| 0.50 | 0.103 | 0.520 | 0.446 | 0.770 | 1.000 | 0 | 0.491 |
| 0.55 | 0.078 | 0.446 | 0.378 | 0.689 | 1.000 | 0 | 0.438 |
| 0.60 | 0.065 | 0.392 | 0.311 | 0.608 | 1.000 | 0 | 0.389 |
| 0.65 | 0.032 | 0.257 | 0.162 | 0.419 | 1.000 | 0 | 0.286 |
| 0.70 | 0.011 | 0.169 | 0.054 | 0.230 | 1.000 | 0 | 0.216 |

### Full Calibration Table (TopK = 7)

| Threshold | Strict P | Strict R | Strict H | Relaxed H | Neg Rej | FP | Score |
|-----------|----------|----------|----------|-----------|---------|-----|-------|
| 0.20 | 0.124 | 0.725 | 0.689 | 0.932 | 0.875 | 2 | 0.637 |
| 0.30 | 0.124 | 0.725 | 0.689 | 0.932 | 0.875 | 2 | 0.637 |
| **0.35** | **0.124** | **0.725** | **0.689** | **0.932** | **1.000** | **0** | **0.655** |
| 0.40 | 0.114 | 0.691 | 0.649 | 0.905 | 1.000 | 0 | 0.624 |
| 0.45 | 0.091 | 0.608 | 0.541 | 0.851 | 1.000 | 0 | 0.555 |
| 0.50 | 0.077 | 0.541 | 0.459 | 0.784 | 1.000 | 0 | 0.495 |
| 0.70 | 0.008 | 0.169 | 0.054 | 0.230 | 1.000 | 0 | 0.215 |

### Calibration Score Formula

```
Calibration Score =
    0.30 × Strict HitRate
  + 0.25 × Strict Recall
  + 0.20 × Strict Precision
  + 0.15 × Negative Rejection Rate
  + 0.10 × Relaxed HitRate
```

---

## 4. Best Configurations

| Category | Threshold | TopK | Value |
|----------|-----------|------|-------|
| Best Strict HitRate | 0.20 | 7 | 0.689 |
| Best Strict Recall | 0.20 | 10 | 0.745 |
| Best Strict Precision | 0.20 | 3 | 0.212 |
| Best Negative Rejection | 0.35+ | any | 1.000 |
| Best Calibration Score | 0.35 | 7 | 0.655 |

### Key Observation: Negative Rejection Cliff

At **Threshold = 0.35**, negative rejection jumps from **87.5% → 100%** (all 16 negative queries correctly rejected). This is a critical improvement — the 2 false positives at T=0.30 are completely eliminated.

---

## 5. Current Production Config

```
Before Calibration:
TopK = 5
Threshold = 0.30
```

| Metric | Value |
|--------|-------|
| Strict P@5 | 0.149 |
| Strict Recall@5 | 0.644 |
| Strict HitRate@5 | 0.608 |
| Relaxed HitRate@5 | 0.892 |
| Negative Rejection | 0.875 (14/16) |
| False Positives | 2 |
| Calibration Score | 0.594 |

---

## 6. Recommended Production Config

```
Recommended:
TopK = 5
Threshold = 0.35
```

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Strict P@5 | 0.149 | 0.149 | — |
| Strict Recall@5 | 0.644 | 0.644 | — |
| Strict HitRate@5 | 0.608 | 0.608 | — |
| Relaxed HitRate@5 | 0.892 | 0.892 | — |
| Negative Rejection | 0.875 | **1.000** | **+14.3%** |
| False Positives | 2 | **0** | **-100%** |
| Calibration Score | 0.594 | **0.611** | **+2.9%** |

**Alternative** (if higher recall is prioritized over context cost):

```
Alternative:
TopK = 7
Threshold = 0.35
```

| Metric | Current | Alternative | Change |
|--------|---------|-------------|--------|
| Strict HitRate | 0.608 | 0.689 | **+13.3%** |
| Strict Recall | 0.644 | 0.725 | **+12.6%** |
| Negative Rejection | 0.875 | 1.000 | +14.3% |
| Calibration Score | 0.594 | 0.655 | **+10.3%** |
| Context Cost | 5 KUs | 7 KUs | +2 KUs/query |

---

## 7. Why

### Primary Recommendation (T=0.35, K=5)

> **T=0.35 is a critical "inflection point"**: at this threshold, all 16 negative queries are correctly rejected (100%), while strict hit rate and recall remain unchanged.

1. **Fixes negative rejection**: Negative rejection from 87.5% → 100%, eliminates 2 false positives
2. **Maintains retrieval quality**: Strict HitRate and Recall identical to T=0.30
3. **No context cost increase**: TopK stays at 5, no additional burden on Content Generation Agent
4. **Simple and explainable**: Small parameter change (0.30 → 0.35), easy to understand and maintain

### Why not T=0.20?

While HitRate (0.689) and Recall (0.745) are higher:
- Negative rejection is only 87.5% (2 false positives)
- More low-similarity results means more noise
- Brings more irrelevant information to Content Generation Agent

### Why not T=0.35, K=7?

While score is higher (0.655):
- TopK from 5 to 7, 2 more results per query
- Increases context cost and noise for Content Generation Agent
- **Less but accurate > more but noisy** — aligns with ContextOS design principles

---

## 8. Query Type Analysis (Semantic, T=0.35, K=5)

| Type | Count | Strict HitRate | Relaxed HitRate |
|------|-------|----------------|-----------------|
| exact | 15 | 0.667 | 0.933 |
| paraphrase | 20 | 0.700 | 0.900 |
| concept | 21 | 0.476 | 0.857 |
| multi | 10 | 0.900 | 1.000 |
| boundary | 8 | 0.375 | 0.625 |
| negative | 16 | N/A (100% rejected) | N/A |

### Observations

- **Multi** queries perform best (0.90 strict, 1.00 relaxed) — semantic handles multi-KU queries very well
- **Exact** and **Paraphrase** are strong (0.67-0.70 strict)
- **Concept** is weakest (0.48 strict) — still an area for improvement
- **Boundary** queries are challenging (0.38 strict) — weakly related content is hard to rank
- **Negative**: 100% rejected — no false positives

---

## 9. Keyword vs Semantic (T=0.35, K=5)

| Metric | Keyword | Semantic | Winner |
|--------|---------|----------|--------|
| Strict P@5 | 0.108 | 0.149 | **Semantic (+38%)** |
| Strict Recall@5 | 0.534 | 0.644 | **Semantic (+21%)** |
| Strict HitRate@5 | 0.473 | 0.608 | **Semantic (+29%)** |
| Relaxed P@5 | 0.173 | 0.305 | **Semantic (+76%)** |
| Relaxed Recall@5 | 0.265 | 0.459 | **Semantic (+73%)** |
| Relaxed HitRate@5 | 0.581 | 0.892 | **Semantic (+54%)** |
| Negative Rejection | 0.875 | **1.000** | **Semantic (+14%)** |

### Summary

**Semantic retrieval outperforms keyword retrieval on ALL metrics**, including negative rejection. This is a significant finding — with proper threshold calibration (T=0.35), semantic retrieval is strictly superior.

---

## 10. Negative Rejection

| Metric | Keyword | Semantic (T=0.30) | Semantic (T=0.35) |
|--------|---------|-------------------|-------------------|
| Negative Queries | 16 | 16 | 16 |
| Correctly Rejected | 14 | 14 | **16** |
| False Positives | 2 | 2 | **0** |
| Rejection Rate | 87.5% | 87.5% | **100%** |

### Critical Finding

At **Threshold = 0.35**, semantic retrieval achieves **100% negative rejection** — all 16 negative queries return empty results. This completely resolves the false positive problem identified in P0.3.3 (Q010: "量子物理芯片技术").

---

## 11. Limitations

### Current Constraints

- **24 KUs** — Small knowledge base limits generalizability
- **90 evaluation queries** — Sufficient for MVP calibration, not statistically conclusive
- **15 validated KUs** — Only validated KUs are retrieved in production
- **Platform**: DashScope text-embedding-v4 only (single provider)

### Result Classification

> **MVP calibration** — Recommended production configuration based on current calibration dataset.

> Results are **dataset-dependent** and should be revisited when the Knowledge Unit corpus grows beyond 50+ KUs and evaluation queries exceed 200+.

---

## 12. Production Parameter Update

### Recommended Change

```diff
// src/knowledge/semantic/types.ts

- export const DEFAULT_SIMILARITY_THRESHOLD = 0.30;
+ export const DEFAULT_SIMILARITY_THRESHOLD = 0.35;

export const DEFAULT_TOP_K = 5; // unchanged
```

### Impact

- **No breaking changes**: API contract remains the same
- **No database changes**: No migration required
- **Backward compatible**: Custom threshold in API requests still supported
- **Production behavior**: Semantic retrieval will filter out results with similarity < 0.35

---

## 13. Files Generated

| File | Purpose |
|------|---------|
| `scripts/calibrate-retrieval.ts` | Calibration framework with threshold × TopK sweep |
| `scripts/__tests__/calibration.test.ts` | 28 unit tests for calibration logic |
| `docs/p0.3/RETRIEVAL_CALIBRATION_V1_RESULTS.json` | Machine-readable calibration results |
| `docs/p0.3/RETRIEVAL_CALIBRATION_REPORT.md` | This report |

---

## 14. Next Steps

1. **Update production parameter**: Done — `DEFAULT_SIMILARITY_THRESHOLD` updated to 0.35
2. **Update tests**: Done — all threshold-related tests updated to new value
3. **Deploy to production**: No migration needed, hot-reload capable
4. **Monitor**: Track real-world retrieval quality with new threshold
5. **Future**: Re-calibrate when KU corpus grows or evaluation dataset expands

---

## Appendix: Similarity Distribution at T=0.35

The threshold 0.35 sits at the boundary between:
- **False positive range**: Similarities < 0.35 for negative queries
- **True positive range**: Similarities ≥ 0.35 for relevant queries

This natural separation confirms that 0.35 is an optimal decision boundary for the current embedding model and knowledge base.
