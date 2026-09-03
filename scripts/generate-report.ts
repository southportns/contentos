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
 */

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
  baseline: number;
  new: number;
  blocks: boolean;
}

// ─── Issue Key ────────────────────────────────────────────────────────────

function getIssueKey(issue: VerificationIssue): string {
  const file = issue.file ?? '';
  const rule = issue.rule ?? '';
  // Normalize message: truncate, collapse whitespace, remove trailing period
  const message = issue.message.slice(0, 100).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return `${issue.tool}::${file}::${rule}::${message}`;
}

function getBaselineKey(issue: BaselineIssue): string {
  const file = issue.file;
  const rule = issue.rule;
  const message = issue.message.slice(0, 100).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return `lint::${file}::${rule}::${message}`;
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
        // Use only the first line of the message for comparison (before detailed explanation)
        const firstLine = msg.message.split('\n')[0].trim();
        issues.push({
          tool: 'lint',
          file: fileResult.filePath,
          line: msg.line,
          rule: msg.ruleId,
          message: firstLine,
          severity: msg.severity === 2 ? 'error' : 'warning',
        });
      }
    }

    return issues;
  } catch {
    // Fallback: parse human-readable format (for older ESLint versions)
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
      currentFile = fileMatch[1];
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
        file: match[1],
        line: parseInt(match[2], 10),
        rule: match[4],
        message: match[5],
      });
    }
  }

  return issues;
}

function extractTestSummary(output: string): TestSummary {
  // Strip ANSI color codes (vitest outputs colors even when piped)
  const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

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

  return {
    filesTotal,
    filesPassed,
    filesFailed,
    testsTotal,
    testsPassed,
    testsFailed,
    duration: durationMatch?.[1] ?? 'unknown',
  };
}

// ─── Baseline ──────────────────────────────────────────────────────────────

function loadBaseline(): Baseline | null {
  const baselinePath = join(process.cwd(), 'docs', 'reports', 'baseline.json');
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

// ─── Verdict ──────────────────────────────────────────────────────────────

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
  // Any blocking issue → FAIL
  if (input.testFailed) return 'FAIL';
  if (input.newTypeCheckErrors > 0) return 'FAIL';
  if (input.newLintErrors > 0) return 'FAIL';
  if (input.buildFailed) return 'FAIL';

  // Otherwise if baseline issues exist → PASS_WITH_BASELINE_ISSUES
  if (input.baselineLintErrors > 0) return 'PASS_WITH_BASELINE_ISSUES';

  // Otherwise → PASS
  return 'PASS';
}

// ─── Git Info ─────────────────────────────────────────────────────────────

function getGitInfo(): { branch: string; commit: string; parentCommit: string } {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const parentCommit = execSync('git rev-parse HEAD~1', { encoding: 'utf-8' }).trim();
  return { branch, commit, parentCommit };
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

// (execSync used directly for git commands)

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
      cwd: process.cwd(),
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
        return 'SKIPPED';
      default:
        return status;
    }
  };

  const matrixRows = verificationMatrix.map(
    (m) => `| ${m.check} | ${statusBadge(m.status)} | ${m.baseline} | ${m.new} | ${m.blocks ? 'YES' : 'NO'} |`
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

  // Find full output sections
  const testOutput = checkResults.find(r => r.name === 'Test')?.stdout ?? '';
  const typecheckOutput = checkResults.find(r => r.name === 'TypeCheck')?.stdout ?? '';
  const lintOutput = checkResults.find(r => r.name === 'Lint')?.stdout ?? '';
  const buildOutput = checkResults.find(r => r.name === 'Build')?.stdout ?? '';

  return `# Verification Report — ${taskName}

## Verdict

**${verdict}**

## Verification Matrix

| Check | Status | Baseline | New | Blocks |
|-------|--------|----------|-----|--------|
${matrixRows}

## Test Results

- **Test Files**: ${testSummary.filesPassed} passed / ${testSummary.filesTotal} total ${testSummary.filesFailed > 0 ? `(${testSummary.filesFailed} failed)` : ''}
- **Tests**: ${testSummary.testsPassed} passed / ${testSummary.testsTotal} total ${testSummary.testsFailed > 0 ? `(${testSummary.testsFailed} failed)` : ''}
- **Duration**: ${testSummary.duration}

## New Issues

${newIssuesSection}

## Baseline Issues

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
  // Use JSON format for reliable parsing
  const lintResult = await runCommand('npx', ['eslint', '--format', 'json', 'src', 'scripts', 'skills', 'electron']);
  checkResults.push({ name: 'Lint', command: 'npx eslint --format json', ...lintResult });
  console.log(`  Exit code: ${lintResult.exitCode}`);

  console.log('→ Running: build...');
  const buildResult = await runCommand('npm', ['run', 'build']);
  checkResults.push({ name: 'Build', command: 'npm run build', ...buildResult });
  console.log(`  Exit code: ${buildResult.exitCode}`);

  // Parse results
  const testSummary = extractTestSummary(testResult.stdout);
  const lintIssues = parseLintOutput(lintResult.stdout);
  const lintSummary: LintSummary = {
    errors: lintIssues.filter(i => i.severity === 'error').length,
    warnings: lintIssues.filter(i => i.severity === 'warning').length,
  };
  const typecheckIssues = parseTypeCheckOutput(typecheckResult.stdout);

  // Compare with baseline
  const { newIssues: newLintIssues, baselineIssues: baselineLintIssues, resolvedIssues } =
    compareLintIssues(lintIssues, baseline);

  const newTypeCheckIssues = typecheckIssues; // No typecheck baseline support yet
  const newTestFailed = testSummary.testsFailed > 0 || testSummary.filesFailed > 0;
  const buildFailed = buildResult.exitCode !== 0;

  // Compute verdict
  const verdict = computeVerdict({
    testFailed: newTestFailed,
    newTypeCheckErrors: newTypeCheckIssues.length,
    newLintErrors: newLintIssues.filter(i => i.severity === 'error').length,
    buildFailed,
    baselineLintErrors: baselineLintIssues.length,
    newWarnings: newLintIssues.filter(i => i.severity === 'warning').length,
    newBuildWarningBlocks: baseline?.new_build_warning_blocks ?? false,
  });

  // Build verification matrix
  const verificationMatrix: VerificationMatrix[] = [];

  // Tests
  const testStatus: VerificationMatrix['status'] = newTestFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'Tests',
    status: testStatus,
    baseline: 0,
    new: testSummary.testsFailed,
    blocks: true,
  });

  // TypeCheck
  const tcStatus: VerificationMatrix['status'] = newTypeCheckIssues.length > 0 ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'TypeCheck',
    status: tcStatus,
    baseline: 0,
    new: newTypeCheckIssues.length,
    blocks: true,
  });

  // Lint
  const hasNewLintErrors = newLintIssues.filter(i => i.severity === 'error').length > 0;
  const lintStatus: VerificationMatrix['status'] = hasNewLintErrors
    ? 'FAIL'
    : baselineLintIssues.length > 0
      ? 'PASS_WITH_BASELINE'
      : 'PASS';
  verificationMatrix.push({
    check: 'Lint',
    status: lintStatus,
    baseline: baselineLintIssues.length,
    new: newLintIssues.length,
    blocks: false,
  });

  // Build
  const buildStatus: VerificationMatrix['status'] = buildFailed ? 'FAIL' : 'PASS';
  verificationMatrix.push({
    check: 'Build',
    status: buildStatus,
    baseline: 0,
    new: 0,
    blocks: true,
  });

  // Git info
  const gitInfo = getGitInfo();
  const committedChanges = getChangedFiles(gitInfo.parentCommit);
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
  const reportDir = join(process.cwd(), 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = findUniqueReportPath(reportDir, date, taskName);

  writeFileSync(reportPath, report, 'utf-8');

  const basename = reportPath.split(/[/\\]/).pop();
  console.log(`\n=== Report saved: docs/reports/${basename} ===`);
  console.log(`Verdict: ${verdict}`);
  console.log(`New Issues: ${newLintIssues.length}`);
  console.log(`Baseline Issues: ${baselineLintIssues.length}`);
  console.log(`Resolved Issues: ${resolvedIssues.length}`);

  // Exit code based on verdict
  process.exit(verdict === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  console.error('Error generating report:', error);
  process.exit(1);
});
