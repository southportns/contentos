# P0.3.7.3.1 — wasTruncated Semantic Fix Report

## Task

Fix `wasTruncated` semantic issue in Knowledge Context Builder and add boundary tests.

## Date

2026-09-14

## Verification Results

| Check | Status |
|-------|--------|
| TypeCheck (`npx tsc --noEmit`) | PASS |
| Builder tests (36 tests) | PASS |
| All knowledge tests (288 tests) | PASS |
| Lint (`eslint`) | PASS |
| No P0.3.6 modifications | VERIFIED |
| No Retrieval threshold changes | VERIFIED |
| No Retrieval topK changes | VERIFIED |
| No `any` types | VERIFIED |
| No random logic | VERIFIED |
| No N+1 queries | VERIFIED |

## Fix Summary

### Problem

`wasTruncated` used `response.results.length > selectedCount` which incorrectly conflated candidate policy filtering with maxItems truncation.

### Solution

Changed to `filteredItems.length > selectedCount` so only maxItems truncation sets the flag.

### Code Change

**File:** `src/knowledge/context/knowledge-context-builder.ts` (line 304)

```diff
- const wasTruncated = response.results.length > selectedCount;
+ // P0.3.7.3.1 Fix: wasTruncated must compare against filtered items (post-candidate-policy),
+ // not raw retrieval results. Candidate filtering is NOT truncation.
+ const wasTruncated = filteredItems.length > selectedCount;
```

## Boundary Tests Added

| Case | Scenario | Expected | Result |
|------|----------|----------|--------|
| A | 5 validated, maxItems=3 → 3 selected | `wasTruncated=true` | PASS |
| B | 3V+2C, maxItems=5 → 5 selected | `wasTruncated=FALSE` | PASS |
| B-variant | 3C+4V, maxItems=4 → 4 selected | `wasTruncated=true` (maxItems) | PASS |
| C | 3 validated, maxItems=5 → 3 selected | `wasTruncated=FALSE` | PASS |
| Regression | 10 validated, default maxItems=5 | `wasTruncated=true` | PASS |

## GitHub Push Log

| Commit | Message | Status |
|--------|---------|--------|
| `3108373` | P0.3.7.3.1: Fix wasTruncated semantics - compare against filteredItems.length instead of response.results.length | PUSHED |
| `9d419bf` | P0.3.7.3.1: Add 5 wasTruncated boundary tests (Case A, B, B-variant, C, Regression) | PUSHED |
| `bc7019c` | P0.3.7.3.1: Update report with fix documentation and boundary test results | PUSHED |

### Files Pushed

1. `src/knowledge/context/knowledge-context-builder.ts` — wasTruncated fix (1 line + comment)
2. `src/knowledge/context/__tests__/knowledge-context-builder.test.ts` — 5 new boundary tests (~100 lines)
3. `docs/p0.3/P0.3.7.3_KNOWLEDGE_CONTEXT_BUILDER_REPORT.md` — Section 14: P0.3.7.3.1 Fix

### Repository

- Owner: southportns
- Repo: contentos
- Branch: main
- Remote: https://github.com/southportns/contentos

## Architecture Compliance

- Retrieval unchanged ✓
- P0.3.7.2 contract unchanged ✓
- Semantic algorithm unchanged ✓
- Embedding unchanged ✓
- Threshold unchanged (P0.3.6 calibration preserved) ✓
- Dataset V2 unchanged ✓
- Serializer not implemented ✓
- Prompt Assembly not modified ✓
- No new dependencies ✓
- No database query ✓

## Conclusion

P0.3.7.3.1 fix successfully applied and verified. All 288 knowledge tests pass. Code pushed to GitHub main branch.
