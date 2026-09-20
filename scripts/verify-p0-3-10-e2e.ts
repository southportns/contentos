#!/usr/bin/env tsx
/**
 * P0.3.10 — Content OS Full Pipeline E2E Acceptance Verification (v3)
 *
 * Real database integration tests using an isolated temporary SQLite database.
 * Verifies the DB-integrity subset (TEST E, L, M, N, O, P, Q) of the P0.3.10
 * acceptance matrix (TEST A–S). UI/WorkflowState tests are covered by the
 * unit/vitest suites (see COVERAGE_MAP below).
 *
 * v3 changes:
 *   - P_RB: Mid-transaction rollback via SQLite trigger (UserContentArchive.insert → RAISE ABORT)
 *   - Q11: Real approvalStatus comparison (Before/After reload, must be 'approved' unchanged)
 *   - Removed all tautological assertions (literal `true`)
 *   - Q6/Q7 now verify actual GET reload return values
 *   - N2 now genuinely verifies humanizationData in archive
 *   - Added Humanization-POS (non-null result persisted to archive)
 *
 * Flow:
 *   1. Create isolated temp SQLite DB
 *   2. Push schema via `prisma db push --url`
 *   3. Run integration checks (TEST E, L, M, N, O, P, Q)
 *   4. Cleanup temp DB
 *
 * COVERAGE_MAP: which acceptance tests are verified HERE (real DB) vs. elsewhere.
 */

import { existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Configuration ────────────────────────────────────────────────────────

const PRISMA_SCHEMA_PATH = join(process.cwd(), 'prisma', 'schema.prisma');

// ─── Acceptance Coverage Map ─────────────────────────────────────────────
/*
 * P0.3.10 TEST A–S:
 *   TEST A (Topic UI state)           → vitest: use-workflow.test.ts
 *   TEST B (Angle UI state)           → vitest: use-workflow.test.ts
 *   TEST C (Evaluation display)       → vitest: evaluation tests
 *   TEST D (Refine UI/enhancements)   → vitest: change-review.test.ts
 *   TEST E (Strategy Approval Gate)   → THIS SCRIPT: E1–E3b (real DB)
 *   TEST F (Strategy edit/approve)    → vitest: strategy-approval.test.ts
 *   TEST G (Writing API gate)         → vitest: server-approval-gate.test.ts
 *   TEST H (Writing output)           → vitest: approve-reject-api.test.ts
 *   TEST I (Refine API flow)          → vitest: refine tests
 *   TEST J (Evaluation API flow)      → vitest: evaluation tests
 *   TEST K (Humanization API flow)    → vitest: humanization-workflow.test.ts
 *   TEST L (Persistence entities)     → THIS SCRIPT: L0–L9, L_HUM_POS (real DB)
 *   TEST M (Draft versioning)        → THIS SCRIPT: M1–M7 (real DB)
 *   TEST N (Persistence metadata)     → THIS SCRIPT: N1–N11 (real DB)
 *   TEST O (Approval persistence)    → THIS SCRIPT: O1–O6 (real DB)
 *   TEST P (Transaction rollback)    → THIS SCRIPT: P1–P4, P_RB (real DB)
 *   TEST Q (Project reload)          → THIS SCRIPT: Q1–Q11 (real DB)
 *   TEST R (Final output source)     → vitest + code review
 *   TEST S (End-to-end UI flow)      → manual / Playwright (not in scope)
 *
 * Legend:
 *   "THIS SCRIPT" = real SQLite DB, real Prisma, real API route handlers
 *   "vitest"      = existing unit/integration suites (mock-based or in-memory)
 *   "manual"      = requires human interaction
 */

// ─── Test Results ─────────────────────────────────────────────────────────

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

const results: TestResult[] = [];

function addResult(
  id: string,
  name: string,
  passed: boolean,
  message: string,
  details?: string,
) {
  results.push({ id, name, passed, message, details });
  const icon = passed ? '✅' : '❌';
  const extra = details ? ` — ${details}` : '';
  console.log(`  ${icon} [${id}] ${name}: ${message}${extra}`);
}

function sectionHeader(title: string) {
  console.log('');
  console.log(`--- ${title} ---`);
}

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function buildSavePayload(overrides: Record<string, unknown> = {}) {
  return {
    projectName: 'P0.3.10 Test Project',
    topic: '测试主题：情感成长',
    platform: 'xiaohongshu',
    audience: '年轻女性',
    category: '情感',
    keywords: ['成长', '自我'],
    coreQuestions: ['如何成长'],
    selectedAngle: {
      id: 'angle-test-1',
      title: '测试角度',
      angle: '测试角度描述',
      reasoning: '推理',
      targetEmotion: '共鸣',
      estimatedViralScore: 80,
      difficulty: 'medium',
      keyPoints: ['要点1'],
      audienceAppeal: '受众吸引力',
    },
    strategy: {
      title: '测试策略标题',
      hook: '测试钩子',
      structure: [{ section: 'intro', purpose: 'hook', keyArguments: ['arg1'], estimatedWords: 100 }],
      keyArguments: ['arg1'],
      emotionalArc: { start: '平静', middle: '紧张', end: '释放' },
      callToAction: '关注我',
      tone: '温暖',
      estimatedWordCount: 500,
    },
    draft: {
      title: '最终草稿标题',
      content: '最终草稿内容',
      hook: '最终钩子',
      wordCount: 500,
    },
    ...overrides,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== P0.3.10 — Content OS Full Pipeline E2E Acceptance v3 ===');
  console.log('');

  // ─── Step 0: Setup Isolated Test DB ────────────────────────────────────
  sectionHeader('Step 0: Setup Isolated Test DB');

  const tempDir = mkdtempSync(join(tmpdir(), 'p0310-e2e-'));
  const tempDbPath = join(tempDir, 'test.db');
  const dbUrl = `file:${tempDbPath}`;

  console.log(`  Temp DB: ${tempDbPath}`);

  try {
    execSync(`npx prisma db push --accept-data-loss --force-reset --url "${dbUrl}"`, {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
    console.log('  Schema pushed successfully');
  } catch (error) {
    console.error('  Failed to push schema:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Set DATABASE_URL BEFORE importing prisma (lazy singleton)
  process.env.DATABASE_URL = dbUrl;

  const { prisma } = await import('../src/lib/prisma');
  const { POST: saveProject } = await import('../src/app/api/projects/save/route');
  const { GET: loadProject } = await import('../src/app/api/projects/[id]/route');
  const { POST: approveStrategy } = await import('../src/app/api/generation/strategy/approve/route');
  const { POST: rejectStrategy } = await import('../src/app/api/generation/strategy/reject/route');
  const { isDatabaseConfigured } = await import('../src/lib/utils/db-safe');

  // ─── Step 1: Verify DB Config ──────────────────────────────────────────
  sectionHeader('Step 1: Verify DB Configuration');

  addResult('DB-1', 'Database configured', isDatabaseConfigured(), 'DATABASE_URL set to isolated temp DB');

  if (!isDatabaseConfigured()) {
    console.error('DATABASE_URL not set. Aborting.');
    process.exit(1);
  }

  // ─── TEST E: Strategy Approval Gate ────────────────────────────────────
  sectionHeader('TEST E: Strategy Approval Gate');

  const gateProject = await prisma.project.create({ data: { name: 'Gate Test Project', description: 'Test', userId: 'default' } });
  const gateTopic = await prisma.topic.create({ data: { topic: 'Gate Topic', projectId: gateProject.id, status: 'DRAFT' } });
  const gateStrategy = await prisma.contentStrategy.create({ data: { topicId: gateTopic.id, coreThesis: 'Gate Strategy', approvalStatus: 'pending' } });

  // E1: Approve strategy
  const approveRes = await approveStrategy(new Request('http://localhost/api/generation/strategy/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyId: gateStrategy.id }),
  }) as any);
  const approveJson = await approveRes.json();
  addResult('E1', 'Approve pending strategy', approveJson.success === true,
    `Status: ${approveJson.data?.approvalStatus}`);

  // E1b: Verify DB reflects approval
  const stratAfterApprove = await prisma.contentStrategy.findUnique({ where: { id: gateStrategy.id } });
  addResult('E1b', 'DB reflects approved', stratAfterApprove?.approvalStatus === 'approved',
    `DB status: ${stratAfterApprove?.approvalStatus}`);

  // E2: Reject a different strategy
  const gateStrategy2 = await prisma.contentStrategy.create({ data: { topicId: gateTopic.id, coreThesis: 'Gate Strategy 2', approvalStatus: 'pending' } });
  const rejectRes = await rejectStrategy(new Request('http://localhost/api/generation/strategy/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyId: gateStrategy2.id, reason: '测试拒绝' }),
  }) as any);
  const rejectJson = await rejectRes.json();
  addResult('E2', 'Reject pending strategy', rejectJson.success === true,
    `Status: ${rejectJson.data?.approvalStatus}`);

  // E2b: Verify DB reflects rejection with reason
  const stratAfterReject = await prisma.contentStrategy.findUnique({ where: { id: gateStrategy2.id } });
  addResult('E2b', 'DB reflects rejected', stratAfterReject?.approvalStatus === 'rejected',
    `Rejection reason: ${stratAfterReject?.rejectionReason}`);

  // E3: Cannot approve already-rejected strategy
  const approveRejectedRes = await approveStrategy(new Request('http://localhost/api/generation/strategy/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyId: gateStrategy2.id }),
  }) as any);
  const approveRejectedJson = await approveRejectedRes.json();
  addResult('E3', 'Cannot approve rejected strategy', approveRejectedJson.success === false,
    `Error: ${approveRejectedJson.error}`);

  // ─── TEST L: Persistence (all entities) ────────────────────────────────
  sectionHeader('TEST L: Persistence — All Entities Saved');

  // L0: Call save API with all required data
  const saveRes = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      evaluation: { overallScore: 85, scores: { emotionalImpact: 85 }, strengths: ['good'], weaknesses: ['weak'], suggestions: [] },
      strategyEvaluation: { platform: 'douyin', overallScore: 85, grade: 'strong' },
    })),
  }) as any);
  const saveJson = await saveRes.json();
  addResult('L0', 'Save API returns success', saveJson.success === true,
    `projectId: ${saveJson.data?.projectId}`);

  if (saveJson.success) {
    const savedPid = saveJson.data.projectId;

    // L1: Verify Project persisted
    const savedProject = await prisma.project.findUnique({ where: { id: savedPid } });
    addResult('L1', 'Project in DB', !!savedProject && savedProject.name === 'P0.3.10 Test Project',
      savedProject?.name);

    // L2: Verify Topic persisted
    const savedTopic = await prisma.topic.findFirst({ where: { projectId: savedPid } });
    addResult('L2', 'Topic in DB', !!savedTopic && savedTopic.topic === '测试主题：情感成长',
      savedTopic?.topic);

    // L3: Verify Angle persisted
    const savedAngle = await prisma.angle.findMany({ where: { topicId: savedTopic?.id } });
    addResult('L3', 'Angle in DB', savedAngle.length === 1,
      `${savedAngle.length} angle(s)`);

    // L4: Verify Strategy persisted
    const savedStrategy = await prisma.contentStrategy.findFirst({ where: { topicId: savedTopic?.id } });
    addResult('L4', 'Strategy in DB', !!savedStrategy,
      `status: ${savedStrategy?.approvalStatus}`);

    // L5: Verify Drafts persisted
    const savedDrafts = await prisma.draft.findMany({ where: { topicId: savedTopic?.id } });
    addResult('L5', 'Draft in DB', savedDrafts.length === 2,
      `${savedDrafts.length} draft(s), versions: [${savedDrafts.map(d => d.version).join(', ')}]`);

    // L6: Verify Evaluation persisted
    const savedEval = await prisma.evaluation.findFirst({ where: { topicId: savedTopic?.id } });
    addResult('L6', 'Evaluation in DB', !!savedEval && savedEval.overallScore === 85,
      `score: ${savedEval?.overallScore}`);

    // L7: Verify StrategyEvaluation persisted
    const savedStratEval = await prisma.strategyEvaluation.findFirst({ where: { topicId: savedTopic?.id } });
    addResult('L7', 'StrategyEvaluation in DB', !!savedStratEval && savedStratEval.grade === 'strong',
      `grade: ${savedStratEval?.grade}`);

    // L8: Humanization with null result should NOT create record
    const humRecord = await prisma.humanization.findFirst({ where: { topicId: savedTopic?.id } });
    addResult('L8', 'Humanization null result → not saved', !humRecord,
      'Correctly skipped null result');

    // L9: Archive persisted
    const savedArchive = await prisma.userContentArchive.findFirst({ where: { topic: '测试主题：情感成长' } });
    addResult('L9', 'UserContentArchive in DB', !!savedArchive && savedArchive.finalTitle === '最终草稿标题',
      `title: ${savedArchive?.finalTitle}`);
  }

  // L_HUM_POS: Save WITH non-null humanization result
  sectionHeader('L_HUM_POS: Persistence — Humanization with result');
  const humPosRes = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Humanization POS Topic',
      humanization: { adopted: true, result: { changes: [{ type: 'test', original: 'a', revised: 'b' }] } },
    })),
  }) as any);
  const humPosJson = await humPosRes.json();
  addResult('L_HUM_POS_0', 'Save API (with humanization) success', humPosJson.success === true,
    `projectId: ${humPosJson.data?.projectId}`);

  if (humPosJson.success) {
    const humPosPid = humPosJson.data.projectId;
    const humPosTopic = await prisma.topic.findFirst({ where: { projectId: humPosPid } });

    const humPosRecord = humPosTopic ? await prisma.humanization.findFirst({ where: { topicId: humPosTopic.id } }) : null;
    addResult('L_HUM_POS_1', 'Humanization record in DB', !!humPosRecord,
      humPosRecord ? `adopted: ${humPosRecord.adopted}` : 'NOT FOUND');

    const humPosArchive = await prisma.userContentArchive.findFirst({ where: { topic: 'Humanization POS Topic' } });
    addResult('L_HUM_POS_2', 'Archive humanizationData persisted', !!humPosArchive && humPosArchive.humanizationData !== null,
      humPosArchive ? `humanizationData: ${humPosArchive.humanizationData ? 'present' : 'null'}` : 'ARCHIVE NOT FOUND');
    addResult('L_HUM_POS_3', 'Archive humanizationAdopted persisted', !!humPosArchive && humPosArchive.humanizationAdopted === true,
      humPosArchive ? `adopted: ${humPosArchive.humanizationAdopted}` : 'ARCHIVE NOT FOUND');
  }

  // ─── TEST M: Draft Versioning ──────────────────────────────────────────
  sectionHeader('TEST M: Draft Versioning');

  const versionProject = await prisma.project.create({ data: { name: 'Version Test Project', description: 'Test', userId: 'default' } });
  const versionTopic = await prisma.topic.create({ data: { topic: 'Version Topic', projectId: versionProject.id, status: 'READY' } });

  // M1: First save (no refine) → v1 only
  const v1Res = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({ topic: 'Version Topic', draft: { title: 'V1', content: 'Version 1', hook: 'Hook 1', wordCount: 100 } })),
  }) as any);
  const v1Json = await v1Res.json();
  addResult('M1', 'First save (no refine) → v1', v1Json.data?.draftVersion === 1,
    `draftVersion: ${v1Json.data?.draftVersion}`);

  // M2: First save with refine → v1 + v2
  const v2Res = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Version Topic',
      projectId: versionProject.id,
      originalDraft: { title: 'Original', content: 'Original content', hook: 'Original hook', wordCount: 200 },
      refineData: { content: 'Refined', title: 'Refined', hook: 'Refined hook', wordCount: 300, changes: [], summary: '', resolvedIssues: [], unresolvedIssues: [], preservedElements: [] },
      draft: { title: 'V2', content: 'Version 2', hook: 'Hook 2', wordCount: 300 },
    })),
  }) as any);
  const v2Json = await v2Res.json();
  addResult('M2', 'First save with refine → v1+v2', v2Json.data?.draftVersion === 2,
    `Drafts: [${(await prisma.draft.findMany({ where: { topicId: versionTopic.id } })).map(d => `v${d.version}(${d.status})`).join(', ')}]`);

  // M3: Second save → v3
  const v3Res = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Version Topic',
      projectId: versionProject.id,
      draft: { title: 'V3', content: 'Version 3', hook: 'Hook 3', wordCount: 400 },
    })),
  }) as any);
  const v3Json = await v3Res.json();
  addResult('M3', 'Second save → v3 (preserves v1, v2)', v3Json.data?.draftVersion === 3,
    `Drafts: [${(await prisma.draft.findMany({ where: { topicId: versionTopic.id } })).map(d => `v${d.version}`).join(', ')}]`);

  // M4: Third save → v4
  const v4Res = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Version Topic',
      projectId: versionProject.id,
      draft: { title: 'V4', content: 'Version 4', hook: 'Hook 4', wordCount: 500 },
    })),
  }) as any);
  const v4Json = await v4Res.json();
  addResult('M4', 'Third save → v4 (preserves v1-v3)', v4Json.data?.draftVersion === 4,
    `Drafts: [${(await prisma.draft.findMany({ where: { topicId: versionTopic.id } })).map(d => `v${d.version}`).join(', ')}]`);

  // M5: Old versions unchanged
  const allDrafts = await prisma.draft.findMany({ where: { topicId: versionTopic.id } });
  const v1Draft = allDrafts.find(d => d.version === 1);
  const v2DraftM = allDrafts.find(d => d.version === 2);
  addResult('M5', 'Old version content unchanged',
    v1Draft?.content === 'Original content' && v2DraftM?.content === '最终草稿内容',
    `v1: "${v1Draft?.content}", v2: "${v2DraftM?.content}"`);

  // M6: Old versions not deleted
  addResult('M6', 'Old versions not deleted', allDrafts.length === 4,
    `Total drafts: ${allDrafts.length}`);

  // M7: Version numbers are unique
  const versions = allDrafts.map(d => d.version).sort((a, b) => a - b);
  const uniqueVersions = [...new Set(versions)];
  addResult('M7', 'Version numbers unique', versions.length === uniqueVersions.length,
    `Versions: [${uniqueVersions.join(', ')}]`);

  // ─── TEST N: Persistence Metadata ──────────────────────────────────────
  sectionHeader('TEST N: Persistence Metadata');

  const metaRes = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Meta Test',
      originalDraft: { title: 'Meta Original', content: 'Meta original content', hook: 'Meta original hook', wordCount: 200 },
      refineData: { changes: [], resolvedIssues: [], unresolvedIssues: [], preservedElements: [], summary: '' },
      evaluation: { overallScore: 75, scores: { emotionalImpact: 80 }, strengths: ['strength'], weaknesses: ['weakness'], suggestions: [] },
      strategyEvaluation: { platform: 'douyin', overallScore: 80, grade: 'good' },
    })),
  }) as any);
  const metaJson = await metaRes.json();

  if (metaJson.success) {
    const metaPid = metaJson.data.projectId;
    const metaTopic = await prisma.topic.findFirst({ where: { projectId: metaPid } });
    const metaArchive = await prisma.userContentArchive.findFirst({ where: { topic: 'Meta Test' }, orderBy: { createdAt: 'desc' } });

    addResult('N1', 'refineData persisted', !!metaArchive?.refineData,
      metaArchive?.refineData ? 'refineData present' : 'MISSING');
    addResult('N2', 'humanizationData stored as null (null result)',
      !!metaArchive && metaArchive.humanizationData === null,
      metaArchive ? `humanizationData: ${metaArchive.humanizationData === null ? 'null (correct — no result provided)' : 'unexpectedly present'}` : 'ARCHIVE NOT FOUND');
    addResult('N3', 'humanizationAdopted persisted', !!metaArchive && metaArchive.humanizationAdopted === null,
      metaArchive ? `humanizationAdopted: ${metaArchive.humanizationAdopted}` : 'ARCHIVE NOT FOUND');
    addResult('N4', 'resolvedIssues persisted', !!metaArchive && (metaArchive.resolvedIssues as unknown[] | null)?.length === 0,
      metaArchive ? `resolvedIssues: ${(metaArchive.resolvedIssues as unknown[])}` : 'ARCHIVE NOT FOUND');
    addResult('N5', 'unresolvedIssues persisted', !!metaArchive && (metaArchive.unresolvedIssues as unknown[] | null)?.length === 0,
      metaArchive ? `unresolvedIssues: ${(metaArchive.unresolvedIssues as unknown[])}` : 'ARCHIVE NOT FOUND');
    addResult('N6', 'preservedElements persisted', !!metaArchive && (metaArchive.preservedElements as unknown[] | null)?.length === 0,
      metaArchive ? `preservedElements: ${(metaArchive.preservedElements as unknown[])}` : 'ARCHIVE NOT FOUND');
    addResult('N7', 'draftVersion persisted', !!metaArchive && metaArchive.draftVersion === 2,
      metaArchive ? `draftVersion: ${metaArchive.draftVersion}` : 'ARCHIVE NOT FOUND');
    addResult('N8', 'refineVersion persisted', !!metaArchive && metaArchive.refineVersion === 2,
      metaArchive ? `refineVersion: ${metaArchive.refineVersion}` : 'ARCHIVE NOT FOUND');
    addResult('N9', 'selectedAngleTitle persisted', !!metaArchive && metaArchive.selectedAngleTitle === '测试角度',
      metaArchive ? `selectedAngleTitle: ${metaArchive.selectedAngleTitle}` : 'ARCHIVE NOT FOUND');
    addResult('N10', 'strategyTone persisted', !!metaArchive && metaArchive.strategyTone === '温暖',
      metaArchive ? `strategyTone: ${metaArchive.strategyTone}` : 'ARCHIVE NOT FOUND');
    addResult('N11', 'wordCount persisted', !!metaArchive && metaArchive.wordCount === 500,
      metaArchive ? `wordCount: ${metaArchive.wordCount}` : 'ARCHIVE NOT FOUND');
  }

  // ─── TEST O: Strategy Approval Persistence ─────────────────────────────
  sectionHeader('TEST O: Strategy Approval Persistence');

  // O1: approved → Save → still approved
  const approvedProject = await prisma.project.create({ data: { name: 'Approval Test', description: 'Test', userId: 'default' } });
  const approvedTopic = await prisma.topic.create({ data: { topic: 'Approval Topic', projectId: approvedProject.id, status: 'READY' } });
  const approvedStrategy = await prisma.contentStrategy.create({ data: { topicId: approvedTopic.id, coreThesis: 'Approved Strategy', approvalStatus: 'approved', approvedAt: new Date('2026-09-18T12:00:00Z') } });

  await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({ projectId: approvedProject.id, topic: 'Approval Topic' })),
  }) as any);
  const stratApproved = await prisma.contentStrategy.findUnique({ where: { id: approvedStrategy.id } });
  addResult('O1', 'approved → Save → still approved', stratApproved?.approvalStatus === 'approved',
    `DB status: ${stratApproved?.approvalStatus}`);

  // O2: approvedAt not cleared
  addResult('O2', 'approvedAt not cleared', !!stratApproved?.approvedAt,
    `approvedAt: ${stratApproved?.approvedAt?.toISOString()}`);

  // O3: rejectionReason preserved
  addResult('O3', 'rejectionReason preserved', stratApproved?.rejectionReason === null,
    `rejectionReason: ${stratApproved?.rejectionReason}`);

  // O4: rejectedAt preserved
  addResult('O4', 'rejectedAt preserved', stratApproved?.rejectedAt === null,
    `rejectedAt: ${stratApproved?.rejectedAt}`);

  // O5: pending → Save → still pending
  const pendingProject = await prisma.project.create({ data: { name: 'Pending Test', description: 'Test', userId: 'default' } });
  const pendingTopic = await prisma.topic.create({ data: { topic: 'Pending Topic', projectId: pendingProject.id, status: 'READY' } });
  const pendingStrategy = await prisma.contentStrategy.create({ data: { topicId: pendingTopic.id, coreThesis: 'Pending Strategy', approvalStatus: 'pending' } });

  await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({ projectId: pendingProject.id, topic: 'Pending Topic' })),
  }) as any);
  const stratPending = await prisma.contentStrategy.findUnique({ where: { id: pendingStrategy.id } });
  addResult('O5', 'pending → Save → still pending', stratPending?.approvalStatus === 'pending',
    `DB status: ${stratPending?.approvalStatus}`);

  // O6: rejected → Save → still rejected
  const rejectedProject = await prisma.project.create({ data: { name: 'Rejected Test', description: 'Test', userId: 'default' } });
  const rejectedTopic = await prisma.topic.create({ data: { topic: 'Rejected Topic', projectId: rejectedProject.id, status: 'READY' } });
  const rejectedStrategy = await prisma.contentStrategy.create({ data: { topicId: rejectedTopic.id, coreThesis: 'Rejected Strategy', approvalStatus: 'rejected', rejectionReason: 'Not aligned' } });

  await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({ projectId: rejectedProject.id })),
  }) as any);
  const stratRejected = await prisma.contentStrategy.findUnique({ where: { id: rejectedStrategy.id } });
  addResult('O6', 'rejected → Save → still rejected', stratRejected?.approvalStatus === 'rejected',
    `DB status: ${stratRejected?.approvalStatus}, reason: ${stratRejected?.rejectionReason}`);

  // ─── TEST P: Transaction Rollback ──────────────────────────────────────
  sectionHeader('TEST P: Transaction Rollback');

  // P1–P4: Demonstrate rollback of individual entity types
  const rollbackMarker = 'ROLLBACK_TEST_PROJECT';
  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.create({ data: { name: rollbackMarker, description: 'Test', userId: 'default' } });
      throw new Error('Forced rollback');
    });
  } catch { /* expected */ }
  addResult('P1', 'Transaction rollback — project not persisted',
    await prisma.project.findFirst({ where: { name: rollbackMarker } }) === null, 'Project correctly rolled back');

  const p2Project = await prisma.project.create({ data: { name: 'P2 Project', description: 'Test', userId: 'default' } });
  const rollbackTopicMarker = 'ROLLBACK_TEST_TOPIC';
  try {
    await prisma.$transaction(async (tx) => {
      await tx.topic.create({ data: { topic: rollbackTopicMarker, projectId: p2Project.id, status: 'DRAFT' } });
      throw new Error('Forced rollback');
    });
  } catch { /* expected */ }
  addResult('P2', 'Transaction rollback — topic not persisted',
    await prisma.topic.findFirst({ where: { topic: rollbackTopicMarker } }) === null, 'Topic correctly rolled back');

  const p3Topic = await prisma.topic.create({ data: { topic: 'P3 Topic', projectId: p2Project.id, status: 'READY' } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.draft.create({ data: { topicId: p3Topic.id, version: 1, content: 'ROLLBACK_TEST_DRAFT' } });
      throw new Error('Forced rollback');
    });
  } catch { /* expected */ }
  addResult('P3', 'Transaction rollback — draft not persisted',
    await prisma.draft.findFirst({ where: { content: 'ROLLBACK_TEST_DRAFT' } }) === null, 'Draft correctly rolled back');

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userContentArchive.create({ data: { topic: 'ROLLBACK_TEST_ARCHIVE', finalTitle: 'Rollback', finalContent: 'Rollback', userId: 'default' } });
      throw new Error('Forced rollback');
    });
  } catch { /* expected */ }
  addResult('P4', 'Transaction rollback — archive not persisted',
    await prisma.userContentArchive.findFirst({ where: { topic: 'ROLLBACK_TEST_ARCHIVE' } }) === null, 'Archive correctly rolled back');

  // P_RB Mid-Transaction Rollback: Verify atomicity when failure occurs AFTER
  // all entity writes but BEFORE transaction commit (the archive step).
  //
  // Setup: create a project with v1+v2 via save API (outside transaction)
  // Then: install a SQLite trigger that forces ABORT on UserContentArchive insert,
  //       attempt a real save → transaction MUST roll back ALL writes.
  const rollbackTestProject = await prisma.project.create({ data: { name: 'Rollback Route Test', description: 'Test', userId: 'default' } });
  const rollbackTestTopic = await prisma.topic.create({ data: { topic: 'Rollback Route Topic', projectId: rollbackTestProject.id, status: 'READY' } });
  const rollbackTestStrategy = await prisma.contentStrategy.create({ data: { topicId: rollbackTestTopic.id, coreThesis: 'Rollback Strategy', approvalStatus: 'approved', approvedAt: new Date() } });

  const rollbackSave1 = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      projectId: rollbackTestProject.id,
      originalDraft: { title: 'Original', content: 'Original content', hook: 'Original hook', wordCount: 300 },
      refineData: { content: 'Refined', title: 'Refined', hook: 'Refined hook', wordCount: 400, changes: [], summary: '', resolvedIssues: [], unresolvedIssues: [], preservedElements: [] },
    })),
  }) as any);
  const rollbackJson1 = await rollbackSave1.json();
  addResult('P_RB_1', 'Initial save (v1+v2) success', rollbackJson1.success === true, `draftVersion: ${rollbackJson1.data?.draftVersion}`);

  // Capture state counts AFTER initial successful save (baseline)
  const topicsBefore = await prisma.topic.count({ where: { topic: 'Rollback Route Topic' } });
  const anglesBefore = await prisma.angle.count({ where: { topicId: rollbackTestTopic.id } });
  const draftsBefore = await prisma.draft.count({ where: { topicId: rollbackTestTopic.id } });
  const archivesBefore = await prisma.userContentArchive.count({ where: { topic: 'Rollback Route Topic' } });

  // P_RB MID-TRANSACTION: Install SQLite trigger to force failure at archive step
  // This simulates a scenario where:
  //   ✅ transaction has STARTED
  //   ✅ Project / Topic / Angle / Strategy writes have ALL happened
  //   ✅ Draft.create() has happened
  //   ✅ Evaluation.create() has happened (if applicable)
  //   ✅ StrategyEvaluation.create() has happened (if applicable)
  //   ✅ Humanization.create() has happened (if applicable)
  //   ❌ UserContentArchive.create() → TRIGGER FIRES → RAISE(ABORT) → FULL ROLLBACK
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS p0310_forced_archive_failure
    BEFORE INSERT ON "UserContentArchive"
    BEGIN
      SELECT RAISE(ABORT, 'P0.3.10 forced archive failure');
    END;
  `);

  // Attempt a save that will MID-TRANSACTION fail (archive step is last)
  const failingSave = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      projectId: rollbackTestProject.id,
      originalDraft: { title: 'ShouldNotPersist', content: 'ShouldNotPersist content', hook: 'ShouldNotPersist hook', wordCount: 999 },
      refineData: { content: 'ShouldNotPersist', title: 'ShouldNotPersist', hook: 'ShouldNotPersist', wordCount: 999, changes: [], summary: '', resolvedIssues: [], unresolvedIssues: [], preservedElements: [] },
    })),
  }) as any);
  const failingJson = await failingSave.json();
  addResult('P_RB_2', 'Mid-transaction failing save returns error', failingJson.success === false, `Error: ${failingJson.error}`);

  // Remove the trigger to avoid affecting subsequent tests
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS p0310_forced_archive_failure;`);

  // P_RB ROLLBACK VERIFICATION: All entities that were written before the
  // archive step must have been rolled back — NO partial state allowed.
  const topicsAfter = await prisma.topic.count({ where: { topic: 'Rollback Route Topic' } });
  const anglesAfter = await prisma.angle.count({ where: { topicId: rollbackTestTopic.id } });
  const draftsAfter = await prisma.draft.count({ where: { topicId: rollbackTestTopic.id } });
  const archivesAfter = await prisma.userContentArchive.count({ where: { topic: 'Rollback Route Topic' } });

  // Verify: NO new topics, angles, drafts, or archives persisted from the failed save
  addResult('P_RB_3', 'No new topic persisted (mid-transaction rollback)', topicsAfter === topicsBefore,
    `Before: ${topicsBefore}, After: ${topicsAfter}`);
  addResult('P_RB_4', 'No new angle persisted (mid-transaction rollback)', anglesAfter === anglesBefore,
    `Before: ${anglesBefore}, After: ${anglesAfter}`);
  addResult('P_RB_5', 'No new draft persisted (mid-transaction rollback)', draftsAfter === draftsBefore,
    `Before: ${draftsBefore}, After: ${draftsAfter}`);
  addResult('P_RB_6', 'No new archive persisted (mid-transaction rollback)', archivesAfter === archivesBefore,
    `Before: ${archivesBefore}, After: ${archivesAfter}`);

  // Verify: the initial successful data (from P_RB_1) is STILL intact.
  // The strategy was updated by the successful P_RB_1 save to '测试策略标题' with approvalStatus='approved'.
  // The failed save attempted to modify state but the transaction rolled back.
  // After rollback, strategy should be in the SAME state as after P_RB_1.
  const stratAfterRollback = await prisma.contentStrategy.findUnique({ where: { topicId: rollbackTestTopic.id } });
  // Note: coreThesis updated by P_RB_1 to match payload's strategy.title; approvalStatus preserved as 'approved'
  addResult('P_RB_7', 'Pre-existing strategy approval status preserved after rollback',
    !!stratAfterRollback && stratAfterRollback.coreThesis === '测试策略标题' && stratAfterRollback.approvalStatus === 'approved',
    `coreThesis: "${stratAfterRollback?.coreThesis}", status: ${stratAfterRollback?.approvalStatus}`);

  // Verify: the v2 draft content from the initial save is NOT overwritten
  // (the failed save attempted to create a new draft with 'ShouldNotPersist')
  const v2Draft = await prisma.draft.findFirst({ where: { topicId: rollbackTestTopic.id, version: 2 } });
  addResult('P_RB_8', 'v2 draft content not corrupted by failed save',
    !!v2Draft && v2Draft.content === '最终草稿内容',
    `v2 content: "${v2Draft?.content}"`);

  // ─── TEST Q: Project Reload ────────────────────────────────────────────
  sectionHeader('TEST Q: Project Reload');

  // Create a fully-populated project via the save API (so archive exists).
  // Note: NOT using refineData here, so v1 is both FINAL and the latest draft.
  // (The load route returns the latest draft; if refineData is used, v2 becomes
  // latest but has no evaluation linked — evaluation is linked to v1/original.)
  const reloadSetupRes = await saveProject(new Request('http://localhost/api/projects/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSavePayload({
      topic: 'Reload Test Topic',
      evaluation: { overallScore: 88, scores: { emotionalImpact: 85 }, strengths: ['good'], weaknesses: ['weak'], suggestions: [] },
      strategyEvaluation: { platform: 'douyin', overallScore: 85, grade: 'strong' },
      humanization: { adopted: true, result: null },
    })),
  }) as any);
  const reloadSetupJson = await reloadSetupRes.json();
  addResult('Q0', 'Reload setup save success', reloadSetupJson.success === true, `projectId: ${reloadSetupJson.data?.projectId}`);

  if (reloadSetupJson.success) {
    const reloadPid = reloadSetupJson.data.projectId;

    // GET reload
    const loadRes = await loadProject(new Request(`http://localhost/api/projects/${reloadPid}`, { method: 'GET' }) as any, { params: Promise.resolve({ id: reloadPid }) });
    const loadJson = await loadRes.json();

    addResult('Q1', 'Load API returns success', loadJson.success === true, `project: ${loadJson.data?.projectName}`);

    if (loadJson.success) {
      // Q2: Topic retrievable (verify GET return value)
      addResult('Q2', 'Topic retrievable', !!loadJson.data?.topicProfile && loadJson.data.topicProfile.topic === 'Reload Test Topic',
        `topic: ${loadJson.data?.topicProfile?.topic}`);

      // Q3: Selected Angle retrievable (verify GET return value)
      addResult('Q3', 'Selected Angle retrievable', !!loadJson.data?.selectedAngle && loadJson.data.selectedAngle.title === '测试角度',
        `angle: ${loadJson.data?.selectedAngle?.title}`);

      // Q4: Strategy retrievable (verify GET return value)
      addResult('Q4', 'Strategy retrievable', !!loadJson.data?.strategy && loadJson.data.strategy.hook === '测试钩子',
        `strategy hook: ${loadJson.data?.strategy?.hook}`);

      // Q5: Draft retrievable (verify GET return value)
      addResult('Q5', 'Draft retrievable', !!loadJson.data?.draft && loadJson.data.draft.content === '最终草稿内容',
        `draft content: "${loadJson.data?.draft?.content}"`);

      // Q6: Evaluation retrievable (verify GET return value — actual score)
      addResult('Q6', 'Evaluation retrievable', !!loadJson.data?.evaluation && loadJson.data.evaluation.overallScore === 88,
        `score: ${loadJson.data?.evaluation?.overallScore}`);

      // Q7: StrategyEvaluation retrievable (verify GET return value)
      addResult('Q7', 'StrategyEvaluation retrievable', !!loadJson.data?.strategyEvaluation && loadJson.data.strategyEvaluation.grade === 'strong',
        `grade: ${loadJson.data?.strategyEvaluation?.grade}`);

      // Q8: Platform retrievable
      addResult('Q8', 'Platform retrievable', loadJson.data?.platform === 'xiaohongshu',
        `platform: ${loadJson.data?.platform}`);

      // Q9: Q1 via reload does mutate nothing — verify strategy status is stable
      addResult('Q9', 'Reload returns projectName', !!loadJson.data?.projectName && loadJson.data.projectName === 'P0.3.10 Test Project',
        `projectName: ${loadJson.data?.projectName}`);

      // Q10: Humanization in archive (null result → humanizationData is null)
      const q10Archive = await prisma.userContentArchive.findFirst({ where: { topic: 'Reload Test Topic' }, orderBy: { createdAt: 'desc' } });
      addResult('Q10', 'Humanization in archive (null result)', !!q10Archive && q10Archive.humanizationData === null,
        q10Archive ? `humanizationData: ${q10Archive.humanizationData === null ? 'null (correct)' : 'unexpectedly present'}` : 'ARCHIVE NOT FOUND');
    }

    // Q11: Strategy approval NOT changed by reload (read-only operation)
    const reloadTopic = await prisma.topic.findFirst({ where: { projectId: reloadPid } });
    if (reloadTopic) {
      // First, ensure the strategy is in 'approved' state (via direct DB write to set known baseline)
      await prisma.contentStrategy.updateMany({
        where: { topicId: reloadTopic.id },
        data: { approvalStatus: 'approved', approvedAt: new Date() },
      });

      // Capture baseline BEFORE reload
      const stratBeforeReload = await prisma.contentStrategy.findUnique({ where: { topicId: reloadTopic.id } });
      const approvalBeforeReload = stratBeforeReload?.approvalStatus;

      // Perform a reload (GET) — this should be a read-only operation
      const reloadRes2 = await loadProject(new Request(`http://localhost/api/projects/${reloadPid}`, { method: 'GET' }) as any, { params: Promise.resolve({ id: reloadPid }) });
      await reloadRes2.json(); // consume response

      // Capture state AFTER reload
      const stratAfterReload = await prisma.contentStrategy.findUnique({ where: { topicId: reloadTopic.id } });
      const approvalAfterReload = stratAfterReload?.approvalStatus;

      // Real assertion: approval status must be UNCHANGED and equal to 'approved'
      addResult('Q11', 'Strategy approval preserved after reload',
        approvalAfterReload === approvalBeforeReload && approvalBeforeReload === 'approved',
        `Before: ${approvalBeforeReload}, After: ${approvalAfterReload}`);
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('');
  console.log('=== P0.3.10 E2E Acceptance Summary ===');
  console.log('');

  const passed_count = results.filter(r => r.passed).length;
  const failed_count = results.filter(r => !r.passed).length;

  console.log(`Total: ${results.length} checks`);
  console.log(`Passed: ${passed_count}`);
  console.log(`Failed: ${failed_count}`);

  if (failed_count > 0) {
    console.log('');
    console.log('Failed checks:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ❌ [${r.id}] ${r.name}: ${r.message}`);
    }
  }

  console.log('');

  // ─── Teardown ──────────────────────────────────────────────────────────
  try {
    await prisma.$disconnect();
    if (existsSync(tempDbPath)) {
      unlinkSync(tempDbPath);
    }
    try {
      const { rmSync } = require('node:fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    console.log('  Cleanup: temp DB removed');
  } catch { /* ignore */ }

  if (failed_count > 0) {
    console.log('  Result: FAIL');
    process.exit(1);
  } else {
    console.log('  Result: ALL PASS');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
