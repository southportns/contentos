# P0.2.3 — Knowledge Store Schema

> Canonical Knowledge Schema  
> Version: 1.0  
> Date: 2026-09-02

---

# 1. Objective

Define the canonical schema for Knowledge Units stored in the ContextOS Knowledge Store.

Source: `docs/p0.2.2.1/VALIDATED_KNOWLEDGE_UNITS.json`

---

# 2. Canonical Knowledge Unit

```json
{
  "knowledge_id": "KU_001",
  "name": "Question-based Conversational Hook",
  "category": "hook",
  "knowledge_level": "structural_pattern",
  "description": "...",
  "abstract_pattern": "...",
  "function": "...",
  "confidence": "medium",
  "status": "validated",
  "reclassified": false,
  "evidence": {
    "items": [],
    "unique_content_count": 4
  },
  "human_expression_verdict": "confirmed",
  "principle": "...",
  "surface_forms": []
}
```

---

# 3. Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `knowledge_id` | string | Yes | Unique ID (format: KU_NNN) |
| `name` | string | Yes | Knowledge Unit name |
| `category` | enum | Yes | See Category Enum |
| `knowledge_level` | enum | Yes | One KU = one level |
| `description` | string | Yes | Chinese description |
| `abstract_pattern` | string | No | Pattern formula |
| `function` | string | No | Functional description |
| `confidence` | enum | Yes | high / medium / low |
| `status` | enum | Yes | validated / candidate |
| `reclassified` | boolean | Yes | Status changed since P0.2.2 |
| `evidence` | object | Yes | See Evidence Schema |
| `human_expression_verdict` | enum | No | confirmed / unconfirmed / suspect |
| `principle` | string | No | Usage principle (human_expression only) |
| `surface_forms` | string[] | No | Example surface forms |
| `note` | string | No | P0.2.2.1 audit notes |

---

# 4. Category Enum

| Category | Chinese | Count |
|----------|---------|-------|
| hook | 开头技巧 | 5 |
| structure | 结构模式 | 3 |
| emotion | 情绪模式 | 2 |
| perspective | 视角模式 | 2 |
| language | 语言技巧 | 2 |
| cognition | 认知模式 | 3 |
| human_expression | 真人表达 | 5 |
| ending | 结尾技巧 | 2 |

---

# 5. Knowledge Level Enum

| Level | Chinese | Count |
|-------|---------|-------|
| strategic_pattern | 战略模式 | 4 |
| structural_pattern | 结构模式 | 10 |
| expression_principle | 表达原则 | 5 |
| surface_technique | 表面技巧 | 5 |

---

# 6. Evidence Schema

```json
{
  "items": [
    {
      "evidence_id": "EV_001_01",
      "content_id": "cmtifxn9r0001gsrtxnkvbmzf",
      "quote": "...",
      "location": "opening",
      "validation": "valid",
      "evidence_quality": "high",
      "noise_risk": "low",
      "evidence_trust": "trusted",
      "note": "..."
    }
  ],
  "unique_content_count": 4
}
```

## Evidence Trust Rules

| Trust | Count | Retrieval Eligible | Definition |
|-------|-------|-------------------|------------|
| trusted | 55 | **true** | valid AND low noise_risk |
| caution | 18 | **false** | weak OR medium noise_risk |
| excluded | 2 | **false** | invalid OR high noise_risk |

---

# 7. Human Expression Verdict

| Verdict | Count | Retrieval Rule |
|---------|-------|---------------|
| confirmed | 3 | Default retrieval allowed |
| unconfirmed | 1 | Only with include_candidates=true |
| suspect | 1 | NEVER in default retrieval |

---

# 8. Dataset Statistics

```
Total KU = 24
Validated = 15
Candidate = 9

Evidence = 75
Trusted = 55
Caution = 18
Excluded = 2

Unique Content IDs = 23
```

---

# 9. Source File

```
docs/p0.2.2.1/VALIDATED_KNOWLEDGE_UNITS.json
```

Import in code:

```typescript
import { KNOWLEDGE_UNITS } from '@/knowledge';
```

---

# 10. Usage

```typescript
import { knowledgeStore } from '@/knowledge';

// Search
const response = knowledgeStore.search({
  topic: '女人一定要学会爱自己',
  limit: 5,
});

// Get by ID
const ku = knowledgeStore.getById('KU_010');

// Get all validated
const validated = knowledgeStore.getValidated();

// Include candidates
const results = knowledgeStore.search({
  topic: '爱自己',
  include_candidates: true,
});
```
