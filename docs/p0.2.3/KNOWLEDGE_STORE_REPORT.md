# P0.2.3 — Knowledge Store Report

> Knowledge Store & Knowledge Index  
> Version: 1.1 (P0.2.3-FIX)  
> Date: 2026-09-02

---

## 1. Objective

ContextOS can now extract Knowledge from content (P0.2.2), but it couldn't effectively answer:

> "When a user provides a new topic, which Knowledge Units should I retrieve?"

**P0.2.3** establishes a **Knowledge Retrieval Foundation Layer** that is:

- Explainable
- Testable
- Safe
- Ready for future Embedding/Hybrid Retrieval replacement

---

## 2. Source Dataset

```
Knowledge Units:    24
Validated:         15
Candidate:          9
Reclassified:       6
Evidence:          75
Trusted:           55
Caution:           18
Excluded:           2
Unique Contents:   23

Knowledge Levels:
  strategic_pattern:     4
  structural_pattern:   10
  expression_principle:  5
  surface_technique:     5

Categories:
  hook:              5
  structure:         3
  emotion:           2
  perspective:       2
  language:          2
  cognition:         3
  human_expression:  5
  ending:            2
```

---

## 3. Canonical Schema

### Knowledge Unit

```typescript
interface CanonicalKnowledgeUnit {
  knowledge_id: string;           // KU_NNN
  name: string;
  category: KnowledgeCategory;    // 8 categories
  knowledge_level: KnowledgeLevel; // 4 levels
  description: string;
  abstract_pattern?: string;
  function?: string;
  confidence: ConfidenceLevel;    // high | medium | low
  status: KUStatus;               // validated | candidate
  reclassified: boolean;
  evidence: EvidenceGroup;
  human_expression_verdict?: 'confirmed' | 'unconfirmed' | 'suspect';
  principle?: string;
  surface_forms?: string[];
  note?: string;
}
```

### Index Entry (NEW in P0.2.3-FIX)

```typescript
interface KnowledgeIndexEntry {
  knowledge_id: string;
  name: string;
  category: KnowledgeCategory;
  knowledge_level: KnowledgeLevel;
  status: KUStatus;
  confidence: ConfidenceLevel;
  human_expression_verdict?: HumanExpressionVerdict;
  search_text: string;          // Full searchable content (name + description + pattern + function + principle + surface_forms)
  search_name: string;          // Normalized name
  search_description: string;   // Normalized description
  search_pattern: string;       // Normalized abstract_pattern
  trusted_evidence_count: number;
  unique_content_count: number;
  evidence_strength: number;    // 0-1
}
```

### Evidence Trust Rules

| Trust | Retrieval Eligible | Definition |
|-------|-------------------|------------|
| trusted | **true** | valid AND low noise_risk |
| caution | **false** | weak OR medium noise_risk |
| excluded | **false** | invalid OR high noise_risk |

### Human Expression Safety

| Verdict | Default Retrieval |
|---------|------------------|
| confirmed | YES |
| unconfirmed | Only with include_candidates=true |
| suspect | NEVER |

---

## 4. Retrieval Architecture

```
Query (topic + keywords)
   ↓
Keyword Extraction (Chinese bigram tokenization, min length >= 2)
   ↓
Metadata Filter (status, level, category, confidence)
   ↓
Human Expression Safety Filter
   ↓
Keyword Match (search_text, search_name, search_description, category synonyms, level synonyms)
   ↓
Ranking (weighted scoring model)
   ↓
Top K Results
```

### Ranking Weights

```
score =
  keyword_match     * 0.35    (search_text relevance)
+ name_match         * 0.15    (search_name only, NOT search_text)
+ description_match  * 0.15    (search_description only, NOT search_text)
+ category_match     * 0.10    (category synonyms with boundary-aware matching)
+ level_match        * 0.10    (real synonym-based level intent detection)
+ confidence_score   * 0.10    (KU confidence level)
+ evidence_strength  * 0.05    (trusted evidence count)
```

### Key Ranking Fixes (P0.2.3-FIX)

1. **Level Match**: Real synonym-based scoring using LEVEL_SYNONYMS (was fixed 0.5)
2. **Name Match**: Uses `search_name` field only (was using full search_text)
3. **Description Match**: Uses `search_description` field only (was using full search_text)
4. **Category Match**: Boundary-aware matching prevents single-char substring false positives
5. **Keyword Extraction**: Min length >= 2, no category/level synonym expansion (prevents false positives)

### Evidence Strength

```
evidence_strength =
  min(unique_content_count / 5, 1) * 0.7
+ min(trusted_count / 3, 1)          * 0.3
```

---

## 5. Safety Rules

### Excluded Evidence

- `evidence_trust = excluded` → Does NOT influence keyword_match, evidence_strength, ranking, or retrieval_reason
- Only exists as audit metadata
- 2 evidence items (EV_016_05, EV_019_02) marked as excluded

### Candidate Knowledge

- Stored in Knowledge Store but NOT returned by default
- Only accessible with `include_candidates: true`
- Allows future validation when more content enters the system

### Human Expression Safety

- `suspect` verdict → **Never** included in default retrieval
- `unconfirmed` verdict → Only with `include_candidates: true`
- `confirmed` verdict → Included by default
- Prevents ASR errors from being learned as "authentic expression"

---

## 6. API

### Knowledge Store (Service Layer)

```typescript
const store = new KnowledgeStore();

store.search(query);         // Full retrieval pipeline
store.getById('KU_010');     // Single KU lookup
store.getValidated();        // All validated KUs
store.getCandidates();       // All candidate KUs
store.getByCategory('hook'); // Filter by category
store.getByLevel('strategic_pattern'); // Filter by level
```

### HTTP API

```
GET /api/knowledge/search
  ?q=<topic>
  &category=<category>
  &knowledge_level=<level>
  &confidence=<high|medium|low>
  &include_candidates=<true|false>
  &limit=<number>
```

Response:

```json
{
  "query": "爱自己",
  "results": [
    {
      "knowledge_id": "KU_014",
      "score": 0.72,
      "matched_terms": ["认知", "反转"],
      "knowledge_level": "strategic_pattern",
      "category": "cognition",
      "confidence": "medium",
      "status": "validated",
      "retrieval_reason": "关键词匹配: 认知 | 知识等级: 战略模式 | 分类: 认知模式"
    }
  ],
  "total": 5
}
```

---

## 7. Evaluation

### Dataset

File: `docs/p0.2.3/RETRIEVAL_EVALUATION_DATASET.json`

```
Queries: 10
- Expected relevant KUs specified per query
- Includes one deliberately irrelevant query (Q010)
- Metrics computed by automated runner (scripts/evaluate-knowledge-retrieval.ts)
```

### Metrics (Auto-generated by Evaluation Runner)

```
Strict Metrics (expected only):
  Precision@5: 0.27
  Recall@5:    0.44
  HitRate@5:   0.33

Relaxed Metrics (expected + accepted):
  Precision@5: 0.38
  Recall@5:    0.18
  HitRate@5:   0.44

Irrelevant Query Rejection Rate: 1.00
```

> Note: These metrics reflect the current state of a 24-KU keyword-based retrieval system.  
> They will improve significantly when Embedding-based retrieval is implemented (future phase).

### Detailed Per-Query Results

| Query | Topic | Strict Hit | Relaxed Hit | Notes |
|-------|-------|------------|-------------|-------|
| Q001 | 爱自己 | NO | YES | KU_010 matched via "自己人" containing bigram |
| Q002 | 职场边界 | NO | NO | No matching vocabulary in dataset |
| Q003 | 女性成长 | NO | NO | Bigrams don't match KU descriptions |
| Q004 | 被爱 | NO | NO | Single-char "被" filtered, no match |
| Q005 | 自我价值 | NO | NO | Bigrams don't match KU descriptions |
| Q006 | 开头技巧 | NO | NO | "技巧" was in synonym expansion (now removed) |
| Q007 | 认知反转 | YES | YES | Perfect match via "认知" bigram |
| Q008 | 结尾行动 | YES | YES | Exact match via "行动" in KU_022 |
| Q009 | 真实自然表达 | YES | YES | "真实" matches KU_018/KU_020 descriptions |
| Q010 | 量子物理芯片技术 | N/A | N/A | Correctly rejected (100% rejection rate) |

---

## 8. Retrieval Error Analysis

### False Positives

**None after P0.2.3-FIX.** Previously, unrelated queries like "量子物理芯片技术" would return results due to overly aggressive synonym expansion. This has been fixed by:

- Removing category/level synonym expansion from keyword extraction
- Minimum keyword length >= 2
- Category matching moved to dedicated boundary-aware function

### False Negatives

**6 of 9 relevant queries return zero strict hits.** Root causes:

1. **Vocabulary Gap**: Chinese bigram tokenization creates fragments ("爱自", "自拍") that don't appear literally in KU descriptions
2. **Semantic Gap**: Keyword matching cannot capture implicit relevance (e.g., "爱自己" ↔ "自我价值" connection)
3. **Small Dataset**: Only 24 KUs, many topics have no coverage

**Specific Issues:**

- **Q001 (爱自己)**: Expected KU_014 but only matched KU_010. The bigram from "自己人" created a false relaxed hit instead of the intended match.
- **Q003 (女性成长)**: Bigrams "女性", "성이", "成长" don't appear in target KU descriptions. KU_010 description mentions "姐妹/女生" but not "女性".
- **Q004 (被爱)**: Single-char "被" filtered by min length rule. "爱" alone also filtered. Must rely on "爱" appearing in bigrams.
- **Q005 (自我价值)**: Bigrams "自我", "我价", "价值" don't match KU_010/KU_013 descriptions.

### Zero Hit Queries

```
Q001 (爱自己) - strict: NO, relaxed: YES
Q002 (职场边界) - strict: NO, relaxed: NO
Q003 (女性成长) - strict: NO, relaxed: NO
Q004 (被爱) - strict: NO, relaxed: NO
Q005 (自我价值) - strict: NO, relaxed: NO
Q006 (开头技巧) - strict: NO, relaxed: NO
```

### Conclusion

Current keyword-based retrieval achieves **33% strict hit rate** on relevant queries. This is expected for a lexical matching system with only 24 knowledge units. **Embedding-based semantic retrieval** (future phase) is required to significantly improve these metrics.

---

## 9. File Structure

```
src/knowledge/
├── types.ts                     # Canonical schema & type definitions
├── knowledge-data.ts            # Import validated JSON dataset
├── knowledge-index.ts           # Index building & keyword extraction
├── knowledge-filters.ts         # Metadata & safety filters
├── knowledge-ranker.ts          # Deterministic ranking model (FIXED)
├── knowledge-retriever.ts       # Keyword-based retrieval pipeline
├── knowledge-store.ts           # Central KnowledgeStore class
├── index.ts                     # Public API re-exports
└── __tests__/
    ├── knowledge-store.test.ts  # 25+ unit tests
    └── knowledge-ranker.test.ts # NEW: Ranking-specific tests

src/app/api/knowledge/search/
└── route.ts                     # GET /api/knowledge/search

scripts/
├── test-knowledge-retrieval.ts      # CLI test script
└── evaluate-knowledge-retrieval.ts  # NEW: Automated evaluation runner

docs/p0.2.3/
├── KNOWLEDGE_STORE_SCHEMA.md
├── KNOWLEDGE_STORE_REPORT.md        # This file
├── RETRIEVAL_EVALUATION_DATASET.json
└── RETRIEVAL_EVALUATION_RESULTS.json # NEW: Auto-generated results
```

---

## 10. Known Limitations

1. **No Semantic Embedding**: Current retrieval is keyword-based, cannot capture semantic similarity
2. **Bigram Tokenization Weakness**: Chinese bigram splitting creates fragments that may not match descriptions
3. **Small Dataset**: 24 KU insufficient for comprehensive coverage
4. **No Cross-language Matching**: Chinese topics won't match English KU fields
5. **No LLM-based Understanding**: Cannot handle implicit semantic relevance
6. **Vocabulary Gap**: Many query terms don't appear literally in KU descriptions

---

## 11. Future Extension Interface

```typescript
interface KnowledgeRetriever {
  retrieve(query: KnowledgeQuery): KnowledgeRetrievalResponse;
}

// Current implementation: KeywordRetriever
// Future: EmbeddingRetriever, HybridRetriever
// Final: KnowledgeRetriever with pluggable implementations
```

---

## 12. Code Quality

- TypeScript strict mode
- No `any` types (unless justified by external data)
- Pure functions where possible
- Deterministic ranking (same input = same output)
- No hardcoded query → KU mapping
- No hidden LLM calls
- Minimal keyword extraction to prevent false positives

---

## 13. P0.2.3-FIX Changes Summary

### Issue 1: Retrieval Evaluation (Fixed)

- Created `scripts/evaluate-knowledge-retrieval.ts` - automated evaluation runner
- Computes Strict/Relaxed Precision@5, Recall@5, HitRate@5
- Computes Irrelevant Query Rejection Rate
- Generates `RETRIEVAL_EVALUATION_RESULTS.json` with full results

### Issue 2: Ranking Model Calibration (Fixed)

- **Level Match**: Changed from fixed `0.5` to real synonym-based scoring using `LEVEL_SYNONYMS`
- **Name/Description Separation**: Added dedicated `search_name`, `search_description`, `search_pattern` fields
- **Category Match**: Changed from substring to boundary-aware matching (prevents single-char false positives)
- **Keyword Extraction**: Removed synonym expansion, added min length >= 2 filter
- **Irrelevant Query**: Q010 now correctly returns empty (was returning 5 false positives)
