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
  duplicates: number;
  blocks: boolean;
}

// ─── Path Normalization ───────────────────────────────────────────────────

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

// ─── Message Normalization ────────────────────────────────────────────────

function normalizeIssueMessage(message: string): string {
  return message
    .replace(ANSI_ESCAPE_REGEX, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]$/, '');
}

// ─── Issue Identity ──────────────────────────────────────────────────────

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
  warnings: string[];
  duplicateBaselineIssues: BaselineIssue[];
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
    if (seen.has(key)) {
      duplicates.push(issue);
    } else {
      seen.set(key, issue);
    }
  }
  return {
    unique: Array.from(seen.values()),
    duplicates,
  };
}

function validateBaseline(baseline: Baseline): BaselineValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!baseline.version) errors.push('Missing baseline.version');
  if (!baseline.source_commit) errors.push('Missing baseline.source_commit');
  if (!baseline.path_format) {
    errors.push('Missing baseline.path_format');
  } else if (baseline.path_format !== 'repo-relative-posix') {
    errors.push(`Invalid baseline.path_format: "${baseline.path_format}" (expected "repo-relative-posix")`);
  }
  const lintIssues = baseline.known_issues?.lint ?? [];
  for (let i = 0; i < lintIssues.length; i++) {
    const issue = lintIssues[i];
    const file = issue.file;
    if (ABSOLUTE_WINDOWS_PATH_REGEX.test(file)) {
      errors.push(`Lint issue [${i}] has absolute Windows path: "${file}"`);
    } else if (ABSOLUTE_UNIX_PATH_REGEX.test(file)) {
      errors.push(`Lint issue [${i}] has absolute Unix path: "${file}"`);
    }
    if (!issue.rule) errors.push(`Lint issue [${i}] missing rule`);
    if (!issue.message) errors.push(`Lint issue [${i}] missing message`);
  }
  const dedup = deduplicateBaselineIssues(lintIssues);
  if (dedup.duplicates.length > 0) {
    warnings.push(`Baseline has ${dedup.duplicates.length} duplicate entries (same identity)`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    duplicateBaselineIssues: dedup.duplicates,
  };
}

// ─── Parsers ──────────────────────────────────────────────────────────────

function parseLintOutput(output: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  try {
    const jsonData = JSON.parse(output) as Array<{
      filePath: string;
      messages: Array<{ ruleId: string | null; severity: number; message: string; line: number; column: number }>;
      suppressedMessages?: Array<{ ruleId: string | null; severity: number; message: string; line: number; column: number }>;
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
  } catch {}
  const lines = output.split('\n');
  let currentFile: string | undefined;
  for (const line of lines) {
    if (line.match(/:\d+:\d+$/) && !line.includes(' ')) continue;
    const fileMatch = line.match(/^([A-Za-z]:\\[^\s]+|[^\s]+)$/);
    if (fileMatch && !line.includes(' ') && !line.match(/^\s+\d+:\d+/)) {
      currentFile = normalizeRepoPath(fileMatch[1]);
      continue;
    }
    const issueMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+)$/);
    if (issueMatch && currentFile) {
      const lineNum = parseInt(issueMatch[1], 10);
      const severity = issueMatch[3] as 'error' | 'warning';
      const fullMessage = issueMatch[4];
      let rule: string | undefined;
      const ruleMatch = fullMessage.match(/\s+([a-z@][\w\/-]+)$/);
      if (ruleMatch) rule = ruleMatch[1];
      issues.push({ tool: 'lint', file: currentFile, line: lineNum, rule, message: fullMessage, severity });
    }
  }
  return issues;
}

function parseTypeCheckOutput(output: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
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
  return { filesTotal, filesPassed, filesFailed, testsTotal, testsPassed, testsFailed, duration: durationMatch?.[1] ?? 'unknown', parseFailed };
}

// ─── Baseline ──────────────────────────────────────────────────────────────

function loadBaseline(): Baseline | null {
  const baselinePath = join(REPO_ROOT, 'docs', 'reports', 'baseline.json');
  if (!existsSync(baselinePath)) return null;
  try {
    const content = readFileSync(baselinePath, 'utf-8');
    return JSON.parse(content) as Baseline;
  } catch { return null; }
}

// ─── Comparison ────────────────────────────────────────────────────────────

interface IssueComparisonResult {
  newIssues: VerificationIssue[];
  baselineIssues: VerificationIssue[];
  resolvedIssues: BaselineIssue[];
  duplicateCurrentIssues: VerificationIssue[];
  duplicateBaselineIssues: BaselineIssue[];
  uniqueBaselineCount: number;
}

function compareIssues(current: VerificationIssue[], baseline: Baseline | null): IssueComparisonResult {
  const rawBaselineIssues: BaselineIssue[] = baseline?.known_issues?.lint ?? [];
  const dedupedBaseline = deduplicateBaselineIssues(rawBaselineIssues);
  const uniqueBaseline = dedupedBaseline.unique;
  const baselineKeys = new Map<string, BaselineIssue>();
  for (const b of uniqueBaseline) {
    const key = getIssueKey({ tool: 'lint', file: b.file, rule: b.rule, message: b.message });
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
    const key = getIssueKey({ tool: 'lint', file: bIssue.file, rule: bIssue.rule, message: bIssue.message });
    if (!currentByKey.has(key)) resolvedIssues.push(bIssue);
  }
  return {
    newIssues, baselineIssues: matchedBaseline, resolvedIssues,
    duplicateCurrentIssues, duplicateBaselineIssues: dedupedBaseline.duplicates,
    uniqueBaselineCount: uniqueBaseline.length,
  };
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

function computeVerdict(input: VerdictInput): Verdict {
  if (input.testFailed) return 'FAIL';
  if (input.testSummaryParseFailed) return 'FAIL';
  if (input.newTypeCheckErrors > 0) return 'FAIL';
  if (input.newLintErrors > 0) return 'FAIL';
  if (input.buildFailed) return 'FAIL';
  if (input.baselineLintMatched > 0) return 'PASS_WITH_BASELINE_ISSUES';
  return 'PASS';
}

interface ConsistencyInput {
  verdict: Verdict;
  matrix: VerificationMatrix[];
  testSummaryParseFailed: boolean;
  baselineMatchedCount: number;
  baselineUniqueCount: number;
}

function validateReportConsistency(input: ConsistencyInput): void {
  const { verdict, matrix, testSummaryParseFailed, baselineMatchedCount, baselineUniqueCount } = input;
  const errors: string[] = [];
  const blockingFailures: string[] = [];
  for (const m of matrix) {
    if (m.blocks && m.status === 'FAIL') blockingFailures.push(m.check);
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
  if (baselineMatchedCount > baselineUniqueCount) {
    errors.push(
      `Baseline Matched (${baselineMatchedCount}) exceeds Baseline Unique (${baselineUniqueCount}). ` +
      `This indicates a duplicate matching bug.`
    );
  }
  if (errors.length > 0) {
    throw new Error(`Report consistency validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
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
      case 'A': changed.added.push(path); break;
      case 'M': changed.modified.push(path); break;
      case 'D': changed.deleted.push(path); break;
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
    if (indexStatus === 'A' || workingStatus === 'A') { changed.added.push(path); }
    else if (indexStatus === 'M' || workingStatus === 'M') { changed.modified.push(path); }
    else if (indexStatus === 'D' || workingStatus === 'D') { changed.deleted.push(path); }
    else if (indexStatus === '?' && workingStatus === '?') { changed.added.push(path); }
  }
  return changed;
}

// ─── File Naming ──────────────────────────────────────────────────────────

function findUniqueReportPath(dir: string, date: string, taskName: string): string {
  const baseName = `${date}-${taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  const candidate = join(dir, `${baseName}.md`);
  if (!existsSync(candidate)) return candidate;
  let suffix = 2;
  while (existsSync(join(dir, `${baseName}-${suffix}.md`))) suffix++;
  return join(dir, `${baseName}-${suffix}.md`);
}

// ─── Command Runner ───────────────────────────────────────────────────────

function runCommand(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd: REPO_ROOT, shell: true, env: { ...process.env } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    proc.on('close', (code: number) => { resolve({ exitCode: code ?? 1, stdout, stderr }); });
  });
}

// ─── Report Builder ───────────────────────────────────────────────────────

function buildReport(
  taskName: string, timestamp: string,
  gitInfo: { branch: string; commit: string; parentCommit: string },
  changedFiles: ChangedFiles, testSummary: TestSummary, lintSummary: LintSummary,
  verificationMatrix: VerificationMatrix[], verdict: Verdict,
  newIssues: VerificationIssue[], baselineIssues: VerificationIssue[],
  resolvedIssues: BaselineIssue[], duplicateCurrentIssues: VerificationIssue[],
  duplicateBaselineIssues: BaselineIssue[], uniqueBaselineCount: number,
  checkResults: CheckResult[],
): string {
  const statusBadge = (status: string) => {
    switch (status) {
      case 'PASS': return '✅ PASS';
      case 'FAIL': return '❌ FAIL';
      case 'PASS_WITH_BASELINE': return '⚠️ PASS_WITH_BASELINE';
      case 'WARNING': return '⚠️ WARNING';
      case 'SKIPPED': return '⬜ SKIPPED';
      default: return status;
    }
  };
  const matrixRows = verificationMatrix.map(
    (m) => `| ${m.check} | ${statusBadge(m.status)} | ${m.current} | ${m.baseline} | ${m.new} | ${m.newErrors}+${m.newWarnings} | ${m.resolved} | ${m.duplicates} | ${m.blocks ? 'YES' : 'NO'} |`
  ).join('\n');
  const newIssuesSection = newIssues.length > 0
    ? newIssues.map((i) => `- **${i.file}${i.line ? `:${i.line}` : ''}** (${i.rule ?? 'N/A'}): ${i.message}`).join('\n') : 'None.';
  const baselineIssuesSection = baselineIssues.length > 0
    ? baselineIssues.map((i) => `- **${i.file}${i.line ? `:${i.line}` : ''}** (${i.rule ?? 'N/A'}): ${i.message}`).join('\n') : 'None.';
  const resolvedIssuesSection = resolvedIssues.length > 0
    ? resolvedIssues.map((i) => `- **${i.file}:${i.line}** (${i.rule}): ${i.message}`).join('\n') : 'None.';
  const addedFiles = changedFiles.added.length > 0 ? changedFiles.added.map((f) => `- ${f}`).join('\n') : 'None.';
  const modifiedFiles = changedFiles.modified.length > 0 ? changedFiles.modified.map((f) => `- ${f}`).join('\n') : 'None.';
  const deletedFiles = changedFiles.deleted.length > 0 ? changedFiles.deleted.map((f) => `- ${f}`).join('\n') : 'None.';
  const testSummarySection = testSummary.parseFailed
    ? `- ⚠️ **TEST SUMMARY PARSE FAILED** — Test output exists but could not be parsed. Treated as FAIL.`
    : `- **Test Files**: ${testSummary.filesPassed} passed / ${testSummary.filesTotal} total ${testSummary.filesFailed > 0 ? `(${testSummary.filesFailed} failed)` : ''}\n- **Tests**: ${testSummary.testsPassed} passed / ${testSummary.testsTotal} total ${testSummary.testsFailed > 0 ? `(${testSummary.testsFailed} failed)` : ''}\n- **Duration**: ${testSummary.duration}`;
  const testOutput = checkResults.find(r => r.name === 'Test')?.stdout ?? '';
  const typecheckOutput = checkResults.find(r => r.name === 'TypeCheck')?.stdout ?? '';
  const lintOutput = checkResults.find(r => r.name === 'Lint')?.stdout ?? '';
  const buildOutput = checkResults.find(r => r.name === 'Build')?.stdout ?? '';
  return `# Verification Report — ${taskName}\n\n## Verdict\n\n**${verdict}**\n\n${verdict === 'FAIL' ? '> ❌ Verification failed. New issues detected or parse failure.' : ''}\n${verdict === 'PASS_WITH_BASELINE_ISSUES' ? '> ⚠️ No new issues, but baseline issues still exist.' : ''}\n${verdict === 'PASS' ? '> ✅ All checks passed cleanly.' : ''}\n\n## Verification Matrix\n\n| Check | Status | Current | Baseline Matched | New | Errors+Warnings | Resolved | Duplicates | Blocks |\n|-------|--------|---------|------------------|-----|-----------------|----------|------------|--------|\n${matrixRows}\n\n## Test Summary Parse\n\n${testSummarySection}\n\n## New Issues\n\n${newIssuesSection}\n\n## Baseline Issues (Matched)\n\n${baselineIssuesSection}\n\n## Resolved Issues\n\n${resolvedIssuesSection}\n\n## Duplicate Current Issues (INFO — not new, not blocking)\n\n${duplicateCurrentIssues.length > 0 ? duplicateCurrentIssues.map((i) => `- **${i.file}${i.line ? `:${i.line}` : ''}** (${i.rule ?? 'N/A'}): ${i.message}`).join('\n') : 'None.'}\n\n## Duplicate Baseline Entries (INFO — baseline has duplicate identities)\n\n${duplicateBaselineIssues.length > 0 ? duplicateBaselineIssues.map((i) => `- **${i.file}:${i.line}** (${i.rule}): ${i.message}`).join('\n') : 'None.'}\n\n## Baseline Stats\n\n- **Baseline Raw Count**: ${uniqueBaselineCount + duplicateBaselineIssues.length}\n- **Baseline Unique Count**: ${uniqueBaselineCount}\n- **Baseline Duplicate Entries**: ${duplicateBaselineIssues.length}\n- **Baseline Matched (unique)**: ${baselineIssues.length}\n- **Baseline Resolved**: ${resolvedIssues.length}\n\n## Changed Files\n\n### Added\n${addedFiles}\n\n### Modified\n${modifiedFiles}\n\n### Deleted\n${deletedFiles}\n\n## Metadata\n\n- **Task**: ${taskName}\n- **Generated At**: ${timestamp}\n- **Branch**: ${gitInfo.branch}\n- **Commit**: ${gitInfo.commit}\n- **Parent Commit**: ${gitInfo.parentCommit}\n- **Baseline Source Commit**: ${loadBaseline()?.source_commit ?? 'none'}\n- **Baseline Path Format**: ${loadBaseline()?.path_format ?? 'none'}\n\n## Detailed Outputs\n\n### Test\n\n<details>\n\n\`\`\`\n${testOutput.slice(-3000)}
\`\`\`\n\n</details>\n\n### TypeCheck\n\n<details>\n\n\`\`\`\n${typecheckOutput.slice(-2000)}
\`\`\`\n\n</details>\n\n### Lint\n\n<details>\n\n\`\`\`\n${lintOutput.slice(-3000)}
\`\`\`\n\n</details>\n\n### Build\n\n<details>\n\n\`\`\`\n${buildOutput.slice(-3000)}
\`\`\`\n\n</details>\n\n---\n\n*This report was auto-generated by scripts/generate-report.ts*\n`;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  let taskName = 'manual';
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task' && args[i + 1]) { taskName = args[i + 1]; i++; }
    else if (!args[i].startsWith('--')) { taskName = args[i]; }
  }
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();
  console.log('=== ContextOS Verification Report ===');
  console.log(`Task: ${taskName}`);
  console.log(`Date: ${timestamp}`);
  console.log('');
  const baseline = loadBaseline();
  if (baseline) {
    console.log(`Baseline loaded: ${baseline.known_issues?.lint?.length ?? 0} known lint issues`);
    const validation = validateBaseline(baseline);
    if (!validation.valid) {
      console.error('BASELINE VALIDATION FAILED:');
      for (const error of validation.errors) console.error(`  - ${error}`);
      process.exit(1);
    }
    console.log(`Baseline validation: PASS (path_format: ${baseline.path_format})`);
    if (validation.warnings.length > 0) {
      console.log('Baseline warnings:');
      for (const warning of validation.warnings) console.log(`  ⚠️ ${warning}`);
    }
  } else {
    console.log('No baseline.json found — all issues will be treated as new');
  }
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
  const comparison = compareIssues(lintIssues, baseline);
  const { newIssues: newLintIssues, baselineIssues: baselineLintIssues, resolvedIssues, duplicateCurrentIssues, duplicateBaselineIssues, uniqueBaselineCount } = comparison;
  const newTypeCheckIssues = typecheckIssues;
  const newTestFailed = testSummary.testsFailed > 0 || testSummary.filesFailed > 0;
  const buildFailed = buildResult.exitCode !== 0;
  const verdict = computeVerdict({
    testFailed: newTestFailed, testSummaryParseFailed: testSummary.parseFailed,
    newTypeCheckErrors: newTypeCheckIssues.length,
    newLintErrors: newLintIssues.filter(i => i.severity === 'error').length,
    buildFailed, baselineLintMatched: baselineLintIssues.length,
    newWarnings: newLintIssues.filter(i => i.severity === 'warning').length,
    newBuildWarningBlocks: baseline?.new_build_warning_blocks ?? false,
  });
  if (duplicateCurrentIssues.length > 0) console.log(`\n[DEDUP] Duplicate Current Issues: ${duplicateCurrentIssues.length} (not counted as new)`);
  if (duplicateBaselineIssues.length > 0) console.log(`[DEDUP] Duplicate Baseline Entries: ${duplicateBaselineIssues.length} (warned, not counted)`);
  const verificationMatrix: VerificationMatrix[] = [];
  const newLintErrorCount = newLintIssues.filter(i => i.severity === 'error').length;
  const newLintWarningCount = newLintIssues.filter(i => i.severity === 'warning').length;
  const testStatus: VerificationMatrix['status'] = newTestFailed || testSummary.parseFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({ check: 'Tests', status: testStatus, current: testSummary.testsTotal, baseline: 0, new: testSummary.testsFailed, newErrors: testSummary.testsFailed, newWarnings: 0, resolved: 0, blocks: true });
  const tcStatus: VerificationMatrix['status'] = newTypeCheckIssues.length > 0 ? 'FAIL' : 'PASS';
  verificationMatrix.push({ check: 'TypeCheck', status: tcStatus, current: newTypeCheckIssues.length, baseline: 0, new: newTypeCheckIssues.length, newErrors: newTypeCheckIssues.length, newWarnings: 0, resolved: 0, blocks: true });
  const hasNewLintErrors = newLintErrorCount > 0;
  const lintStatus: VerificationMatrix['status'] = hasNewLintErrors ? 'FAIL' : baselineLintIssues.length > 0 ? 'PASS_WITH_BASELINE' : 'PASS';
  verificationMatrix.push({ check: 'Lint', status: lintStatus, current: lintIssues.length, baseline: baselineLintIssues.length, new: newLintIssues.length, newErrors: newLintErrorCount, newWarnings: newLintWarningCount, resolved: resolvedIssues.length, duplicates: duplicateCurrentIssues.length, blocks: false });
  const buildStatus: VerificationMatrix['status'] = buildFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({ check: 'Build', status: buildStatus, current: buildFailed ? 1 : 0, baseline: 0, new: buildFailed ? 1 : 0, newErrors: buildFailed ? 1 : 0, newWarnings: 0, resolved: 0, blocks: true });
  try {
    validateReportConsistency({ verdict, matrix: verificationMatrix, testSummaryParseFailed: testSummary.parseFailed, baselineMatchedCount: baselineLintIssues.length, baselineUniqueCount: uniqueBaselineCount });
    console.log('\nVerdict consistency: PASS');
  } catch (error) {
    console.error('\n🚨 REPORT CONSISTENCY VIOLATION:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nVerdict:', verdict);
    console.error('Matrix:', JSON.stringify(verificationMatrix, null, 2));
    process.exit(1);
  }
  let gitInfo: { branch: string; commit: string; parentCommit: string };
  try { gitInfo = getGitInfo(); } catch (error) { console.error('Failed to get git info:', error); process.exit(1); }
  let committedChanges: ChangedFiles;
  try { committedChanges = getChangedFiles(gitInfo.parentCommit); } catch { committedChanges = { added: [], modified: [], deleted: [] }; }
  const uncommittedChanges = getUncommittedFiles();
  const allChangedFiles: ChangedFiles = {
    added: [...committedChanges.added, ...uncommittedChanges.added],
    modified: [...committedChanges.modified, ...uncommittedChanges.modified],
    deleted: [...committedChanges.deleted, ...uncommittedChanges.deleted],
  };
  const report = buildReport(
    taskName, timestamp, gitInfo, allChangedFiles, testSummary, lintSummary,
    verificationMatrix, verdict, newLintIssues,
    [...baselineLintIssues, ...newTypeCheckIssues], resolvedIssues,
    duplicateCurrentIssues, duplicateBaselineIssues, uniqueBaselineCount, checkResults
  );
  const reportDir = join(REPO_ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = findUniqueReportPath(reportDir, date, taskName);
  writeFileSync(reportPath, report, 'utf-8');
  const basename = reportPath.split(/[/\]/).pop();
  console.log(`\n=== Report saved: docs/reports/${basename} ===`);
  console.log(`Verdict: ${verdict}`);
  console.log(`Current Lint Issues (raw): ${lintIssues.length}`);
  console.log(`Current Lint Issues (unique): ${newLintIssues.length + baselineLintIssues.length}`);
  console.log(`Baseline Unique: ${uniqueBaselineCount}`);
  console.log(`Baseline Matched: ${baselineLintIssues.length}`);
  console.log(`New Issues: ${newLintIssues.length}`);
  console.log(`Duplicate Current: ${duplicateCurrentIssues.length}`);
  console.log(`Duplicate Baseline: ${duplicateBaselineIssues.length}`);
  console.log(`Resolved Issues: ${resolvedIssues.length}`);
  process.exit(verdict === 'FAIL' ? 1 : 0);
}

main().catch((error) => { console.error('Error generating report:', error); process.exit(1); });
