/**
 * Tests for the verification report system.
 *
 * Covers:
 * - Issue key generation
 * - Baseline comparison (new/baseline/resolved)
 * - Verdict computation
 * - Lint output parsing
 * - Test summary extraction (including ANSI color codes)
 */

import { describe, it, expect } from 'vitest';

// ─── Inline copies of core functions (to avoid spawning processes) ────────

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
  updated_at: string;
  source_commit: string;
  allow_test_baseline: boolean;
  new_build_warning_blocks: boolean;
  known_issues: {
    lint?: BaselineIssue[];
  };
}

function getIssueKey(issue: VerificationIssue): string {
  const file = issue.file ?? '';
  const rule = issue.rule ?? '';
  const message = issue.message.slice(0, 100).replace(/\s+/g, ' ').trim();
  return `${issue.tool}::${file}::${rule}::${message}`;
}

function getBaselineKey(issue: BaselineIssue): string {
  const file = issue.file;
  const rule = issue.rule;
  const message = issue.message.slice(0, 100).replace(/\s+/g, ' ').trim();
  return `lint::${file}::${rule}::${message}`;
}

function compareLintIssues(
  current: VerificationIssue[],
  baseline: Baseline | null
): { newIssues: VerificationIssue[]; baselineIssues: VerificationIssue[]; resolvedIssues: BaselineIssue[] } {
  const baselineIssues: BaselineIssue[] = baseline?.known_issues?.lint ?? [];

  const currentKeys = new Set(current.map(getIssueKey));
  const baselineKeys = new Map(baselineIssues.map(b => [getBaselineKey(b), b]));

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
    const key = getBaselineKey(bIssue);
    if (!currentKeys.has(key)) {
      resolvedIssues.push(bIssue);
    }
  }

  return { newIssues, baselineIssues: matchedBaseline, resolvedIssues };
}

type Verdict = 'PASS' | 'PASS_WITH_BASELINE_ISSUES' | 'FAIL';

interface VerdictInput {
  testFailed: boolean;
  newTypeCheckErrors: number;
  newLintErrors: number;
  buildFailed: boolean;
  baselineLintErrors: number;
  newWarnings: number;
  newBuildWarningBlocks: boolean;
}

function computeVerdict(input: VerdictInput): Verdict {
  if (input.testFailed) return 'FAIL';
  if (input.newTypeCheckErrors > 0) return 'FAIL';
  if (input.newLintErrors > 0) return 'FAIL';
  if (input.buildFailed) return 'FAIL';
  if (input.baselineLintErrors > 0) return 'PASS_WITH_BASELINE_ISSUES';
  return 'PASS';
}

function parseLintOutput(output: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const lines = output.split('\n');

  let currentFile: string | undefined;

  for (const line of lines) {
    // Skip ESLint location reference lines like "D:\path\file.ts:202:5"
    if (line.match(/:\d+:\d+$/) && !line.includes(' ')) {
      continue;
    }

    const fileMatch = line.match(/^([A-Za-z]:\\[^\s]+|[^\s]+)$/);
    if (fileMatch && !line.includes(' ') && !line.match(/^\s+\d+:\d+/)) {
      currentFile = fileMatch[1];
      continue;
    }

    const issueMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+)$/);
    if (issueMatch && currentFile) {
      const lineNum = parseInt(issueMatch[1], 10);
      const severity = issueMatch[3] as 'error' | 'warning';
      const fullMessage = issueMatch[4];

      let rule: string | undefined;
      const ruleMatch = fullMessage.match(/\s+([a-z@][\w\/-]+)$/);
      if (ruleMatch) {
        rule = ruleMatch[1];
      }

      issues.push({
        tool: 'lint',
        file: currentFile,
        line: lineNum,
        rule,
        message: fullMessage,
        severity,
      });
    }
  }

  return issues;
}

function extractTestSummary(output: string) {
  // Strip ANSI color codes (vitest outputs colors even when piped)
  const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  const filesMatch = cleanOutput.match(/Test Files\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const testsMatch = cleanOutput.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const durationMatch = cleanOutput.match(/Duration\s+([\d.]+s)/);

  const filesTotal = filesMatch ? parseInt(filesMatch[3], 10) : 0;
  const filesPassed = filesMatch ? parseInt(filesMatch[2], 10) : 0;
  const filesFailed = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;
  const testsTotal = testsMatch ? parseInt(testsMatch[3], 10) : 0;
  const testsPassed = testsMatch ? parseInt(testsMatch[2], 10) : 0;
  const testsFailed = testsMatch?.[1] ? parseInt(testsMatch[1], 10) : 0;

  return { filesTotal, filesPassed, filesFailed, testsTotal, testsPassed, testsFailed, duration: durationMatch?.[1] ?? 'unknown' };
}

// ─── Test Data ─────────────────────────────────────────────────────────────

const BASELINE_LINT_ISSUES: BaselineIssue[] = [
  { file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', status: 'known' },
  { file: 'src/app/page.tsx', line: 20, rule: 'prefer-const', message: "'foo' is never reassigned", status: 'known' },
  { file: 'src/components/Button.tsx', line: 5, rule: 'react/no-unescaped-entities', message: '`"` can be escaped', status: 'known' },
];

const BASELINE: Baseline = {
  version: '1.0',
  updated_at: '2026-09-03T00:00:00Z',
  source_commit: 'abc123',
  allow_test_baseline: false,
  new_build_warning_blocks: false,
  known_issues: { lint: BASELINE_LINT_ISSUES },
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('getIssueKey', () => {
  it('generates stable keys for identical issues', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).toBe(getIssueKey(b));
  });

  it('generates different keys for different files', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/a.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/b.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });

  it('generates different keys for different rules', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'prefer-const', message: 'Avoid calling setState' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });

  it('generates different keys for different messages', () => {
    const a: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState' };
    const b: VerificationIssue = { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Different message' };
    expect(getIssueKey(a)).not.toBe(getIssueKey(b));
  });
});

describe('compareLintIssues', () => {
  // Case 1: Baseline 3 errors, Current 3 same errors → PASS_WITH_BASELINE_ISSUES
  it('Case 1: identical issues → all baseline, no new', () => {
    const current: VerificationIssue[] = BASELINE_LINT_ISSUES.map(b => ({
      tool: 'lint',
      file: b.file,
      line: b.line,
      rule: b.rule,
      message: b.message,
      severity: 'error' as const,
    }));

    const result = compareLintIssues(current, BASELINE);

    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(3);
    expect(result.resolvedIssues).toHaveLength(0);
  });

  // Case 2: Baseline 3 errors, Current 4 errors (1 new) → FAIL
  it('Case 2: one new issue detected', () => {
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

    const result = compareLintIssues(current, BASELINE);

    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].file).toBe('src/new-file.ts');
    expect(result.baselineIssues).toHaveLength(3);
  });

  // Case 3: Baseline 0, Current 0 → PASS
  it('Case 3: no issues at all', () => {
    const result = compareLintIssues([], null);
    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(0);
  });

  // Case 7: Same file, same rule, same message, different line → treated as baseline
  it('Case 7: same file/rule/message but different line → treated as baseline', () => {
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/app/page.tsx', line: 99, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', severity: 'error' },
    ];

    const result = compareLintIssues(current, BASELINE);

    expect(result.newIssues).toHaveLength(0);
    expect(result.baselineIssues).toHaveLength(1);
  });

  it('detects resolved issues (in baseline but not in current)', () => {
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Error: Calling setState synchronously', severity: 'error' },
    ];

    const result = compareLintIssues(current, BASELINE);

    expect(result.baselineIssues).toHaveLength(1);
    expect(result.resolvedIssues).toHaveLength(2);
    expect(result.resolvedIssues.map(r => r.file)).toContain('src/app/page.tsx');
    expect(result.resolvedIssues.map(r => r.file)).toContain('src/components/Button.tsx');
  });
});

describe('computeVerdict', () => {
  it('PASS when no issues', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintErrors: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('PASS');
  });

  it('PASS_WITH_BASELINE_ISSUES when only baseline lint errors', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintErrors: 11,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('PASS_WITH_BASELINE_ISSUES');
  });

  it('FAIL on test failure', () => {
    expect(computeVerdict({
      testFailed: true,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintErrors: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('FAIL');
  });

  it('FAIL on new typecheck error', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 1,
      newLintErrors: 0,
      buildFailed: false,
      baselineLintErrors: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('FAIL');
  });

  it('FAIL on new lint error', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 1,
      buildFailed: false,
      baselineLintErrors: 5,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('FAIL');
  });

  it('FAIL on build failure', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 0,
      buildFailed: true,
      baselineLintErrors: 0,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('FAIL');
  });

  it('FAIL takes priority over PASS_WITH_BASELINE', () => {
    expect(computeVerdict({
      testFailed: false,
      newTypeCheckErrors: 0,
      newLintErrors: 1,
      buildFailed: false,
      baselineLintErrors: 11,
      newWarnings: 0,
      newBuildWarningBlocks: false,
    })).toBe('FAIL');
  });
});

describe('parseLintOutput', () => {
  it('parses ESLint output format correctly', () => {
    const output = `D:\\Project\\contextos\\src\\app\\page.tsx
  10:5  error  Avoid calling setState synchronously  react-hooks/set-state-in-effect
  20:3  warning  'foo' is assigned but never used  @typescript-eslint/no-unused-vars

D:\\Project\\contextos\\src\\components\\Button.tsx
  5:1  error  \`"\` can be escaped  react/no-unescaped-entities

✖ 3 problems (2 errors, 1 warning)`;

    const issues = parseLintOutput(output);

    expect(issues).toHaveLength(3);
    expect(issues[0].file).toBe('D:\\Project\\contextos\\src\\app\\page.tsx');
    expect(issues[0].line).toBe(10);
    expect(issues[0].rule).toBe('react-hooks/set-state-in-effect');
    expect(issues[0].severity).toBe('error');
    expect(issues[1].line).toBe(20);
    expect(issues[1].severity).toBe('warning');
    expect(issues[2].file).toBe('D:\\Project\\contextos\\src\\components\\Button.tsx');
  });

  it('handles empty output', () => {
    const issues = parseLintOutput('');
    expect(issues).toHaveLength(0);
  });

  it('handles output with no issues', () => {
    const issues = parseLintOutput('✖ 0 problems (0 errors, 0 warnings)');
    expect(issues).toHaveLength(0);
  });
});

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
  });

  it('handles ANSI color codes in vitest output', () => {
    const output = `\x1B[2m Test Files \x1B[22m\x1B[1m\x1B[32m17 passed\x1B[22m\x1B[90m (17)\x1B[39m
\x1B[2m      Tests \x1B[22m\x1B[1m\x1B[32m308 passed\x1B[22m\x1B[90m (308)\x1B[39m
\x1B[2m   Duration\x1B[22m   3.97s (transform 2.14s, setup 0ms)`;

    const summary = extractTestSummary(output);

    expect(summary.filesTotal).toBe(17);
    expect(summary.filesPassed).toBe(17);
    expect(summary.testsTotal).toBe(308);
    expect(summary.testsPassed).toBe(308);
  });

  it('handles missing data', () => {
    const summary = extractTestSummary('no test output');
    expect(summary.filesTotal).toBe(0);
    expect(summary.testsTotal).toBe(0);
    expect(summary.duration).toBe('unknown');
  });
});

describe('Baseline safety', () => {
  it('baseline is never auto-expanded by comparison', () => {
    const baselineCopy: Baseline = JSON.parse(JSON.stringify(BASELINE));
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/new.ts', line: 1, rule: 'new-rule', message: 'New issue', severity: 'error' },
    ];

    compareLintIssues(current, BASELINE);

    expect(BASELINE.known_issues.lint).toHaveLength(baselineCopy.known_issues.lint!.length);
    expect(BASELINE.source_commit).toBe(baselineCopy.source_commit);
  });

  it('null baseline treats all issues as new', () => {
    const current: VerificationIssue[] = [
      { tool: 'lint', file: 'src/app/page.tsx', line: 10, rule: 'react-hooks/set-state-in-effect', message: 'Avoid calling setState', severity: 'error' },
    ];

    const result = compareLintIssues(current, null);

    expect(result.newIssues).toHaveLength(1);
    expect(result.baselineIssues).toHaveLength(0);
  });
});
