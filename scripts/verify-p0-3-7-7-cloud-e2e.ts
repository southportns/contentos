#!/usr/bin/env tsx
/**
 * P0.3.7.7 — Cloud E2E Smoke Verification
 *
 * Verifies the full Knowledge Context pipeline with real DashScope API.
 * Requires DASHSCOPE_API_KEY environment variable.
 *
 * Flow:
 *   1. Check prerequisites (API key, persisted embeddings)
 *   2. Initialize semantic search singleton (loads from persistence)
 *   3. Execute retrieveKnowledgeContextForGeneration() with real queries
 *   4. Verify KnowledgeContext structure and content
 *   5. Verify serializer output
 *   6. Verify prompt assembly includes Knowledge Context block
 *   7. Verify graceful degradation (empty result path)
 *   8. Measure real retrieval latency
 *
 * Safety:
 *   - Does NOT modify production embeddings storage
 *   - Does NOT modify VALIDATED_KNOWLEDGE_UNITS.json
 *   - Uses existing persisted embeddings (from P0.3.2-2 sync)
 *   - Does NOT call LLM (only verifies prompt assembly)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { retrieveKnowledgeContextForGeneration } from '../src/knowledge/context/generation-knowledge-context';
import { serializeKnowledgeContext } from '../src/knowledge/context/knowledge-context-serializer';
import { WRITING_PROMPT } from '../skills/writing/prompts';
import { getSemanticSearchInstance, resetSemanticSearchInstance } from '../src/knowledge/semantic/semantic-search-instance';

// ─── Configuration ────────────────────────────────────────────────────────

const EMBEDDING_STORAGE_PATH = join(
  process.cwd(),
  'data',
  'knowledge',
  'embeddings.json'
);

const TEST_QUERIES = [
  {
    query: '为什么我们越长大，越容易在关系里委屈自己 情感成长 委屈自己的根源是童年形成的讨好型人格',
    description: 'E2E topic query (matches P0.3.7.6 fixture)',
    expectResults: true,
  },
  {
    query: '女性自我成长与独立',
    description: 'Female growth theme',
    expectResults: true,
  },
  {
    query: '认知反转制造内容张力',
    description: 'Cognitive reversal technique',
    expectResults: true,
  },
  {
    query: '停止向外索取认可建立内在价值',
    description: 'Inner value building',
    expectResults: true,
  },
  {
    query: 'xyznonexistentquery12345',
    description: 'Nonsense query (degraded behavior)',
    expectResults: false,
    strictZero: false, // Low threshold (0.35) may still match; system must not crash
  },
];

// ─── Test Results ─────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
  latencyMs?: number;
}

const results: TestResult[] = [];

function addResult(
  name: string,
  passed: boolean,
  message: string,
  details?: string,
  latencyMs?: number
) {
  results.push({ name, passed, message, details, latencyMs });
  const icon = passed ? '✅' : '❌';
  const timing = latencyMs !== undefined ? ` (${latencyMs.toFixed(0)}ms)` : '';
  console.log(`${icon} ${name}: ${message}${timing}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function checkKnowledgeContextStructure(ctx: ReturnType<typeof Object>): boolean {
  return (
    typeof ctx === 'object' &&
    ctx !== null &&
    'query' in ctx &&
    'retrieval' in ctx &&
    'selectedCount' in ctx &&
    'primaryKnowledge' in ctx &&
    'supportingKnowledge' in ctx &&
    'evidence' in ctx &&
    'constraints' in ctx &&
    'metadata' in ctx
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== P0.3.7.7 Cloud E2E Smoke Verification ===');
  console.log('');

  // ─── Step 0: Prerequisites ─────────────────────────────────────────────
  console.log('--- Step 0: Prerequisites ---');

  if (!process.env.DASHSCOPE_API_KEY) {
    console.log('⚠️  DASHSCOPE_API_KEY not set — skipping cloud verification.');
    console.log('   Set DASHSCOPE_API_KEY to run this verification.');
    process.exit(0);
  }
  addResult('DASHSCOPE_API_KEY', true, 'API key present');

  if (!existsSync(EMBEDDING_STORAGE_PATH)) {
    console.log(`⚠️  Embedding storage not found at ${EMBEDDING_STORAGE_PATH}`);
    console.log('   Run scripts/sync-knowledge-embeddings.ts first.');
    process.exit(0);
  }
  addResult('Embedding Storage', true, `Found at ${EMBEDDING_STORAGE_PATH}`);

  // ─── Step 1: Initialize Semantic Search ───────────────────────────────
  console.log('');
  console.log('--- Step 1: Initialize Semantic Search ---');

  const initStart = performance.now();
  let searchInstance: Awaited<ReturnType<typeof getSemanticSearchInstance>>;
  try {
    // Reset singleton to ensure fresh initialization
    resetSemanticSearchInstance();
    searchInstance = await getSemanticSearchInstance();
    const initMs = performance.now() - initStart;
    addResult(
      'Semantic Search Init',
      true,
      `Initialized successfully (isReady: ${searchInstance.isReady})`,
      undefined,
      initMs
    );
  } catch (error) {
    const initMs = performance.now() - initStart;
    addResult(
      'Semantic Search Init',
      false,
      `Failed: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      initMs
    );
    process.exit(1);
  }

  // ─── Step 2: Execute Test Queries ──────────────────────────────────────
  console.log('');
  console.log('--- Step 2: Execute Test Queries ---');

  let totalRetrievalTime = 0;
  let successfulRetrievals = 0;
  let failedRetrievals = 0;

  for (const test of TEST_QUERIES) {
    const start = performance.now();
    try {
      const ctx = await retrieveKnowledgeContextForGeneration(test.query);
      const elapsed = performance.now() - start;
      totalRetrievalTime += elapsed;

      if (test.expectResults) {
        if (ctx === null) {
          addResult(
            `Query: ${test.description}`,
            false,
            'Expected results but got null',
            `Query: "${test.query.slice(0, 50)}..."`,
            elapsed
          );
          failedRetrievals++;
        } else if (ctx.selectedCount === 0) {
          addResult(
            `Query: ${test.description}`,
            false,
            'Expected results but got 0 selected items',
            `Query: "${test.query.slice(0, 50)}..."`,
            elapsed
          );
          failedRetrievals++;
        } else {
          addResult(
            `Query: ${test.description}`,
            true,
            `Retrieved ${ctx.selectedCount} items (${ctx.primaryKnowledge.length} primary, ${ctx.supportingKnowledge.length} supporting)`,
            `Top similarity: ${ctx.primaryKnowledge[0]?.similarity?.toFixed(3) ?? 'N/A'}`,
            elapsed
          );
          successfulRetrievals++;
        }
      } else {
        // Nonsense query: system must not crash; any result count is acceptable
        // Note: With threshold=0.35, even nonsense queries may match low-similarity items
        const strictZero = (test as typeof test & { strictZero?: boolean }).strictZero ?? true;
        if (strictZero && ctx !== null && ctx.selectedCount > 0) {
          addResult(
            `Query: ${test.description}`,
            false,
            `Expected 0 results but got ${ctx.selectedCount}`,
            `Top sim: ${ctx.primaryKnowledge[0]?.similarity?.toFixed(3) ?? 'N/A'}`,
            elapsed
          );
          failedRetrievals++;
        } else {
          addResult(
            `Query: ${test.description}`,
            true,
            ctx === null
              ? 'Returned null (graceful)'
              : `Returned ${ctx.selectedCount} items (low-similarity, acceptable)`,
              ctx ? `Top sim: ${ctx.primaryKnowledge[0]?.similarity?.toFixed(3) ?? 'N/A'}` : undefined,
            elapsed
          );
          successfulRetrievals++;
        }
      }
    } catch (error) {
      const elapsed = performance.now() - start;
      addResult(
        `Query: ${test.description}`,
        false,
        `Threw error: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        elapsed
      );
      failedRetrievals++;
    }
  }

  // ─── Step 3: KnowledgeContext Structure Verification ───────────────────
  console.log('');
  console.log('--- Step 3: KnowledgeContext Structure Verification ---');

  const structQuery = TEST_QUERIES[0].query;
  const structCtx = await retrieveKnowledgeContextForGeneration(structQuery);

  if (structCtx === null) {
    addResult('Structure Check', false, 'Cannot verify — context is null');
  } else {
    // Check all required fields
    const hasQuery = typeof structCtx.query === 'string' && structCtx.query === structQuery;
    addResult('ctx.query', hasQuery, hasQuery ? 'Query matches input' : 'Query mismatch');

    const hasRetrieval =
      typeof structCtx.retrieval === 'object' &&
      structCtx.retrieval.method === 'semantic' &&
      typeof structCtx.retrieval.threshold === 'number' &&
      typeof structCtx.retrieval.topK === 'number';
    addResult('ctx.retrieval', hasRetrieval, hasRetrieval ? 'Retrieval metadata valid' : 'Invalid retrieval metadata');

    const hasPrimary = Array.isArray(structCtx.primaryKnowledge);
    addResult('ctx.primaryKnowledge', hasPrimary, `${structCtx.primaryKnowledge.length} items`);

    const hasSupporting = Array.isArray(structCtx.supportingKnowledge);
    addResult('ctx.supportingKnowledge', hasSupporting, `${structCtx.supportingKnowledge.length} items`);

    const hasEvidence = Array.isArray(structCtx.evidence);
    addResult('ctx.evidence', hasEvidence, `${structCtx.evidence.length} items`);

    const hasConstraints =
      typeof structCtx.constraints === 'object' &&
      typeof structCtx.constraints.hasCandidates === 'boolean' &&
      typeof structCtx.constraints.maxItems === 'number' &&
      typeof structCtx.constraints.wasTruncated === 'boolean';
    addResult('ctx.constraints', hasConstraints, 'Constraints valid');

    const hasMetadata =
      typeof structCtx.metadata === 'object' &&
      typeof structCtx.metadata.version === 'string' &&
      typeof structCtx.metadata.source === 'string';
    addResult('ctx.metadata', hasMetadata, `Source: ${structCtx.metadata.source}`);

    // Check primary knowledge item structure
    if (structCtx.primaryKnowledge.length > 0) {
      const item = structCtx.primaryKnowledge[0];
      const itemValid =
        typeof item.knowledgeId === 'string' &&
        typeof item.name === 'string' &&
        typeof item.text === 'string' &&
        typeof item.similarity === 'number' &&
        item.similarity >= 0 && item.similarity <= 1;
      addResult('Primary Item Structure', itemValid, `Top: "${item.name}" (sim: ${item.similarity.toFixed(3)})`);
    }
  }

  // ─── Step 4: Serializer Verification ───────────────────────────────────
  console.log('');
  console.log('--- Step 4: Serializer Verification ---');

  if (structCtx === null) {
    addResult('Serializer', false, 'Cannot verify — context is null');
  } else {
    const serialized = serializeKnowledgeContext(structCtx);

    const hasHeader = serialized.includes('## Knowledge Context');
    addResult('Serialized Header', hasHeader, 'Contains ## Knowledge Context');

    const hasIntro = serialized.includes('Use it as supporting knowledge when relevant');
    addResult('Serialized Intro', hasIntro, 'Contains intro lines');

    const hasStatus = serialized.includes('Status:');
    addResult('Serialized Status', hasStatus, 'Contains Status lines');

    const hasSimilarity = serialized.includes('Similarity:');
    addResult('Serialized Similarity', hasSimilarity, 'Contains Similarity lines');

    const hasRetrievalMeta = serialized.includes('Retrieval Metadata');
    addResult('Serialized Retrieval Meta', hasRetrievalMeta, 'Contains Retrieval Metadata section');

    // Verify low-noise policy: no internal fields leaked
    const noThreshold = !serialized.includes('threshold:') && !serialized.includes('Threshold:');
    const noTopK = !serialized.includes('topK:') && !serialized.includes('TopK:');
    const noKnowledgeId = !serialized.includes('knowledgeId:') && !serialized.includes('KnowledgeId:');
    const noRetrievalReason = !serialized.includes('retrievalReason') && !serialized.includes('RetrievalReason');
    const noVersion = !serialized.includes('Version: 1.0.0');

    addResult('No threshold leak', noThreshold, 'threshold not in serialized output');
    addResult('No topK leak', noTopK, 'topK not in serialized output');
    addResult('No knowledgeId leak', noKnowledgeId, 'knowledgeId not in serialized output');
    addResult('No retrievalReason leak', noRetrievalReason, 'retrievalReason not in serialized output');
    addResult('No version leak', noVersion, 'metadata.version not in serialized output');
  }

  // ─── Step 5: Prompt Assembly Verification ──────────────────────────────
  console.log('');
  console.log('--- Step 5: Prompt Assembly Verification ---');

  if (structCtx === null) {
    addResult('Prompt Assembly', false, 'Cannot verify — context is null');
  } else {
    const prompt = WRITING_PROMPT(
      '为什么我们越长大，越容易在关系里委屈自己',
      {
        title: '越长大越委屈自己？根源在这里',
        hook: '你是不是那个总是委屈自己的人？',
        structure: [
          { section: '开头', purpose: '引发共鸣', keyArguments: ['委屈自己的普遍性'], estimatedWords: 150 },
          { section: '分析', purpose: '揭示根源', keyArguments: ['童年讨好模式'], estimatedWords: 300 },
        ],
        keyArguments: ['童年讨好模式', '边界感缺失'],
        emotionalArc: { start: '共鸣', middle: '反思', end: '希望' },
        callToAction: '关注我，一起成长',
        tone: '温暖而真诚',
        estimatedWordCount: 800,
      },
      {
        title: '情感成长',
        angle: '委屈自己的根源是童年形成的讨好型人格',
        targetEmotion: '共鸣与反思',
        keyPoints: ['讨好型人格的童年根源'],
      },
      'douyin',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      structCtx
    );

    const hasKnowledgeBlock = prompt.includes('## Knowledge Context');
    addResult('Prompt has Knowledge Context', hasKnowledgeBlock, 'Knowledge Context block present');

    const hasTopic = prompt.includes('为什么我们越长大');
    addResult('Prompt has Topic', hasTopic, 'Topic present');

    const hasStrategy = prompt.includes('内容策略');
    addResult('Prompt has Strategy', hasStrategy, 'Strategy section present');

    const hasPlatform = prompt.includes('目标平台：douyin');
    addResult('Prompt has Platform', hasPlatform, 'Platform section present');

    const hasFinalInstruction = prompt.includes('请基于以上策略，写出完整的内容初稿。');
    addResult('Prompt has Final Instruction', hasFinalInstruction, 'Final instruction present');

    // Verify strategy comes BEFORE knowledge context
    const strategyIdx = prompt.indexOf('内容策略');
    const knowledgeIdx = prompt.indexOf('## Knowledge Context');
    const ordering = strategyIdx < knowledgeIdx;
    addResult('Strategy before Knowledge', ordering, `Strategy@${strategyIdx} < Knowledge@${knowledgeIdx}`);

    // Verify serialized content is in prompt
    const topItemName = structCtx.primaryKnowledge[0]?.name ?? '';
    const hasItemName = topItemName.length > 0 && prompt.includes(topItemName);
    addResult('Prompt has Item Name', hasItemName, `Top item "${topItemName}" in prompt`);
  }

  // ─── Step 6: Graceful Degradation ──────────────────────────────────────
  console.log('');
  console.log('--- Step 6: Graceful Degradation ---');

  // Test with potentially-empty result query
  const emptyQuery = 'xyznonexistentquery12345';
  const emptyCtx = await retrieveKnowledgeContextForGeneration(emptyQuery);

  if (emptyCtx !== null && emptyCtx.selectedCount === 0) {
    // Empty result path: context exists with 0 items
    const emptySerialized = serializeKnowledgeContext(emptyCtx);
    const hasEmptyPlaceholder = emptySerialized.includes('No relevant knowledge was retrieved.');
    addResult('Empty Result Placeholder', hasEmptyPlaceholder, 'Placeholder text present');

    // Prompt with empty context still assembles
    const emptyPrompt = WRITING_PROMPT(
      '测试主题',
      { title: 'Test', hook: 'Test', structure: [], keyArguments: [], emotionalArc: { start: 'a', middle: 'b', end: 'c' }, callToAction: 'Test', tone: 'Test', estimatedWordCount: 100 },
      { title: 'Test', angle: 'Test', targetEmotion: 'Test', keyPoints: [] },
      'douyin',
      undefined, undefined, undefined, undefined, undefined, undefined, emptyCtx
    );
    const emptyPromptValid = emptyPrompt.includes('## Knowledge Context') && emptyPrompt.includes('No relevant knowledge was retrieved.');
    addResult('Empty Context Prompt', emptyPromptValid, 'Prompt assembles with empty context');
  } else if (emptyCtx === null) {
    addResult('Empty Result Path', true, 'Returned null (acceptable)');
  } else {
    // Low threshold (0.35) may return results for any query; verify the serialized output is valid
    const emptySerialized = serializeKnowledgeContext(emptyCtx);
    const hasValidOutput = emptySerialized.includes('## Knowledge Context') && emptySerialized.includes('Status:');
    addResult(
      'Degraded Path Valid',
      hasValidOutput,
      `Returned ${emptyCtx.selectedCount} items with valid serialization`,
      `Top sim: ${emptyCtx.primaryKnowledge[0]?.similarity?.toFixed(3) ?? 'N/A'}`
    );
  }

  // Test with undefined context (simulating retrieval failure)
  const undefinedPrompt = WRITING_PROMPT(
    '测试主题',
    { title: 'Test', hook: 'Test', structure: [], keyArguments: [], emotionalArc: { start: 'a', middle: 'b', end: 'c' }, callToAction: 'Test', tone: 'Test', estimatedWordCount: 100 },
    { title: 'Test', angle: 'Test', targetEmotion: 'Test', keyPoints: [] },
    'douyin',
    undefined, undefined, undefined, undefined, undefined, undefined, undefined
  );
  const noKnowledgeBlock = !undefinedPrompt.includes('## Knowledge Context');
  addResult('Undefined Context → No Block', noKnowledgeBlock, 'Prompt without knowledge context has no Knowledge block');

  // ─── Step 7: Performance Summary ───────────────────────────────────────
  console.log('');
  console.log('--- Step 7: Performance Summary ---');

  const avgRetrievalTime = successfulRetrievals > 0 ? totalRetrievalTime / (successfulRetrievals + failedRetrievals) : 0;
  addResult(
    'Avg Retrieval Latency',
    avgRetrievalTime < 5000,
    `Average: ${avgRetrievalTime.toFixed(0)}ms across ${successfulRetrievals + failedRetrievals} queries`,
    `Total: ${totalRetrievalTime.toFixed(0)}ms`
  );

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('');
  console.log('=== Summary ===');
  const passed_count = results.filter((r) => r.passed).length;
  const failed_count = results.filter((r) => !r.passed).length;
  console.log(`Total: ${results.length} checks`);
  console.log(`Passed: ${passed_count}`);
  console.log(`Failed: ${failed_count}`);
  console.log('');

  if (failed_count > 0) {
    console.log('Failed checks:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ ${r.name}: ${r.message}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ All checks passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
