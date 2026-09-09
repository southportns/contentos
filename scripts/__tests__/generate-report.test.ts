/**
 * Tests for the verification report system.
 *
 * Covers:
 * - Path normalization (Windows, Unix, already-relative)
 * - Issue identity (unified, excludes line number)
 * - Message normalization
 * - Baseline validation (with duplicate detection)
 * - Baseline comparison (new/baseline/resolved + duplicate tracking)
 * - Baseline deduplication (one-to-one matching)
 * - Verdict computation
 * - Verdict consistency validation (Baseline Matched <= Baseline Unique)
 * - Lint output parsing (JSON + human-readable)
 * - Test summary extraction
 * - Issue identity tests
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
  duplicates: number;
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

interface IssueComparisonResult {
  newIssues: VerificationIssue[];
  baselineIssues: VerificationIssue[];
  resolvedIssues: BaselineIssue[];
  duplicateCurrentIssues: VerificationIssue[];
  duplicateBaselineIssues: BaselineIssue[];
  uniqueBaselineCount: number;
}

// ─── Implementations (mirror production code) ────────────────────────────

const REPO_ROOT = process.cwd();
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;
const ABSOLUTE_UNIX_PATH_REGEX = /^\//;

function normalizeRepoPath(filePath: string): string {
  if (!filePath) return '';
  const normalized = filePath.split(sep).join('/');
  if (!ABSOLUTE_WINDOWS_PATH_REGEX.test(normalized) && !ABSOLUTE_UNIX_PATH_REGEX.test(normalized)) {
    const resolved = resolve(REPO_ROOT, normalized);
    const rel = relative(REPO_ROOT, resolved);
    return rel.split(sep).join('/');
  }
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

interface DeduplicatedBaseline {
  unique: BaselineIssue[];
  duplicates: BaselineIssue[];
}

function deduplicateBaselineIssues(issues: BaselineIssue[]): DeduplicatedBaseline {
  const seen = new Map<string, BaselineIssue>();
  const duplicates: BaselineIssue[] = [];
  for (const issue of issues) {
    const key = getIssueKey({ tool: 'lint', file: issue.file, rule: issue.rule, message: issue.message });
    if (seen.has(key)) { duplicates.push(issue); } else { seen.set(key, issue); }
  }
  return { unique: Array.from(seen.values()), duplicates };
}

function compareIssues(current: VerificationIssue[], baseline: Baseline | null): IssueComparisonResult {
  const rawBaselineIssues: BaselineIssue[] = baseline?.known_issues?.lint ?? [];
  const dedupedBaseline = deduplicateBaselineIssues(rawBaselineIssues);
  const uniqueBaseline = dedupedBaseline.unique;
  const baselineKeys = new Map<string, BaselineIssue>();
  for (const b of uniqueBaseline) {
    const key = getIssueKey({ tool: 'lint' as const, file: b.file, rule: b.rule, message: b.message });
    baselineKeys.set(key, b);
  }
  const currentByKey = new Map<string, VerificationIssue[]>();
  for (const issue of current) {
    const key = getIssueKey(issue);
    const existing = currentByKey.get(key);
    if (existing) { existing.push(issue); } else { currentByKey.set(key, [issue]); }
  }
  const matchedBaseline: VerificationIssue[] = [];
  const newIssues: VerificationIssue[] = [];
  const duplicateCurrentIssues: VerificationIssue[] = [];
  for (const [key, issues] of currentByKey) {
    if (baselineKeys.has(key)) {
      matchedBaseline.push(issues[0]);
      for (let i = 1; i < issues.length; i++) duplicateCurrentIssues.push(issues[i]);
    } else {
      newIssues.push(issues[0]);
      for (let i = 1; i < issues.length; i++) duplicateCurrentIssues.push(issues[i]);
    }
  }
  const resolvedIssues: BaselineIssue[] = [];
  for (const bIssue of uniqueBaseline) {
    const key = getIssueKey({ tool: 'lint' as const, file: bIssue.file, rule: bIssue.rule, message: bIssue.message });
    if (!currentByKey.has(key)) resolvedIssues.push(bIssue);
  }
  return {
    newIssues, baselineIssues: matchedBaseline, resolvedIssues,
    duplicateCurrentIssues, duplicateBaselineIssues: dedupedBaseline.duplicates,
    uniqueBaselineCount: uniqueBaseline.length,
  };
}

function computeVerdict(input: {
  testFailed: boolean; testSummaryParseFailed: boolean; newTypeCheckErrors: number;
  newLintErrors: number; buildFailed: boolean; baselineLintMatched: number;
  newWarnings: number; newBuildWarningBlocks: boolean;
}): Verdict {
  if (input.testFailed) return 'FAIL';
  if (input.testSummaryParseFailed) return 'FAIL';
  if (input.newTypeCheckErrors > 0) return 'FAIL';
  if (input.newLintErrors > 0) return 'FAIL';
  if (input.buildFailed) return 'FAIL';
  if (input.baselineLintMatched > 0) return 'PASS_WITH_BASELINE_ISSUES';
  return 'PASS';
}

function validateReportConsistency(input: {
  verdict: Verdict; matrix: VerificationMatrix[]; testSummaryParseFailed: boolean;
  baselineMatchedCount: number; baselineUniqueCount: number;
}): void {
  const { verdict, matrix, testSummaryParseFailed, baselineMatchedCount, baselineUniqueCount } = input;
  const errors: string[] = [];
  const blockingFailures: string[] = [];
  for (const m of matrix) { if (m.blocks && m.status === 'FAIL') blockingFailures.push(m.check); }
  if (blockingFailures.length > 0 && verdict !== 'FAIL') errors.push(`Verdict is "${verdict}" but matrix has blocking failures: [${blockingFailures.join(', ')}]`);
  if (blockingFailures.length === 0 && verdict === 'FAIL') errors.push(`Verdict is "FAIL" but matrix has no blocking failures`);
  const lintMatrix = matrix.find(m => m.check === 'Lint');
  if (lintMatrix) { const hasNewLintErrors = lintMatrix.newErrors > 0; if (hasNewLintErrors && verdict !== 'FAIL') errors.push(`Lint has ${lintMatrix.newErrors} new errors but verdict is "${verdict}"`); }
  const testMatrix = matrix.find(m => m.check === 'Tests');
  if (testMatrix && testMatrix.status === 'FAIL' && verdict !== 'FAIL') errors.push(`Tests status is FAIL but verdict is "${verdict}"`);
  if (testSummaryParseFailed && verdict !== 'FAIL') errors.push(`Test summary parse failed but verdict is "${verdict}"`);
  if (baselineMatchedCount > baselineUniqueCount) errors.push(`Baseline Matched (${baselineMatchedCount}) exceeds Baseline Unique (${baselineUniqueCount}). This indicates a duplicate matching bug.`);
  if (errors.length > 0) throw new Error(`Report consistency validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
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