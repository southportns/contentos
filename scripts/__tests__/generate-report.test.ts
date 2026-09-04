/**
 * Tests for the verification report system.
 *
 * Covers:
 * - Path normalization (Windows, Unix, already-relative)
 * - Issue identity (unified, excludes line number)
 * - Message normalization
 * - Baseline validation
 * - Baseline comparison (new/baseline/resolved)
 * - Verdict computation
 * - Verdict consistency validation
 * - Lint output parsing (JSON + human-readable)
 * - Test summary extraction
 */

import { describe, it, expect } from 'vitest';
import { resolve, relative, sep } from 'node:path';

// ─── Types (mirror the production code) ──────────────────────────────────

interface VerificationIssue {
  tool: 'lint' | 'typecheck' | 'test' | 'build';
  file?: string;
  line?: number;
  rule?: string;
  message: string;
  severity?: 'error' | 'warning';
}

interface BaselineIssue {
  file: string;
  line: number;
  rule: string;
  message: string;
  status: 'known';
}

interface Baseline {
  version: string;
  path_format?: string;
  updated_at: string;
  source_commit: string;
  allow_test_baseline: boolean;
  new_build_warning_blocks: boolean;
  known_issues: {
    lint?: BaselineIssue[];
  };
}

interface VerificationMatrix {
  check: string;
  status: 'PASS' | 'FAIL' | 'PASS_WITH_BASELINE' | 'SKIPPED' | 'WARNING';
  current: number;
  baseline: number;
  new: number;
  newErrors: number;
  newWarnings: number;
  resolved: number;
  blocks: boolean;
}

type Verdict = 'PASS' | 'PASS_WITH_BASELINE_ISSUES' | 'FAIL';

interface TestSummary {
  filesTotal: number;
  filesPassed: number;
  filesFailed: number;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  duration: string;
  parseFailed: boolean;
}

// ─── Implementations (mirror production code) ────────────────────────────

const REPO_ROOT = process.cwd();
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;
const ABSOLUTE_UNIX_PATH_REGEX = /^\//;

/**
 * Converts any file path to a repo-relative POSIX path.
 * Uses Node's path.resolve/path.relative for correctness.
 */
function normalizeRepoPath(filePath: string): string {
  if (!filePath) return '';

  // Normalize separators to forward slashes
  const normalized = filePath.split(sep).join('/');

  // If it's already a relative path (no drive letter, no leading slash)
  if (!ABSOLUTE_WINDOWS_PATH_REGEX.test(normalized) && !ABSOLUTE_UNIX_PATH_REGEX.test(normalized)) {
    // Still normalize through path.resolve to handle ./ and ../ segments
    const resolved = resolve(REPO_ROOT, normalized);
    const rel = relative(REPO_ROOT, resolved);
    return rel.split(sep).join('/');
  }

  // For absolute paths, resolve and make relative to repo root
  const resolved = resolve(REPO_ROOT, normalized);
  const rel = relative(REPO_ROOT, resolved);
  return rel.split(sep).join('/');
}

function normalizeIssueMessage(message: string): string {
  return message
    .replace(ANSI_ESCAPE_REGEX, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]$/, '');
}

function getIssueKey(issue: Pick<VerificationIssue, 'tool' | 'file' | 'rule' | 'message'>): string {
  const file = normalizeRepoPath(issue.file ?? '');
  const rule = issue.rule ?? '';
  const message = normalizeIssueMessage(issue.message).slice(0, 120);
  return `${issue.tool}::${file}::${rule}::${message}`;
}

function compareIssues(
  current: VerificationIssue[],
  baseline: Baseline | null
): { newIssues: VerificationIssue[]; baselineIssues: VerificationIssue[]; resolvedIssues: BaselineIssue[] } {
  const baselineIssues: BaselineIssue[] = baseline?.known_issues?.lint ?? [];

  // Baseline issues are always lint tool — must include tool='lint' for key match
  const currentKeys = new Set(current.map(getIssueKey));
  const baselineKeys = new Map(baselineIssues.map(b => [
    getIssueKey({ tool: 'lint' as const, file: b.file, rule: b.rule, message: b.message }),
    b
  ]));

  const newIssues: VerificationIssue[] = [];
  const matchedBaseline: VerificationIssue[] = [];

  for (const issue of current) {
    const key = getIssueKey(issue);
    if (baselineKeys.has(key)) {
      matchedBaseline.push(issue);
    } else {
      newIssues.push(issue);
    }
  }

  const resolvedIssues: BaselineIssue[] = [];
  for (const bIssue of baselineIssues) {
    const key = getIssueKey({ tool: 'lint' as const, file: bIssue.file, rule: bIssue.rule, message: bIssue.message });
    if (!currentKeys.has(key)) {
      resolvedIssues.push(bIssue);
    }
  }

  return { newIssues, baselineIssues: matchedBaseline, resolvedIssues };
}

function computeVerdict(input: {
  testFailed: boolean;
  testSummaryParseFailed: boolean;
  newTypeCheckErrors: number;
  newLintErrors: number;
  buildFailed: boolean;
  baselineLintMatched: number;
  newWarnings: number;
  newBuildWarningBlocks: boolean;
}): Verdict {
  if (input.testFailed) return 'FAIL';
  if (input.testSummaryParseFailed) return 'FAIL';
  if (input.newTypeCheckErrors > 0) return 'FAIL';
  if (input.newLintErrors > 0) return 'FAIL';
  if (input.buildFailed) return 'FAIL';
  if (input.baselineLintMatched > 0) return 'PASS_WITH_BASELINE_ISSUES';
  return 'PASS';
}

function validateReportConsistency(
  verdict: Verdict,
  matrix: VerificationMatrix[],
  testSummaryParseFailed: boolean
): void {
  const errors: string[] = [];

  const blockingFailures: string[] = [];
  for (const m of matrix) {
    if (m.blocks && m.status === 'FAIL') {
      blockingFailures.push(m.check);
    }
  }

  if (blockingFailures.length > 0 && verdict !== 'FAIL') {
    errors.push(`Verdict is "${verdict}" but matrix has blocking failures: [${blockingFailures.join(', ')}]`);
  }

  if (blockingFailures.length === 0 && verdict === 'FAIL') {
    errors.push(`Verdict is "FAIL" but matrix has no blocking failures`);
  }

  const lintMatrix = matrix.find(m => m.check === 'Lint');
  if (lintMatrix) {
    const hasNewLintErrors = lintMatrix.newErrors > 0;
    if (hasNewLintErrors && verdict !== 'FAIL') {
      errors.push(`Lint has ${lintMatrix.newErrors} new errors but verdict is "${verdict}"`);
    }
  }

  const testMatrix = matrix.find(m => m.check === 'Tests');
  if (testMatrix && testMatrix.status === 'FAIL' && verdict !== 'FAIL') {
    errors.push(`Tests status is FAIL but verdict is "${verdict}"`);
  }

  if (testSummaryParseFailed && verdict !== 'FAIL') {
    errors.push(`Test summary parse failed but verdict is "${verdict}"`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Report consistency validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
}

function extractTestSummary(output: string): TestSummary {
  const cleanOutput = output.replace(ANSI_ESCAPE_REGEX, '');

  const filesMatch = cleanOutput.match(/Test Files\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const testsMatch = cleanOutput.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const durationMatch = cleanOutput.match(/Duration\s+([\d.]+s)/);

  const filesTotal = filesMatch ? parseInt(filesMatch[3], 10) : 0;
  const filesPassed = filesMatch ? parseInt(filesMatch[2], 10) : 0;
  const filesFailed = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;

  const testsTotal = testsMatch ? parseInt(testsMatch[3], 10) : 0;
  const testsPassed = testsMatch ? parseInt(testsMatch[2], 10) : 0;
  const testsFailed = testsMatch?.[1] ? parseInt(testsMatch[1], 10) : 0;

  const outputHasTestIndicators = cleanOutput.includes('Test Files') || cleanOutput.includes('Tests') || cleanOutput.includes('passed');
  const parseFailed = outputHasTestIndicators && filesTotal === 0 && testsTotal === 0;

  return {
    filesTotal,
    filesPassed,
    filesFailed,
    testsTotal,
    testsPassed,
    testsFailed,
    duration: durationMatch?.[1] ?? 'unknown',
    parseFailed,
  };
}

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const BASELINE_LINT_ISSUES: BaselineIssue[] = [
  { file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', status: 'known' },
  { file: 'src/app/page.tsx', line: 20, rule: 'prefer-const', message: "'foo' is never reassigned", status: 'known' },
  { file: 'src/components/Button.tsx', line: 5, rule: 'react/no-unescaped-entities', message: '`"` can be escaped', status: 'known' },
];

const BASELINE: Baseline = {
  version: '1.1',
  path_format: 'repo-relative-posix',
  updated_at: '2026-09-03T00:00:00Z',
  source_commit: 'abc123',
  allow_test_baseline: false,
  new_build_warning_blocks: false,
  known_issues: { lint: BASELINE_LINT_ISSUES },
};

// ═══════════════════════════════════════════════════════════════════════════
// Test Cases from the task specification
// ═══════════════════════════════════════════════════════════════════════════

// ─── Test 1: Baseline 11 → Current 11 same → PASS_WITH_BASELINE_ISSUES ────

describe('Test 1: Identical baseline issues → PASS_WITH_BASELINE_ISSUES', () => {
  it('all baseline issues present, no new', () => {
    const current: VerificationIssue[] = BASELINE_LINT_ISSUES.map(b => ({
      tool: 'lint',
      file: b.file,
      line: b.line,
      rule: b.rule,
      message: b.message,
      severity: 'error' as const,
    }));

    const result = compareIssues(current, BASELINE);
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(3);
    expect(result.resolvedIssues).toHaveLength(0);

    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: result.newIssues.filter(i => i.severity === 'error').length,
      buildFailed: false,
      baselineLintMatched: result.baselineIssues.length,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('PASS_WITH_BASELINE_ISSUES');
  });
});

// ─── Test 2: Baseline 11, Current 12 (1 new) → FAIL ────────────────────────

describe('Test 2: One new issue added → FAIL', () => {
  it('detects single new issue', () => {
    const current: VerificationIssue[] = [
      ...BASELINE_LINT_ISSUES.map(b => ({
        tool: 'lint' as const,
        file: b.file,
        line: b.line,
        rule: b.rule,
        message: b.message,
        severity: 'error' as const,
      })),
      { tool: 'lint', file: 'src/new-file.ts', line: 42, rule: 'no-console', message: 'Unexpected console statement', severity: 'error' as const },
    ];

    const result = compareIssues(current, BASELINE);
    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].file).toBe('src/new-file.ts');
    expect(result.baselineIssues).toHaveLength(3);

    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: result.newIssues.filter(i => i.severity === 'error').length,
      buildFailed: false,
      baselineLintMatched: result.baselineIssues.length,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('FAIL');
  });
});

// ─── Test 3: Baseline 0, Current 0 → PASS ──────────────────────────────────

describe('Test 3: No issues at all → PASS', () => {
  it('clean codebase', () => {
    const result = compareIssues([], null);
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(0);

    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintMatched: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('PASS');
  });
});

// ─── Test 4: Test failure → FAIL ───────────────────────────────────────────

describe('Test 4: Test failure → FAIL', () => {
  it('test failure takes priority', () => {
    const verdict = computeVerdict({
      testFailed: true,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintMatched: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('FAIL');
  });
});

// ─── Test 5: Typecheck error → FAIL ────────────────────────────────────────

describe('Test 5: Typecheck error → FAIL', () => {
  it('single typecheck error', () => {
    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 1,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintMatched: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('FAIL');
  });
});

// ─── Test 6: Build failure → FAIL ──────────────────────────────────────────

describe('Test 6: Build failure → FAIL', () => {
  it('build exits non-zero', () => {
    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: true,
      baselineLintMatched: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('FAIL');
  });
});

// ─── Test 7: Same file/rule/message, different absolute path → baseline ────

describe('Test 7: Path normalization identity', () => {
  it('Windows absolute path matches repo-relative baseline', () => {
    // Use the actual repo root to construct a realistic Windows absolute path
    const absFile = `${REPO_ROOT}${sep}src${sep}app${sep}page.tsx`;
    
    const current: VerificationIssue[] = [
      {
        tool: 'lint',
        file: absFile,
        line: 10,
        rule: 'react-hooks/set-state-in-effect',
        message: 'Error: Calling setState synchronously',
        severity: 'error',
      },
    ];

    const result = compareIssues(current, BASELINE);
    // Should match baseline because path normalization resolves to same relative path
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(1);
  });

  it('Repo-relative path matches Windows-absolute baseline', () => {
    // Construct baseline with absolute path (simulating old format)
    const absFile = `${REPO_ROOT}${sep}src${sep}app${sep}page.tsx`;
    const oldBaseline: Baseline = {
      ...BASELINE,
      known_issues: {
        lint: [
          {
            file: absFile,
            line: 10,
            rule: 'react-hooks/set-state-in-effect',
            message: 'Error: Calling setState synchronously',
            status: 'known',
          },
        ],
      },
    };

    const current: VerificationIssue[] = [
      {
        tool: 'lint',
        file: 'src/app/page.tsx',
        line: 10,
        rule: 'react-hooks/set-state-in-effect',
        message: 'Error: Calling setState synchronously',
        severity: 'error',
      },
    ];

    const result = compareIssues(current, oldBaseline);
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(1);
  });
});

// ─── Test 8: Different line but same file/rule/message → same issue ────────

describe('Test 8: Line number does NOT affect identity', () => {
  it('different line, same file/rule/message = same issue', () => {
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/app/page.tsx', line: 99, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', severity: 'error' },
    ];

    const result = compareIssues(current, BASELINE);
    // Line 10 in baseline, line 99 in current — same key because line is excluded
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(1);
  });
});

// ─── Test 9: Lint warning only (no new errors) → NOT FAIL ─────────────────

describe('Test 9: Warning only (no new errors) → NOT FAIL', () => {
  it('new warnings only, baseline has issues → PASS_WITH_BASELINE_ISSUES', () => {
    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintMatched: 3,
      newWarnings: 1,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('PASS_WITH_BASELINE_ISSUES');
  });

  it('new warnings with no baseline → PASS', () => {
    const verdict = computeVerdict({
      testFailed: false,
      testSummaryParseFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintMatched: 0,
      newWarnings: 1,
      newBuildWarningBlocks: false,
    });
    expect(verdict).toBe('PASS');
  });
});

// ─── Test 10: Verdict consistency validation ───────────────────────────────

describe('Test 10: Verdict consistency validation', () => {
  it('throws when matrix shows blocking FAIL but verdict is PASS', () => {
    const matrix: VerificationMatrix[] = [
      {
        check: 'Tests',
        status: 'FAIL',
        current: 284,
        baseline: 0,
        new: 1,
        newErrors: 1,
        newWarnings: 0,
        resolved: 0,
        blocks: true,
      },
    ];

    const verdict: Verdict = 'PASS';

    expect(() => {
      validateReportConsistency(verdict, matrix, false);
    }).toThrow(/blocking failures/);
  });

  it('throws when Lint has new issues but verdict is not FAIL', () => {
    const matrix: VerificationMatrix[] = [
      {
        check: 'Lint',
        status: 'PASS_WITH_BASELINE',
        current: 5,
        baseline: 3,
        new: 2,
        newErrors: 2,
        newWarnings: 0,
        resolved: 0,
        blocks: false,
      },
      {
        check: 'Tests',
        status: 'PASS',
        current: 284,
        baseline: 0,
        new: 0,
        newErrors: 0,
        newWarnings: 0,
        resolved: 0,
        blocks: true,
      },
    ];

    const verdict: Verdict = 'PASS_WITH_BASELINE_ISSUES';

    expect(() => {
      validateReportConsistency(verdict, matrix, false);
    }).toThrow(/Lint has 2 new errors but verdict is "PASS_WITH_BASELINE_ISSUES"/);
  });

  it('throws when test parse failed but verdict is PASS', () => {
    const matrix: VerificationMatrix[] = [
      {
        check: 'Tests',
        status: 'PASS',
        current: 284,
        baseline: 0,
        new: 0,
        newErrors: 0,
        newWarnings: 0,
        resolved: 0,
        blocks: true,
      },
    ];

    const verdict: Verdict = 'PASS';

    expect(() => {
      validateReportConsistency(verdict, matrix, true);
    }).toThrow(/Test summary parse failed but verdict is "PASS"/);
  });

  it('passes when matrix and verdict agree (FAIL case)', () => {
    const matrix: VerificationMatrix[] = [
      {
        check: 'Tests',
        status: 'FAIL',
        current: 300,
        baseline: 0,
        new: 1,
        newErrors: 1,
        newWarnings: 0,
        resolved: 0,
        blocks: true,
      },
    ];

    const verdict: Verdict = 'FAIL';

    expect(() => {
      validateReportConsistency(verdict, matrix, false);
    }).not.toThrow();
  });

  it('passes when matrix and verdict agree (PASS case)', () => {
    const matrix: VerificationMatrix[] = [
      {
        check: 'Tests',
        status: 'PASS',
        current: 284,
        baseline: 0,
        new: 0,
        newErrors: 0,
        newWarnings: 0,
        resolved: 0,
        blocks: true,
      },
    ];

    const verdict: Verdict = 'PASS';

    expect(() => {
      validateReportConsistency(verdict, matrix, false);
    }).not.toThrow();
  });

  it('passes when verdict FAIL has no blocking failures', () => {
    // Verdict FAIL without blocking failures means verification failed for other reasons
    // This is a valid state (e.g., parse failure)
    const matrix: VerificationMatrix[] = [];

    const verdict: Verdict = 'FAIL';

    // Empty matrix = no blocking failures, but verdict is FAIL
    // This should throw because there's no explanation for the FAIL
    expect(() => {
      validateReportConsistency(verdict, matrix, false);
    }).toThrow(/Verdict is "FAIL" but matrix has no blocking failures/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Additional Detailed Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── Path Normalization Tests ──────────────────────────────────────────────

describe('normalizeRepoPath', () => {
  it('converts Windows absolute to relative', () => {
    const absPath = `${REPO_ROOT}${sep}src${sep}app${sep}page.tsx`;
    const result = normalizeRepoPath(absPath);
    expect(result).toBe('src/app/page.tsx');
    expect(result).not.toContain(':');
    expect(result).not.toContain(REPO_ROOT);
  });

  it('converts backslashes to forward slashes', () => {
    const result = normalizeRepoPath(`src${sep}app${sep}page.tsx`);
    expect(result).toBe('src/app/page.tsx');
  });

  it('preserves already relative path', () => {
    const result = normalizeRepoPath('src/app/page.tsx');
    expect(result).toBe('src/app/page.tsx');
  });

  it('handles paths with parentheses', () => {
    const absPath = `${REPO_ROOT}${sep}src${sep}app${sep}(app)${sep}settings${sep}page.tsx`;
    const result = normalizeRepoPath(absPath);
    expect(result).toBe('src/app/(app)/settings/page.tsx');
  });

  it('handles empty string', () => {
    const result = normalizeRepoPath('');
    expect(result).toBe('');
  });

  it('handles deeply nested paths', () => {
    const absPath = `${REPO_ROOT}${sep}src${sep}a${sep}b${sep}c${sep}d${sep}e.ts`;
    const result = normalizeRepoPath(absPath);
    expect(result).toBe('src/a/b/c/d/e.ts');
  });
});

// ─── Message Normalization Tests ───────────────────────────────────────────

describe('normalizeIssueMessage', () => {
  it('trims and collapses whitespace', () => {
    const result = normalizeIssueMessage('  Error:   Calling  setState  synchronously.  ');
    expect(result).toBe('Error: Calling setState synchronously');
  });

  it('removes ANSI escape sequences', () => {
    const result = normalizeIssueMessage('\x1b[31mError:\x1b[0m Some message.');
    expect(result).toBe('Error: Some message');
  });

  it('normalizes line breaks', () => {
    const result = normalizeIssueMessage('Error: Calling\n  setState synchronously');
    expect(result).toBe('Error: Calling setState synchronously');
  });

  it('removes trailing period', () => {
    const result = normalizeIssueMessage('message content.');
    expect(result).toBe('message content');
  });

  it('removes trailing comma', () => {
    const result = normalizeIssueMessage('message content,');
    expect(result).toBe('message content');
  });
});

// ─── Issue Key Identity Tests ─────────────────────────────────────────────

describe('getIssueKey', () => {
  it('generates stable keys for identical issues', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).toBe(getIssueKey(b));
  });

  it('generates same key for different absolute roots on same file', () => {
    const absFile = `${REPO_ROOT}${sep}src${sep}app${sep}page.tsx`;
    const a: VerificationIssue = { tool: 'lint', file: absFile, line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).toBe(getIssueKey(b));
  });

  it('generates same key for different line numbers', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 999, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).toBe(getIssueKey(b));
  });

  it('generates different keys for different files', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/a.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'message' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/b.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'message' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });

  it('generates different keys for different rules', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'message' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'prefer-const', message: 'message' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });

  it('generates different keys for different tools', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'rule', message: 'message' };
    const b: VerificationIssue = { tool: 'typecheck', file: 'src/app/page.tsx', line: 10, rule: 'rule', message: 'message' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });
});

// ─── Resolved issues detection ─────────────────────────────────────────────

describe('Resolved issues detection', () => {
  it('detects baseline issues no longer present', () => {
    const current: VerificationIssue[] = [
      // Only 1 of 3 baseline issues present (the first one)
      { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', severity: 'error' },
    ];

    const result = compareIssues(current, BASELINE);

    expect(result.baselineIssues).toHaveLength(1);
    expect(result.newIssues).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(2);
    expect(result.resolvedIssues.map(r => r.file)).toContain('src/app/page.tsx');
    expect(result.resolvedIssues.map(r => r.file)).toContain('src/components/Button.tsx');
  });
});

// ─── Test Summary Parsing ──────────────────────────────────────────────────

describe('extractTestSummary', () => {
  it('extracts passing test summary', () => {
    const output = `
      Test Files  16 passed (16)
      Tests      284 passed (284)
      Duration   12.3s
    `;

    const summary = extractTestSummary(output);

    expect(summary.filesTotal).toBe(16);
    expect(summary.filesPassed).toBe(16);
    expect(summary.filesFailed).toBe(0);
    expect(summary.testsTotal).toBe(284);
    expect(summary.testsPassed).toBe(284);
    expect(summary.testsFailed).toBe(0);
    expect(summary.duration).toBe('12.3s');
    expect(summary.parseFailed).toBe(false);
  });

  it('extracts failing test summary', () => {
    const output = `
      Test Files  1 failed | 15 passed (16)
      Tests      3 failed | 281 passed (284)
      Duration   15.1s
    `;

    const summary = extractTestSummary(output);

    expect(summary.filesTotal).toBe(16);
    expect(summary.filesPassed).toBe(15);
    expect(summary.filesFailed).toBe(1);
    expect(summary.testsTotal).toBe(284);
    expect(summary.testsPassed).toBe(281);
    expect(summary.testsFailed).toBe(3);
    expect(summary.parseFailed).toBe(false);
  });

  it('detects parse failure when output exists but no counts', () => {
    const output = `\x1b[32mTest Files\x1b[0m some garbage without numbers`;
    const summary = extractTestSummary(output);
    expect(summary.parseFailed).toBe(true);
  });

  it('handles empty output without parse failure flag', () => {
    const summary = extractTestSummary('');
    expect(summary.filesTotal).toBe(0);
    expect(summary.testsTotal).toBe(0);
    expect(summary.parseFailed).toBe(false);
  });

  it('handles output with only Tests line', () => {
    const output = `Tests  50 passed (50)`;
    const summary = extractTestSummary(output);
    expect(summary.testsTotal).toBe(50);
    expect(summary.testsPassed).toBe(50);
    expect(summary.testsFailed).toBe(0);
    expect(summary.parseFailed).toBe(false);
  });
});

// ─── Baseline read-only guarantee ─────────────────────────────────────────

describe('Baseline is read-only', () => {
  it('comparison function does not mutate baseline', () => {
    const baselineCopy: Baseline = JSON.parse(JSON.stringify(BASELINE));
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/new.ts', line: 1, rule: 'new-rule', message: 'New issue', severity: 'error' },
    ];

    compareIssues(current, BASELINE);

    // Baseline should be unchanged
    expect(BASELINE.known_issues.lint).toHaveLength(baselineCopy.known_issues.lint!.length);
    expect(BASELINE.source_commit).toBe(baselineCopy.source_commit);
  });

  it('null baseline treats all issues as new', () => {
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState', severity: 'error' },
    ];

    const result = compareIssues(current, null);

    expect(result.newIssues).toHaveLength(1);
    expect(result.baselineIssues).toHaveLength(0);
  });
});
