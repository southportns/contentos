# P0.2.3 — Knowledge Store Report

> Knowledge Store & Knowledge Index  
> Version: 1.0  
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
Keyword Extraction (Chinese/English tokenization + synonym expansion)
   ↓
Metadata Filter (status, level, category, confidence)
   ↓
Human Expression Safety Filter
   ↓
Keyword Match (search_text, name, description, category synonyms)
   ↓
Ranking (weighted scoring model)
   ↓
Top K Results
```

### Ranking Weights

```
score =
  keyword_match     * 0.35    (search_text relevance)
+ name_match         * 0.15    (name contains keyword)
+ description_match  * 0.15    (description contains keyword)
+ category_match     * 0.10    (category synonyms match)
+ level_match        * 0.10    (structural alignment)
+ confidence_score   * 0.10    (KU confidence level)
+ evidence_strength  * 0.05    (trusted evidence count)
```

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
```

### Metrics

```
Precision@5: <measured during test run>
Recall@5:    <measured during test run>
HitRate@5:   <measured during test run>
```

---

## 8. File Structure

```
src/knowledge/
├── types.ts                  # Canonical schema & type definitions
├── knowledge-data.ts         # Import validated JSON dataset
├── knowledge-index.ts        # Index building & keyword extraction
├── knowledge-filters.ts      # Metadata & safety filters
├── knowledge-ranker.ts       # Deterministic ranking model
├── knowledge-retriever.ts    # Keyword-based retrieval pipeline
├── knowledge-store.ts        # Central KnowledgeStore class
├── index.ts                  # Public API re-exports
└── __tests__/
    └── knowledge-store.test.ts  # 25 unit tests

src/app/api/knowledge/search/
└── route.ts                  # GET /api/knowledge/search

scripts/
└── test-knowledge-retrieval.ts  # CLI test script

docs/p0.2.3/
├── KNOWLEDGE_STORE_SCHEMA.md
├── RETRIEVAL_EVALUATION_DATASET.json
└── KNOWLEDGE_STORE_REPORT.md
```

---

## 9. Known Limitations

1. **No Semantic Embedding**: Current retrieval is keyword-based
2. **Limited synonym support**: Category synonyms are predefined, not learned from data
3. **Small dataset**: 24 KU is insufficient for comprehensive coverage
4. **No cross-language matching**: Chinese topics won't match English KU fields
5. **No LLM-based understanding**: Cannot handle implicit semantic relevance

---

## 10. Future Extension Interface

```typescript
interface KnowledgeRetriever {
  retrieve(query: KnowledgeQuery): KnowledgeRetrievalResponse;
}

// Current implementation: KeywordRetriever
// Future: EmbeddingRetriever, HybridRetriever
// Final: KnowledgeRetriever with pluggable implementations
```

---

## 11. Code Quality

- TypeScript strict mode
- No `any` types (unless justified by external data)
- Pure functions where possible
- Deterministic ranking (same input = same output)
- No hardcoded query → KU mapping
- No hidden LLM calls
