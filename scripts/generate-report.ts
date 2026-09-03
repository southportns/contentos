#!/usr/bin/env tsx
/**
 * P0.3.2.1 — Local Verification Report Generator
 *
 * Runs npm test, typecheck, lint, and build,
 * then generates a Markdown report for cloud review.
 *
 * Usage:
 *   npx tsx scripts/generate-report.ts [task-name]
 *
 * Example:
 *   npx tsx scripts/generate-report.ts p0.3.2.1
 *   npx tsx scripts/generate-report.ts "fix: typo aiyun"
 *
 * Output:
 *   docs/reports/YYYY-MM-DD-<task-name>.md
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function runCommand(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
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
      const _duration = Date.now() - start;
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function extractTestSummary(output: string): { passed: number; failed: number; files: number } {
  // Match: "Test Files  16 passed (16)" or "Test Files  1 failed | 15 passed (16)"
  // Match: "Tests  284 passed (284)"
  const filesMatch = output.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
  const testsMatch = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);

  return {
    passed: testsMatch ? parseInt(testsMatch[1], 10) : 0,
    failed: 0,
    files: filesMatch ? parseInt(filesMatch[2], 10) : 0,
  };
}

function extractLintSummary(output: string): { errors: number; warnings: number } {
  const match = output.match(/✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  if (match) {
    return { errors: parseInt(match[2], 10), warnings: parseInt(match[3], 10) };
  }
  return { errors: 0, warnings: 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const taskName = process.argv[2] ?? 'manual';
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const timestamp = new Date().toISOString();

  console.log('=== ContextOS Local Verification Report ===');
  console.log(`Task: ${taskName}`);
  console.log(`Date: ${timestamp}`);
  console.log('');

  const results: CheckResult[] = [];

  // 1. npm test
  console.log('→ Running: npm test...');
  const testResult = await runCommand('npm', ['test', '--', '--run']);
  results.push({
    name: 'Test',
    command: 'npm test -- --run',
    ...testResult,
    duration: 0,
  });
  console.log(`  Exit code: ${testResult.exitCode}`);

  // 2. typecheck
  console.log('→ Running: typecheck...');
  const typecheckResult = await runCommand('npx', ['tsc', '--noEmit']);
  results.push({
    name: 'TypeCheck',
    command: 'npx tsc --noEmit',
    ...typecheckResult,
    duration: 0,
  });
  console.log(`  Exit code: ${typecheckResult.exitCode}`);

  // 3. lint
  console.log('→ Running: lint...');
  const lintResult = await runCommand('npm', ['run', 'lint']);
  results.push({
    name: 'Lint',
    command: 'npm run lint',
    ...lintResult,
    duration: 0,
  });
  console.log(`  Exit code: ${lintResult.exitCode}`);

  // 4. build
  console.log('→ Running: build...');
  const buildResult = await runCommand('npm', ['run', 'build']);
  results.push({
    name: 'Build',
    command: 'npm run build',
    ...buildResult,
    duration: 0,
  });
  console.log(`  Exit code: ${buildResult.exitCode}`);

  // Generate report
  const reportDir = join(process.cwd(), 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });

  const reportFile = join(reportDir, `${date}-${taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`);

  const allPassed = results.every((r) => r.exitCode === 0);
  const testSummary = extractTestSummary(testResult.stdout);
  const lintSummary = extractLintSummary(lintResult.stdout);

  const report = `# Verification Report — ${taskName}

> Generated: ${timestamp}
> Branch: ${process.env.GIT_BRANCH ?? 'unknown'}
> Commit: ${process.env.GIT_COMMIT ?? 'unknown'}

## Summary

| Check | Result | Details |
|-------|--------|---------|
| **Test** | ${results[0].exitCode === 0 ? '✅ PASS' : '❌ FAIL'} | ${testSummary.passed} tests passed (${testSummary.files} files) |
| **TypeCheck** | ${results[1].exitCode === 0 ? '✅ PASS' : '❌ FAIL'} | ${results[1].exitCode === 0 ? 'No errors' : 'Has errors'} |
| **Lint** | ${results[2].exitCode === 0 ? '✅ PASS' : '❌ FAIL'} | ${lintSummary.errors} errors, ${lintSummary.warnings} warnings |
| **Build** | ${results[3].exitCode === 0 ? '✅ PASS' : '❌ FAIL'} | ${results[3].exitCode === 0 ? 'Compiled successfully' : 'Build failed'} |

**Overall: ${allPassed ? '✅ ALL PASSED' : '❌ HAS FAILURES'}**

## Detailed Outputs

### Test

<details>

\`\`\`
${results[0].stdout.slice(-3000)}
\`\`\`

</details>

### TypeCheck

<details>

\`\`\`
${results[1].stdout.slice(-2000)}
\`\`\`

</details>

### Lint

<details>

\`\`\`
${results[2].stdout.slice(-3000)}
\`\`\`

</details>

### Build

<details>

\`\`\`
${results[3].stdout.slice(-3000)}
\`\`\`

</details>

---

*This report was auto-generated by scripts/generate-report.ts*
`;

  writeFileSync(reportFile, report, 'utf-8');
  console.log('');
  console.log(`=== Report saved to: docs/reports/${date}-${taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md ===`);
  console.log(`Overall: ${allPassed ? 'ALL PASSED' : 'HAS FAILURES'}`);

  // Exit with non-zero if any check failed
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Error generating report:', error);
  process.exit(1);
});
