# Verification Report — report-baseline-dedup-fix

## Verdict

**FAIL**

> ❌ Verification failed. New issues detected or parse failure.



## Verification Matrix

| Check | Status | Current | Baseline Matched | New | Errors+Warnings | Resolved | Duplicates | Blocks |
|-------|--------|---------|------------------|-----|-----------------|----------|------------|--------|
| Tests | ❌ FAIL | 250 | 0 | 0 | 0+0 | 0 | undefined | YES |
| TypeCheck | ✅ PASS | 0 | 0 | 0 | 0+0 | 0 | undefined | YES |
| Lint | ⚠️ PASS_WITH_BASELINE | 43 | 10 | 30 | 0+30 | 0 | 3 | NO |
| Build | ❌ FAIL | 1 | 0 | 1 | 1+0 | 0 | undefined | YES |

## Test Summary Parse

- **Test Files**: 11 passed / 12 total (1 failed)
- **Tests**: 250 passed / 250 total 
- **Duration**: 2.34s

## New Issues

- **scripts/build-validated-json.ts:11** (@typescript-eslint/no-unused-vars): 'ORIGINAL_PATH' is assigned a value but never used.
- **scripts/diagnose-douyin-search.ts:125** (@typescript-eslint/no-unused-vars): 'hotStart' is assigned a value but never used.
- **scripts/validate-knowledge-cleanup.ts:14** (@typescript-eslint/no-unused-vars): 'pathToFileURL' is defined but never used.
- **skills/transcript-correction/index.ts:120** (@typescript-eslint/no-unused-vars): 'originalText' is defined but never used.
- **skills/transcript-correction/index.ts:141** (@typescript-eslint/no-unused-vars): 'lastEnd' is assigned a value but never used.
- **skills/transcript-correction/index.ts:305** (@typescript-eslint/no-unused-vars): '_' is assigned a value but never used.
- **src/app/(app)/explorer/research/page.tsx:14** (@typescript-eslint/no-unused-vars): 'useWorkflow' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:3** (@typescript-eslint/no-unused-vars): 'useEffect' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:5** (@typescript-eslint/no-unused-vars): 'ExternalLink' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:6** (@typescript-eslint/no-unused-vars): 'Plus' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:6** (@typescript-eslint/no-unused-vars): 'Sparkles' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:9** (@typescript-eslint/no-unused-vars): 'Input' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:14** (@typescript-eslint/no-unused-vars): 'Select' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:15** (@typescript-eslint/no-unused-vars): 'SelectContent' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:16** (@typescript-eslint/no-unused-vars): 'SelectItem' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:17** (@typescript-eslint/no-unused-vars): 'SelectTrigger' is defined but never used.
- **src/app/(app)/explorer/search/page.tsx:18** (@typescript-eslint/no-unused-vars): 'SelectValue' is defined but never used.
- **src/app/(app)/guide/deployment/page.tsx:3** (@typescript-eslint/no-unused-vars): 'Terminal' is defined but never used.
- **src/app/(app)/projects/page.tsx:2** (@typescript-eslint/no-unused-vars): 'Trash2' is defined but never used.
- **src/app/(app)/settings/page.tsx:103** (@typescript-eslint/no-unused-vars): 'asrLoading' is assigned a value but never used.
- **src/app/(app)/settings/page.tsx:108** (@typescript-eslint/no-unused-vars): 'refreshASR' is assigned a value but never used.
- **src/app/(app)/workspace/page.tsx:27** (@typescript-eslint/no-unused-vars): 'strategy' is assigned a value but never used.
- **src/components/backgrounds/WebThreads.tsx:314** (@typescript-eslint/no-unused-expressions): Expected an assignment or function call and instead saw an expression.

## Baseline Issues (Matched)

- **src/app/(app)/guide/deployment/page.tsx:144** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:151** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:160** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:170** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:180** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:190** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:200** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:210** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:220** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:230** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`

## Resolved Issues

None.

## Duplicate Current Issues (INFO — not new, not blocking)

- **src/app/(app)/guide/deployment/page.tsx:144** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:151** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`
- **src/app/(app)/guide/deployment/page.tsx:160** (react/no-unescaped-entities): `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`

## Duplicate Baseline Entries (INFO — baseline has duplicate identities)

None.

## Baseline Stats

- **Baseline Raw Count**: 10
- **Baseline Unique Count**: 10
- **Baseline Duplicate Entries**: 0
- **Baseline Matched (unique)**: 10
- **Baseline Resolved**: 0

## Changed Files

### Added
None.

### Modified
- scripts/generate-report.ts
- scripts/__tests__/generate-report.test.ts

### Deleted
None.

## Metadata

- **Task**: report-baseline-dedup-fix
- **Generated At**: 2026-09-09T...
- **Branch**: main
- **Commit**: ...
- **Parent Commit**: ...
- **Baseline Source Commit**: ...
- **Baseline Path Format**: repo-relative-posix

## Detailed Outputs

### Test

<details>

```
... (test output truncated)
```

</details>

### TypeCheck

<details>

```
No errors.
```

</details>

### Lint

<details>

```
... (lint output truncated)
```

</details>

### Build

<details>

```
... (build output truncated)
```

</details>

---

*This report was auto-generated by scripts/generate-report.ts*
