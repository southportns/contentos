# P0.3.1 — Semantic Retrieval Architecture

> Semantic Retrieval Foundation  
> Version: 1.0  
> Date: 2026-09-02

---

## 1. Objective

ContextOS P0.2.3 established a Keyword-Based Knowledge Retrieval system with:

- Knowledge Units: 24
- Retrieval Method: Keyword / Lexical Matching
- Strict HitRate@5: 0.33
- Strict Precision@5: 0.09

The primary limitation identified is the **vocabulary gap** between user query terms and Knowledge Unit descriptions. Keyword matching cannot capture implicit semantic relevance (e.g., "爱自己" ↔ "自我价值").

**P0.3.1** establishes a **Semantic Retrieval Foundation** — a pluggable architecture that enables embedding-based retrieval without hardcoding any specific vendor.

---

## 2. Architecture Overview

```
                    KnowledgeStore
                         │
                         ↓
                  Retrieval Layer
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       Keyword        Semantic        Hybrid
       Retriever      Retriever       Retriever (future)
          │              │              │
          ↓              ↓              ↓
      Keyword        Embedding       Fusion
       Index           Index         Strategy (future)
```

### Provider Pluggability

```
EmbeddingProvider (Interface)
        │
   ┌────┴─────┐
   ↓          ↓
 Mock        Real      ←── Future Cloud/Local
Provider    Provider       Providers (P0.3.2+)
```

---

## 3. Module Structure

```
src/knowledge/
├── index.ts                          # Public API (updated)
├── types.ts                          # Canonical types (unchanged)
├── knowledge-store.ts                # Central store (unchanged)
├── knowledge-index.ts                # Keyword index (unchanged)
├── knowledge-ranker.ts               # Keyword ranker (unchanged)
├── knowledge-retriever.ts            # Keyword retriever (unchanged)
├── knowledge-filters.ts              # Safety filters (unchanged)
└── semantic/                         # --- P0.3.1 NEW ---
    ├── index.ts                      # Semantic public API
    ├── types.ts                      # Semantic interfaces
    ├── embedding-provider.ts         # Provider interface + Mock
    ├── similarity.ts                 # Cosine similarity
    ├── semantic-index.ts             # Index building
    ├── semantic-retriever.ts         # Retrieval pipeline
    ├── semantic-search.ts            # High-level orchestration
    └── __tests__/
        ├── similarity.test.ts        # 15+ similarity tests
        ├── semantic-index.test.ts    # 12+ index tests
        └── semantic-retriever.test.ts # 20+ retriever tests
```

---

## 4. Core Interfaces

### 4.1 EmbeddingProvider

```typescript
interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

**Principles:**
- Single and batch embedding support
- Fixed output dimension per provider
- No vendor-specific code in retriever
- Mock provider in P0.3.1
- Real providers in P0.3.2+

### 4.2 SemanticIndexEntry

```typescript
interface SemanticIndexEntry {
  knowledge_id: string;
  vector: number[];
  text: string;           // Embedding source text
  name: string;
  category: KnowledgeCategory;
  knowledge_level: KnowledgeLevel;
  confidence: ConfidenceLevel;
  status: KUStatus;
  human_expression_verdict?: HumanExpressionVerdict;
}
```

### 4.3 SemanticIndex

```typescript
interface SemanticIndex {
  entries: SemanticIndexEntry[];
  dimensions: number;
  provider_id: string;
}
```

**Properties:**
- Serializable (can be saved/loaded)
- Rebuildable from source KUs
- Provider-agnostic (tracked via `provider_id`)

### 4.4 KnowledgeRetriever (Unified Interface)

```typescript
interface KnowledgeRetriever {
  retrieve(query: Query): Promise<Response>;
}
```

All retrievers (keyword, semantic, future hybrid) implement this interface.

---

## 5. Safety Architecture

### Filter Reuse Principle

```
                Knowledge Filters (P0.2.3)
                       ↓
          ┌────────────┴────────────┐
          ↓                         ↓
 Keyword Retriever          Semantic Retriever
          ↓                         ↓
       Results                   Results
```

Semantic Retrieval **does NOT create its own filter logic**. It reuses:

- `filterByStatus()` — validated/candidate separation
- `filterHumanExpression()` — suspect exclusion, unconfirmed handling

### Safety Rules

| Condition | Default Behavior | include_candidates=true |
|-----------|------------------|------------------------|
| `status = validated` | ✅ Included | ✅ Included |
| `status = candidate` | ❌ Excluded | ✅ Included |
| `suspect` human_expression | ❌ NEVER | ❌ NEVER |
| `unconfirmed` human_expression | ❌ Excluded | ✅ Included |
| `confirmed` human_expression | ✅ Included | ✅ Included |

---

## 6. Pipeline Flow

### Index Building

```
Knowledge Units
      ↓
Safety Filters (P0.2.3)
      ↓
Text Preparation (name + description + pattern + function + principle + surface_forms)
      ↓
Embedding Provider (embedBatch)
      ↓
SemanticIndex
```

### Query Execution

```
Query Text
      ↓
Embedding Provider (embed query)
      ↓
Cosine Similarity (against all index entries)
      ↓
Runtime Filters (category, level, confidence, min_similarity)
      ↓
Ranking (similarity descending, knowledge_id tiebreaker)
      ↓
Top K Results
```

---

## 7. MockEmbeddingProvider

The `MockEmbeddingProvider` implementation:

- **Deterministic**: Same input → Same vector (guaranteed)
- **Fixed dimensions**: Configurable (default 64)
- **No dependencies**: No network, no API key
- **NOT semantic**: Hash-based, does not understand Chinese
- **Purpose**: Architecture validation and unit testing only

### Vector Generation

```typescript
// Simplified illustration
generateVector(text: string): number[] {
  // Hash-based deterministic value per dimension
  for (let i = 0; i < dimensions; i++) {
    hash = combine(text.charCodeAt(j), i, j);
    vector[i] = Math.sin(hash);
  }
  return normalize(vector); // L2 unit vector
}
```

---

## 8. Cosine Similarity

```typescript
cosineSimilarity(a: number[], b: number[]): number
```

**Properties:**
- Range: [-1, 1]
- Same vector → 1.0
- Opposite → -1.0
- Orthogonal → 0.0

**Safety:**
- Empty vectors → 0 (not NaN)
- Zero vectors → 0 (not NaN/Infinity)
- Different dimensions → throws Error
- Output clamped to [-1, 1]

---

## 9. Current System Status

### What P0.3.1 Adds

- [x] `EmbeddingProvider` interface
- [x] `SemanticIndex` and `SemanticIndexEntry`
- [x] `cosineSimilarity` with edge case handling
- [x] `SemanticRetriever` with full pipeline
- [x] `MockEmbeddingProvider` for testing
- [x] Integration with P0.2.3 safety filters
- [x] `KnowledgeRetriever` unified interface

### What P0.3.1 Does NOT Do

- [ ] Real Embedding Model integration
- [ ] Vector Database persistence
- [ ] Hybrid Retrieval (keyword + semantic fusion)
- [ ] Semantic Evaluation metrics
- [ ] Frontend behavior changes
- [ ] API route changes

---

## 10. Future Extension Path (P0.3.2+)

### Embedding Provider Implementations

- OpenAI `text-embedding-3-small`
- BGE-large-zh
- Qwen embedding
- Voyage AI
- Cohere embed-v4
- Local models (Ollama, sentence-transformers)

### Retrieval Enhancements

- Hybrid retrieval (keyword + semantic fusion)
- Vector database persistence (when data grows)
- Caching strategies
- Multi-vector per KU (name vector, description vector)

### Evaluation

- Semantic HitRate@5, Precision@5, Recall@5
- Comparison against P0.2.3 baseline
- Ground truth semantic relevance dataset

---

## 11. Code Quality

- TypeScript strict mode
- No `any` types
- Pure functions where possible
- Deterministic behavior (same input → same output)
- No hardcoded query → KU mapping
- No fake evaluation metrics