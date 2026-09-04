#!/usr/bin/env tsx
/**
 * ContextOS — Automated Verification Report Generator
 *
 * Runs npm test, typecheck, lint, and build,
 * compares against baseline, and generates a Markdown report.
 *
 * Usage:
 *   npx tsx scripts/generate-report.ts [--task <task-name>]
 *
 * Options:
 *   --task <name>    Task name for report title and filename
 *
 * Output:
 *   docs/reports/YYYY-MM-DD-<task-name>.md
 *
 * Exit codes:
 *   0 = PASS or PASS_WITH_BASELINE_ISSUES
 *   1 = FAIL OR invalid configuration OR consistency violation
 */

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// ─── Constants ────────────────────────────────────────────────────────────

const REPO_ROOT = process.cwd();
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;
const ABSOLUTE_UNIX_PATH_REGEX = /^\//;

// ─── Types ────────────────────────────────────────────────────────────────

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
  description?: string;
  allow_test_baseline: boolean;
  new_build_warning_blocks: boolean;
  known_issues: {
    lint?: BaselineIssue[];
  };
}

interface CheckResult {
  name: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

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

interface LintSummary {
  errors: number;
  warnings: number;
}

interface ChangedFiles {
  added: string[];
  modified: string[];
  deleted: string[];
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

// ─── Path Normalization ───────────────────────────────────────────────────

/**
 * Converts any file path to a repo-relative POSIX path.
 * Handles:
 * - Windows absolute: D:\Project\contextos\src\...\file.ts → src/.../file.ts
 * - Unix absolute: /home/user/contextos/src/.../file.ts → src/.../file.ts
 * - Already relative: src/.../file.ts → src/.../file.ts (normalized)
 * - Mixed separators: src\\app\file.ts → src/app/file.ts
 */
function normalizeRepoPath(filePath: string): string {
  if (!filePath) return '';

  // First, normalize separators to forward slashes
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

// ─── Message Normalization ────────────────────────────────────────────────

/**
 * Normalizes issue messages for stable identity comparison.
 * - Removes ANSI escape sequences
 * - Trims whitespace
 * - Collapses internal whitespace to single spaces
 * - Removes trailing punctuation differences (period, colon)
 * - Normalizes line breaks to spaces
 */
function normalizeIssueMessage(message: string): string {
  return message
    .replace(ANSI_ESCAPE_REGEX, '')     // Remove ANSI escape sequences
    .replace(/\r?\n/g, ' ')              // Normalize line breaks to spaces
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim()                               // Trim leading/trailing
    .replace(/[.,;:]$/, '');             // Remove trailing punctuation
}

// ─── Issue Identity ──────────────────────────────────────────────────────

/**
 * Creates a stable identity key for any issue (current or baseline).
 * Identity does NOT include line number (lines shift during development).
 * Format: tool::relative_posix_file::rule::normalized_message
 */
function getIssueKey(issue: Pick<VerificationIssue, 'tool' | 'file' | 'rule' | 'message'>): string {
  const file = normalizeRepoPath(issue.file ?? '');
  const rule = issue.rule ?? '';
  const message = normalizeIssueMessage(issue.message).slice(0, 120);
  return `${issue.tool}::${file}::${rule}::${message}`;
}

// ─── Baseline Validation ──────────────────────────────────────────────────

interface BaselineValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates baseline structure and path format.
 * Fails hard on any violation — never silently continues.
 */
function validateBaseline(baseline: Baseline): BaselineValidationResult {
  const errors: string[] = [];

  // Check required top-level fields
  if (!baseline.version) {
    errors.push('Missing baseline.version');
  }
  if (!baseline.source_commit) {
    errors.push('Missing baseline.source_commit');
  }
  if (!baseline.path_format) {
    errors.push('Missing baseline.path_format');
  } else if (baseline.path_format !== 'repo-relative-posix') {
    errors.push(`Invalid baseline.path_format: "${baseline.path_format}" (expected "repo-relative-posix")`);
  }

  // Validate all lint issue paths are repo-relative
  const lintIssues = baseline.known_issues?.lint ?? [];
  for (let i = 0; i < lintIssues.length; i++) {
    const issue = lintIssues[i];
    const file = issue.file;

    if (ABSOLUTE_WINDOWS_PATH_REGEX.test(file)) {
      errors.push(`Lint issue [${i}] has absolute Windows path: "${file}"`);
    } else if (ABSOLUTE_UNIX_PATH_REGEX.test(file)) {
      errors.push(`Lint issue [${i}] has absolute Unix path: "${file}"`);
    }

    if (!issue.rule) {
      errors.push(`Lint issue [${i}] missing rule`);
    }
    if (!issue.message) {
      errors.push(`Lint issue [${i}] missing message`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Parsers ──────────────────────────────────────────────────────────────

function parseLintOutput(output: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  // Try to parse ESLint JSON output first
  try {
    const jsonData = JSON.parse(output) as Array<{
      filePath: string;
      messages: Array<{
        ruleId: string | null;
        severity: number;
        message: string;
        line: number;
        column: number;
      }>;
      suppressedMessages?: Array<{
        ruleId: string | null;
        severity: number;
        message: string;
        line: number;
        column: number;
      }>;
    }>;

    for (const fileResult of jsonData) {
      for (const msg of fileResult.messages) {
        if (!msg.ruleId) continue;
        const firstLine = msg.message.split('\n')[0].trim();
        issues.push({
          tool: 'lint',
          file: normalizeRepoPath(fileResult.filePath),
          line: msg.line,
          rule: msg.ruleId,
          message: firstLine,
          severity: msg.severity === 2 ? 'error' : 'warning',
        });
      }
    }

    return issues;
  } catch {
    // Fallback: parse human-readable format
  }

  // Fallback: parse human-readable ESLint output
  const lines = output.split('\n');
  let currentFile: string | undefined;

  for (const line of lines) {
    // Skip ESLint location reference lines like "D:\path\file.ts:202:5"
    if (line.match(/:\d+:\d+$/) && !line.includes(' ')) {
      continue;
    }

    // Match file path line (Windows or Unix style, no spaces)
    const fileMatch = line.match(/^([A-Za-z]:\\[^\s]+|[^\s]+)$/);
    if (fileMatch && !line.includes(' ') && !line.match(/^\s+\d+:\d+/)) {
      currentFile = normalizeRepoPath(fileMatch[1]);
      continue;
    }

    // Match issue line: "  202:5  error  Message..."
    const issueMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+)$/);
    if (issueMatch && currentFile) {
      const lineNum = parseInt(issueMatch[1], 10);
      const severity = issueMatch[3] as 'error' | 'warning';
      const fullMessage = issueMatch[4];

      // Extract rule from message if present
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

function parseTypeCheckOutput(output: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: "src/file.ts(10,5): error TS2322: Type 'string' is not assignable..."
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
    if (match) {
      issues.push({
        tool: 'typecheck',
        file: normalizeRepoPath(match[1]),
        line: parseInt(match[2], 10),
        rule: match[4],
        message: match[5],
      });
    }
  }

  return issues;
}

function extractTestSummary(output: string): TestSummary {
  // Strip ANSI color codes
  const cleanOutput = output.replace(ANSI_ESCAPE_REGEX, '');

  // Match: "Test Files  16 passed (16)" or "Test Files  1 failed | 15 passed (16)"
  const filesMatch = cleanOutput.match(/Test Files\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const testsMatch = cleanOutput.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/);
  const durationMatch = cleanOutput.match(/Duration\s+([\d.]+s)/);

  const filesTotal = filesMatch ? parseInt(filesMatch[3], 10) : 0;
  const filesPassed = filesMatch ? parseInt(filesMatch[2], 10) : 0;
  const filesFailed = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;

  const testsTotal = testsMatch ? parseInt(testsMatch[3], 10) : 0;
  const testsPassed = testsMatch ? parseInt(testsMatch[2], 10) : 0;
  const testsFailed = testsMatch?.[1] ? parseInt(testsMatch[1], 10) : 0;

  // Detect parse failure: output exists but we couldn't extract any test data
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

// ─── Baseline ──────────────────────────────────────────────────────────────

function loadBaseline(): Baseline | null {
  const baselinePath = join(REPO_ROOT, 'docs', 'reports', 'baseline.json');
  if (!existsSync(baselinePath)) {
    return null;
  }
  try {
    const content = readFileSync(baselinePath, 'utf-8');
    return JSON.parse(content) as Baseline;
  } catch {
    return null;
  }
}

// ─── Comparison ────────────────────────────────────────────────────────────

function compareIssues(
  current: VerificationIssue[],
  baseline: Baseline | null
): { newIssues: VerificationIssue[]; baselineIssues: VerificationIssue[]; resolvedIssues: BaselineIssue[] } {
  const baselineIssues: BaselineIssue[] = baseline?.known_issues?.lint ?? [];

  // Use unified identity function for both current and baseline
  // Baseline issues are always lint tool, so we construct the key with tool='lint'
  const currentKeys = new Set(current.map(getIssueKey));
  const baselineKeys = new Map(baselineIssues.map(b => [getIssueKey({ tool: 'lint', file: b.file, rule: b.rule, message: b.message }), b]));

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
    // Baseline issues are always lint tool — must include tool='lint' for key match
    const key = getIssueKey({ tool: 'lint', file: bIssue.file, rule: bIssue.rule, message: bIssue.message });
    if (!currentKeys.has(key)) {
      resolvedIssues.push(bIssue);
    }
  }

  return { newIssues, baselineIssues: matchedBaseline, resolvedIssues };
}

// ─── Verdict ──────────────────────────────────────────────────────────────

type Verdict = 'PASS' | 'PASS_WITH_BASELINE_ISSUES' | 'FAIL';

interface VerdictInput {
  testFailed: boolean;
  testSummaryParseFailed: boolean;
  newTypeCheckErrors: number;
  newLintErrors: number;
  buildFailed: boolean;
  baselineLintMatched: number;
  newWarnings: number;
  newBuildWarningBlocks: boolean;
}

/**
 * Computes verdict based on blocking rules.
 * Pure function: no I/O, no side effects.
 */
function computeVerdict(input: VerdictInput): Verdict {
  // Rule 1: Test failure → FAIL
  if (input.testFailed) return 'FAIL';

  // Rule 2: Test summary parse failure → FAIL (can't verify tests passed)
  if (input.testSummaryParseFailed) return 'FAIL';

  // Rule 3: New typecheck errors → FAIL
  if (input.newTypeCheckErrors > 0) return 'FAIL';

  // Rule 4: New lint errors → FAIL
  if (input.newLintErrors > 0) return 'FAIL';

  // Rule 5: Build failure → FAIL
  if (input.buildFailed) return 'FAIL';

  // Rule 6: No blocking issues but baseline issues exist → PASS_WITH_BASELINE_ISSUES
  if (input.baselineLintMatched > 0) return 'PASS_WITH_BASELINE_ISSUES';

  // Rule 7: No issues at all → PASS
  return 'PASS';
}

/**
 * Validates that verdict is consistent with the verification matrix.
 * Throws Error if inconsistent — never returns false silently.
 */
function validateReportConsistency(
  verdict: Verdict,
  matrix: VerificationMatrix[],
  testSummaryParseFailed: boolean
): void {
  const errors: string[] = [];

  // Collect blocking failures from matrix
  const blockingFailures: string[] = [];
  for (const m of matrix) {
    if (m.blocks && m.status === 'FAIL') {
      blockingFailures.push(m.check);
    }
  }

  // Check verdict matches blocking failures
  if (blockingFailures.length > 0 && verdict !== 'FAIL') {
    errors.push(`Verdict is "${verdict}" but matrix has blocking failures: [${blockingFailures.join(', ')}]`);
  }

  if (blockingFailures.length === 0 && verdict === 'FAIL') {
    errors.push(`Verdict is "FAIL" but matrix has no blocking failures`);
  }

  // Check lint matrix internal consistency
  const lintMatrix = matrix.find(m => m.check === 'Lint');
  if (lintMatrix) {
    const hasNewLintErrors = lintMatrix.newErrors > 0;
    if (hasNewLintErrors && verdict !== 'FAIL') {
      errors.push(`Lint has ${lintMatrix.newErrors} new errors but verdict is "${verdict}"`);
    }
  }

  // Check test matrix internal consistency
  const testMatrix = matrix.find(m => m.check === 'Tests');
  if (testMatrix && testMatrix.status === 'FAIL' && verdict !== 'FAIL') {
    errors.push(`Tests status is FAIL but verdict is "${verdict}"`);
  }

  // Check test summary parse failure
  if (testSummaryParseFailed && verdict !== 'FAIL') {
    errors.push(`Test summary parse failed but verdict is "${verdict}"`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Report consistency validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
}

// ─── Git Info ─────────────────────────────────────────────────────────────

function getGitInfo(): { branch: string; commit: string; parentCommit: string } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const parentCommit = execSync('git rev-parse HEAD~1', { encoding: 'utf-8' }).trim();
    return { branch, commit, parentCommit };
  } catch (error) {
    throw new Error(`Failed to get git info: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getChangedFiles(parentCommit: string): ChangedFiles {
  const output = execSync(`git diff --name-status ${parentCommit}..HEAD`, { encoding: 'utf-8' });

  const changed: ChangedFiles = { added: [], modified: [], deleted: [] };

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...pathParts] = line.split('\t');
    const path = pathParts.join('\t');
    switch (status?.[0]) {
      case 'A':
        changed.added.push(path);
        break;
      case 'M':
        changed.modified.push(path);
        break;
      case 'D':
        changed.deleted.push(path);
        break;
    }
  }

  return changed;
}

function getUncommittedFiles(): ChangedFiles {
  const output = execSync('git status --porcelain', { encoding: 'utf-8' });

  const changed: ChangedFiles = { added: [], modified: [], deleted: [] };

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const indexStatus = line[0];
    const workingStatus = line[1];
    const path = line.slice(3);

    if (indexStatus === 'A' || workingStatus === 'A') {
      changed.added.push(path);
    } else if (indexStatus === 'M' || workingStatus === 'M') {
      changed.modified.push(path);
    } else if (indexStatus === 'D' || workingStatus === 'D') {
      changed.deleted.push(path);
    } else if (indexStatus === '?' && workingStatus === '?') {
      changed.added.push(path); // untracked
    }
  }

  return changed;
}

// ─── File Naming ──────────────────────────────────────────────────────────

function findUniqueReportPath(dir: string, date: string, taskName: string): string {
  const baseName = `${date}-${taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  const candidate = join(dir, `${baseName}.md`);

  if (!existsSync(candidate)) {
    return candidate;
  }

  // Find next available suffix
  let suffix = 2;
  while (existsSync(join(dir, `${baseName}-${suffix}.md`))) {
    suffix++;
  }
  return join(dir, `${baseName}-${suffix}.md`);
}

// ─── Command Runner ───────────────────────────────────────────────────────

function runCommand(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: REPO_ROOT,
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// ─── Report Builder ───────────────────────────────────────────────────────

function buildReport(
  taskName: string,
  timestamp: string,
  gitInfo: { branch: string; commit: string; parentCommit: string },
  changedFiles: ChangedFiles,
  testSummary: TestSummary,
  lintSummary: LintSummary,
  verificationMatrix: VerificationMatrix[],
  verdict: Verdict,
  newIssues: VerificationIssue[],
  baselineIssues: VerificationIssue[],
  resolvedIssues: BaselineIssue[],
  checkResults: CheckResult[],
): string {
  const statusBadge = (status: string) => {
    switch (status) {
      case 'PASS':
        return '✅ PASS';
      case 'FAIL':
        return '❌ FAIL';
      case 'PASS_WITH_BASELINE':
        return '⚠️ PASS_WITH_BASELINE';
      case 'WARNING':
        return '⚠️ WARNING';
      case 'SKIPPED':
        return '⬜ SKIPPED';
      default:
        return status;
    }
  };

  const matrixRows = verificationMatrix.map(
    (m) => `| ${m.check} | ${statusBadge(m.status)} | ${m.current} | ${m.baseline} | ${m.new} | ${m.newErrors}+${m.newWarnings} | ${m.resolved} | ${m.blocks ? 'YES' : 'NO'} |`
  ).join('\n');

  const newIssuesSection = newIssues.length > 0
    ? newIssues.map((i) => `- **${i.file}${i.line ? `:${i.line}` : ''}** (${i.rule ?? 'N/A'}): ${i.message}`).join('\n')
    : 'None.';

  const baselineIssuesSection = baselineIssues.length > 0
    ? baselineIssues.map((i) => `- **${i.file}${i.line ? `:${i.line}` : ''}** (${i.rule ?? 'N/A'}): ${i.message}`).join('\n')
    : 'None.';

  const resolvedIssuesSection = resolvedIssues.length > 0
    ? resolvedIssues.map((i) => `- **${i.file}:${i.line}** (${i.rule}): ${i.message}`).join('\n')
    : 'None.';

  const addedFiles = changedFiles.added.length > 0
    ? changedFiles.added.map((f) => `- ${f}`).join('\n')
    : 'None.';
  const modifiedFiles = changedFiles.modified.length > 0
    ? changedFiles.modified.map((f) => `- ${f}`).join('\n')
    : 'None.';
  const deletedFiles = changedFiles.deleted.length > 0
    ? changedFiles.deleted.map((f) => `- ${f}`).join('\n')
    : 'None.';

  // Test summary parse warning
  const testSummarySection = testSummary.parseFailed
    ? `- ⚠️ **TEST SUMMARY PARSE FAILED** — Test output exists but could not be parsed. Treated as FAIL.`
    : `- **Test Files**: ${testSummary.filesPassed} passed / ${testSummary.filesTotal} total ${testSummary.filesFailed > 0 ? `(${testSummary.filesFailed} failed)` : ''}\n- **Tests**: ${testSummary.testsPassed} passed / ${testSummary.testsTotal} total ${testSummary.testsFailed > 0 ? `(${testSummary.testsFailed} failed)` : ''}\n- **Duration**: ${testSummary.duration}`;

  // Find full output sections
  const testOutput = checkResults.find(r => r.name === 'Test')?.stdout ?? '';
  const typecheckOutput = checkResults.find(r => r.name === 'TypeCheck')?.stdout ?? '';
  const lintOutput = checkResults.find(r => r.name === 'Lint')?.stdout ?? '';
  const buildOutput = checkResults.find(r => r.name === 'Build')?.stdout ?? '';

  return `# Verification Report — ${taskName}

## Verdict

**${verdict}**

${verdict === 'FAIL' ? '> ❌ Verification failed. New issues detected or parse failure.' : ''}
${verdict === 'PASS_WITH_BASELINE_ISSUES' ? '> ⚠️ No new issues, but baseline issues still exist.' : ''}
${verdict === 'PASS' ? '> ✅ All checks passed cleanly.' : ''}

## Verification Matrix

| Check | Status | Current | Baseline Matched | New | Errors+Warnings | Resolved | Blocks |
|-------|--------|---------|------------------|-----|-----------------|----------|--------|
${matrixRows}

## Test Summary Parse

${testSummarySection}

## New Issues

${newIssuesSection}

## Baseline Issues (Matched)

${baselineIssuesSection}

## Resolved Issues

${resolvedIssuesSection}

## Changed Files

### Added
${addedFiles}

### Modified
${modifiedFiles}

### Deleted
${deletedFiles}

## Metadata

- **Task**: ${taskName}
- **Generated At**: ${timestamp}
- **Branch**: ${gitInfo.branch}
- **Commit**: ${gitInfo.commit}
- **Parent Commit**: ${gitInfo.parentCommit}
- **Baseline Source Commit**: ${loadBaseline()?.source_commit ?? 'none'}
- **Baseline Path Format**: ${loadBaseline()?.path_format ?? 'none'}

## Detailed Outputs

### Test

<details>

\`\`\`
${testOutput.slice(-3000)}
\`\`\`

</details>

### TypeCheck

<details>

\`\`\`
${typecheckOutput.slice(-2000)}
\`\`\`

</details>

### Lint

<details>

\`\`\`
${lintOutput.slice(-3000)}
\`\`\`

</details>

### Build

<details>

\`\`\`
${buildOutput.slice(-3000)}
\`\`\`

</details>

---

*This report was auto-generated by scripts/generate-report.ts*
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Parse args
  let taskName = 'manual';
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task' && args[i + 1]) {
      taskName = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      taskName = args[i];
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();

  console.log('=== ContextOS Verification Report ===');
  console.log(`Task: ${taskName}`);
  console.log(`Date: ${timestamp}`);
  console.log('');

  // Load baseline
  const baseline = loadBaseline();
  if (baseline) {
    console.log(`Baseline loaded: ${baseline.known_issues?.lint?.length ?? 0} known lint issues`);

    // Validate baseline
    const validation = validateBaseline(baseline);
    if (!validation.valid) {
      console.error('BASELINE VALIDATION FAILED:');
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
    console.log(`Baseline validation: PASS (path_format: ${baseline.path_format})`);
  } else {
    console.log('No baseline.json found — all issues will be treated as new');
  }

  // Run checks
  const checkResults: CheckResult[] = [];

  console.log('\n→ Running: npm test...');
  const testResult = await runCommand('npm', ['test', '--', '--run']);
  checkResults.push({ name: 'Test', command: 'npm test -- --run', ...testResult });
  console.log(`  Exit code: ${testResult.exitCode}`);

  console.log('→ Running: typecheck...');
  const typecheckResult = await runCommand('npx', ['tsc', '--noEmit']);
  checkResults.push({ name: 'TypeCheck', command: 'npx tsc --noEmit', ...typecheckResult });
  console.log(`  Exit code: ${typecheckResult.exitCode}`);

  console.log('→ Running: lint...');
  const lintResult = await runCommand('npx', ['eslint', '--format', 'json', 'src', 'scripts', 'skills', 'electron']);
  checkResults.push({ name: 'Lint', command: 'npx eslint --format json', ...lintResult });
  console.log(`  Exit code: ${lintResult.exitCode}`);

  console.log('→ Running: build...');
  const buildResult = await runCommand('npm', ['run', 'build']);
  checkResults.push({ name: 'Build', command: 'npm run build', ...buildResult });
  console.log(`  Exit code: ${buildResult.exitCode}`);

  // Parse results
  const testSummary = extractTestSummary(testResult.stdout);
  if (testSummary.parseFailed) {
    console.error('\n⚠️  TEST SUMMARY PARSE FAILED');
    console.error('Test output exists but could not extract test counts.');
    console.error('This is treated as a blocking FAIL.');
  }

  const lintIssues = parseLintOutput(lintResult.stdout);
  const lintSummary: LintSummary = {
    errors: lintIssues.filter(i => i.severity === 'error').length,
    warnings: lintIssues.filter(i => i.severity === 'warning').length,
  };
  const typecheckIssues = parseTypeCheckOutput(typecheckResult.stdout);

  // Compare with baseline using unified identity function
  const { newIssues: newLintIssues, baselineIssues: baselineLintIssues, resolvedIssues } =
    compareIssues(lintIssues, baseline);

  const newTypeCheckIssues = typecheckIssues;
  const newTestFailed = testSummary.testsFailed > 0 || testSummary.filesFailed > 0;
  const buildFailed = buildResult.exitCode !== 0;

  // Compute verdict
  const verdict = computeVerdict({
    testFailed: newTestFailed,
    testSummaryParseFailed: testSummary.parseFailed,
    newTypeCheckErrors: newTypeCheckIssues.length,
    newLintErrors: newLintIssues.filter(i => i.severity === 'error').length,
    buildFailed,
    baselineLintMatched: baselineLintIssues.length,
    newWarnings: newLintIssues.filter(i => i.severity === 'warning').length,
    newBuildWarningBlocks: baseline?.new_build_warning_blocks ?? false,
  });

  // Build verification matrix with all 5 columns
  const verificationMatrix: VerificationMatrix[] = [];

  const newLintErrorCount = newLintIssues.filter(i => i.severity === 'error').length;
  const newLintWarningCount = newLintIssues.filter(i => i.severity === 'warning').length;

  // Tests
  const testStatus: VerificationMatrix['status'] = newTestFailed || testSummary.parseFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'Tests',
    status: testStatus,
    current: testSummary.testsTotal,
    baseline: 0,
    new: testSummary.testsFailed,
    newErrors: testSummary.testsFailed,
    newWarnings: 0,
    resolved: 0,
    blocks: true,
  });

  // TypeCheck
  const tcStatus: VerificationMatrix['status'] = newTypeCheckIssues.length > 0 ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'TypeCheck',
    status: tcStatus,
    current: newTypeCheckIssues.length,
    baseline: 0,
    new: newTypeCheckIssues.length,
    newErrors: newTypeCheckIssues.length,
    newWarnings: 0,
    resolved: 0,
    blocks: true,
  });

  // Lint
  const hasNewLintErrors = newLintErrorCount > 0;
  const lintStatus: VerificationMatrix['status'] = hasNewLintErrors
    ? 'FAIL'
    : baselineLintIssues.length > 0
      ? 'PASS_WITH_BASELINE'
      : 'PASS';
  verificationMatrix.push({
    check: 'Lint',
    status: lintStatus,
    current: lintIssues.length,
    baseline: baselineLintIssues.length,
    new: newLintIssues.length,
    newErrors: newLintErrorCount,
    newWarnings: newLintWarningCount,
    resolved: resolvedIssues.length,
    blocks: false,
  });

  // Build
  const buildStatus: VerificationMatrix['status'] = buildFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'Build',
    status: buildStatus,
    current: buildFailed ? 1 : 0,
    baseline: 0,
    new: buildFailed ? 1 : 0,
    newErrors: buildFailed ? 1 : 0,
    newWarnings: 0,
    resolved: 0,
    blocks: true,
  });

  // Validate consistency BEFORE building report
  try {
    validateReportConsistency(verdict, verificationMatrix, testSummary.parseFailed);
    console.log('\nVerdict consistency: PASS');
  } catch (error) {
    console.error('\n🚨 REPORT CONSISTENCY VIOLATION:');
    console.error(error instanceof Error ? error.message : String(error));
    // Write debug info but exit with failure
    console.error('\nVerdict:', verdict);
    console.error('Matrix:', JSON.stringify(verificationMatrix, null, 2));
    process.exit(1);
  }

  // Git info
  let gitInfo: { branch: string; commit: string; parentCommit: string };
  try {
    gitInfo = getGitInfo();
  } catch (error) {
    console.error('Failed to get git info:', error);
    process.exit(1);
  }

  let committedChanges: ChangedFiles;
  try {
    committedChanges = getChangedFiles(gitInfo.parentCommit);
  } catch {
    committedChanges = { added: [], modified: [], deleted: [] };
  }

  const uncommittedChanges = getUncommittedFiles();

  // Merge committed + uncommitted
  const allChangedFiles: ChangedFiles = {
    added: [...committedChanges.added, ...uncommittedChanges.added],
    modified: [...committedChanges.modified, ...uncommittedChanges.modified],
    deleted: [...committedChanges.deleted, ...uncommittedChanges.deleted],
  };

  // Build report
  const report = buildReport(
    taskName,
    timestamp,
    gitInfo,
    allChangedFiles,
    testSummary,
    lintSummary,
    verificationMatrix,
    verdict,
    newLintIssues,
    [...baselineLintIssues, ...newTypeCheckIssues],
    resolvedIssues,
    checkResults,
  );

  // Write report
  const reportDir = join(REPO_ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = findUniqueReportPath(reportDir, date, taskName);

  writeFileSync(reportPath, report, 'utf-8');

  const basename = reportPath.split(/[/\\]/).pop();
  console.log(`\n=== Report saved: docs/reports/${basename} ===`);
  console.log(`Verdict: ${verdict}`);
  console.log(`Current Lint Issues: ${lintIssues.length}`);
  console.log(`Baseline Matched: ${baselineLintIssues.length}`);
  console.log(`New Issues: ${newLintIssues.length}`);
  console.log(`Resolved Issues: ${resolvedIssues.length}`);

  // Exit code based on verdict
  process.exit(verdict === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  console.error('Error generating report:', error);
  process.exit(1);
});
