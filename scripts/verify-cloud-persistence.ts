#!/usr/bin/env tsx
/**
 * P0.3.2-2 — Comprehensive Cloud Persistence Verification
 *
 * This script runs all verification steps:
 * 1. Vector dimension verification
 * 2. Incremental update (modify 1 KU → only that KU re-embedded)
 * 3. Provider/Model/Dimensions change detection
 * 4. Corrupted vector rejection
 * 5. Dry run
 * 6. Force rebuild
 * 7. Storage persistence (reload)
 * 8. Semantic Index loading from persistence
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { syncKnowledgeEmbeddings, buildSemanticIndexFromStoredEmbeddings } from '../src/knowledge/semantic/persistence/embedding-sync';
import { FileEmbeddingStore, EmbeddingStoreError, MemoryEmbeddingStore } from '../src/knowledge/semantic/persistence/embedding-store';
import { AlibabaEmbeddingProvider } from '../src/knowledge/semantic/providers/aliyun-embedding-provider';
import { needsReembedding } from '../src/knowledge/semantic/persistence/embedding-cache';
import { computeKnowledgeContentHash } from '../src/knowledge/semantic/persistence/content-hash';
import { KNOWLEDGE_UNITS } from '../src/knowledge/knowledge-data';
import type { EmbeddingRecord, EmbeddingConfig } from '../src/knowledge/semantic/persistence/types';
import type { CanonicalKnowledgeUnit } from '../src/knowledge/types';

// ─── Configuration ────────────────────────────────────────────────────────

const TEST_STORAGE_PATH = join(
  process.cwd(),
  'data',
  'knowledge',
  'test-cloud-verification.json'
);

// ─── Test Results ────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${details}`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

function cleanupTestStorage() {
  if (existsSync(TEST_STORAGE_PATH)) {
    unlinkSync(TEST_STORAGE_PATH);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== P0.3.2-2 Comprehensive Cloud Persistence Verification ===');
  console.log('');

  // Check API key
  if (!process.env.DASHSCOPE_API_KEY) {
    console.log('⚠️  DASHSCOPE_API_KEY not set — skipping cloud verification.');
    process.exit(0);
  }

  cleanupTestStorage();

  try {
    // ─── Step 1: Initial Sync ────────────────────────────────────────────
    console.log('--- Step 1: Initial Sync ---');
    const provider = new AlibabaEmbeddingProvider();
    const store = new FileEmbeddingStore(TEST_STORAGE_PATH);

    const result1 = await syncKnowledgeEmbeddings(KNOWLEDGE_UNITS, provider, {
      storage_path: TEST_STORAGE_PATH,
    });

    console.log(`Total: ${result1.total}`);
    console.log(`Eligible: ${result1.eligible}`);
    console.log(`Created: ${result1.created}`);
    console.log(`Reused: ${result1.reused}`);
    console.log(`Updated: ${result1.updated}`);
    console.log(`Failed: ${result1.failed}`);
    console.log(`Skipped: ${result1.skipped}`);
    console.log(`API Calls: ${result1.api_calls}`);
    console.log('');

    addResult('Initial Sync - Created > 0', result1.created > 0, `Created ${result1.created} embeddings`);
    addResult('Initial Sync - Failed = 0', result1.failed === 0, `${result1.failed} failures`);
    addResult('Initial Sync - API Calls > 0', result1.api_calls > 0, `${result1.api_calls} API calls`);

    // ─── Step 2: Vector Dimension Verification ───────────────────────────
    console.log('--- Step 2: Vector Dimension Verification ---');
    const records = await store.getAll();
    let validVectors = 0;
    let invalidVectors = 0;

    for (const record of records) {
      const isCorrectDim = record.vector.length === record.dimensions;
      const allFinite = record.vector.every(v => Number.isFinite(v));

      if (isCorrectDim && allFinite) {
        validVectors++;
      } else {
        invalidVectors++;
      }
    }

    console.log(`Records: ${records.length}`);
    console.log(`Valid Vectors: ${validVectors}`);
    console.log(`Invalid Vectors: ${invalidVectors}`);
    console.log('');

    addResult('Vector Dimensions = 1024', records.every(r => r.dimensions === 1024), `All ${records.length} records have 1024 dimensions`);
    addResult('Vector length = 1024', records.every(r => r.vector.length === 1024), `All vectors have length 1024`);
    addResult('All values finite', invalidVectors === 0, `${validVectors} valid, ${invalidVectors} invalid`);
    addResult('Provider = aliyun-text-embedding-v4', records.every(r => r.provider_id === 'aliyun-text-embedding-v4'), 'All records have correct provider');
    addResult('Model = text-embedding-v4', records.every(r => r.model === 'text-embedding-v4'), 'All records have correct model');

    // ─── Step 3: Second Sync (Reuse) ─────────────────────────────────────
    console.log('--- Step 3: Second Sync (should reuse all) ---');
    const result2 = await syncKnowledgeEmbeddings(KNOWLEDGE_UNITS, provider, {
      storage_path: TEST_STORAGE_PATH,
    });

    console.log(`Created: ${result2.created}`);
    console.log(`Reused: ${result2.reused}`);
    console.log(`Updated: ${result2.updated}`);
    console.log(`API Calls: ${result2.api_calls}`);
    console.log('');

    addResult('Second Sync - Created = 0', result2.created === 0, `${result2.created} created`);
    addResult('Second Sync - Updated = 0', result2.updated === 0, `${result2.updated} updated`);
    addResult('Second Sync - Reused = Eligible', result2.reused === result1.eligible, `${result2.reused}/${result1.eligible} reused`);
    addResult('Second Sync - API Calls = 0', result2.api_calls === 0, `${result2.api_calls} API calls`);

    // ─── Step 4: Incremental Update ──────────────────────────────────────
    console.log('--- Step 4: Incremental Update (modify 1 KU) ---');
    const modifiedUnits = KNOWLEDGE_UNITS.map(ku => {
      if (ku.knowledge_id === KNOWLEDGE_UNITS[0].knowledge_id) {
        return { ...ku, description: ku.description + ' [TEST MODIFICATION]' };
      }
      return ku;
    });

    const result3 = await syncKnowledgeEmbeddings(modifiedUnits, provider, {
      storage_path: TEST_STORAGE_PATH,
    });

    console.log(`Created: ${result3.created}`);
    console.log(`Reused: ${result3.reused}`);
    console.log(`Updated: ${result3.updated}`);
    console.log(`API Calls: ${result3.api_calls}`);
    console.log('');

    addResult('Incremental - Updated = 1', result3.updated === 1, `${result3.updated} updated`);
    addResult('Incremental - Reused = Eligible-1', result3.reused === result1.eligible - 1, `${result3.reused}/${result1.eligible - 1} reused`);
    addResult('Incremental - API Calls = 1', result3.api_calls === 1, `${result3.api_calls} API call`);

    // ─── Step 5: Provider/Model/Dimensions Change Detection ───────────────
    console.log('--- Step 5: Provider/Model/Dimensions Change Detection ---');

    const baseConfig: EmbeddingConfig = {
      provider_id: 'aliyun-text-embedding-v4',
      model: 'text-embedding-v4',
      dimensions: 1024,
    };

    const testKU: CanonicalKnowledgeUnit = {
      knowledge_id: 'TEST_KU',
      category: 'hook',
      knowledge_level: 'surface_technique',
      name: 'Test',
      description: 'Test',
      confidence: 'medium',
      status: 'validated',
      reclassified: false,
      evidence: { items: [], unique_content_count: 0 },
    };

    const testRecord: EmbeddingRecord = {
      knowledge_id: 'TEST_KU',
      provider_id: 'aliyun-text-embedding-v4',
      model: 'text-embedding-v4',
      dimensions: 1024,
      vector: new Array(1024).fill(0.1),
      content_hash: computeKnowledgeContentHash(testKU),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_version: '2.1',
    };

    // Model change
    const modelChanged = needsReembedding(testKU, testRecord, {
      ...baseConfig,
      model: 'another-model',
    });
    addResult('Model Change → needsReembedding', modelChanged === true, `needsReembedding = ${modelChanged}`);

    // Provider change
    const providerChanged = needsReembedding(testKU, testRecord, {
      ...baseConfig,
      provider_id: 'another-provider',
    });
    addResult('Provider Change → needsReembedding', providerChanged === true, `needsReembedding = ${providerChanged}`);

    // Dimensions change
    const dimensionsChanged = needsReembedding(testKU, testRecord, {
      ...baseConfig,
      dimensions: 1536,
    });
    addResult('Dimensions Change → needsReembedding', dimensionsChanged === true, `needsReembedding = ${dimensionsChanged}`);

    // No change
    const noChange = needsReembedding(testKU, testRecord, baseConfig);
    addResult('No Change → no reembedding', noChange === false, `needsReembedding = ${noChange}`);

    // ─── Step 6: Corrupted Vector Rejection ───────────────────────────────
    console.log('');
    console.log('--- Step 6: Corrupted Vector Rejection ---');

    const memStore = new MemoryEmbeddingStore();

    // Wrong dimensions
    try {
      await memStore.upsert({
        ...testRecord,
        dimensions: 1024,
        vector: new Array(512).fill(0.1), // Wrong dimensions
      });
      addResult('Wrong Dimensions → rejected', false, 'Should have thrown');
    } catch {
      addResult('Wrong Dimensions → rejected', true, 'Throws EmbeddingStoreError');
    }

    // NaN in vector
    try {
      const nanVector = new Array(1024).fill(0.1);
      nanVector[0] = NaN;
      await memStore.upsert({
        ...testRecord,
        vector: nanVector,
      });
      addResult('NaN in vector → rejected', false, 'Should have thrown');
    } catch {
      addResult('NaN in vector → rejected', true, 'Throws EmbeddingStoreError');
    }

    // Infinity in vector
    try {
      const infVector = new Array(1024).fill(0.1);
      infVector[0] = Infinity;
      await memStore.upsert({
        ...testRecord,
        vector: infVector,
      });
      addResult('Infinity in vector → rejected', false, 'Should have thrown');
    } catch {
      addResult('Infinity in vector → rejected', true, 'Throws EmbeddingStoreError');
    }

    // ─── Step 7: Dry Run ──────────────────────────────────────────────────
    console.log('');
    console.log('--- Step 7: Dry Run ---');

    // Re-sync to restore state
    await syncKnowledgeEmbeddings(modifiedUnits, provider, {
      storage_path: TEST_STORAGE_PATH,
    });

    const dryRunResult = await syncKnowledgeEmbeddings(modifiedUnits, provider, {
      storage_path: TEST_STORAGE_PATH,
      dry_run: true,
    });

    addResult('Dry Run - API Calls = 0', dryRunResult.api_calls === 0, `${dryRunResult.api_calls} API calls`);
    addResult('Dry Run - Reports would-reuse', dryRunResult.reused === result1.eligible, `${dryRunResult.reused} would reuse`);

    // Verify storage was not modified
    const storeAfterDryRun = await store.getAll();
    addResult('Dry Run - Storage unchanged', storeAfterDryRun.length === result1.eligible, `${storeAfterDryRun.length} records`);

    // ─── Step 8: Force Rebuild ────────────────────────────────────────────
    console.log('');
    console.log('--- Step 8: Force Rebuild ---');

    const forceResult = await syncKnowledgeEmbeddings(modifiedUnits, provider, {
      storage_path: TEST_STORAGE_PATH,
      force: true,
    });

    addResult('Force Rebuild - Created = Eligible', forceResult.created === result1.eligible, `${forceResult.created}/${result1.eligible} created`);
    addResult('Force Rebuild - Reused = 0', forceResult.reused === 0, `${forceResult.reused} reused`);
    addResult('Force Rebuild - API Calls > 0', forceResult.api_calls > 0, `${forceResult.api_calls} API calls`);

    // ─── Step 9: Storage Persistence (Reload) ─────────────────────────────
    console.log('');
    console.log('--- Step 9: Storage Persistence (Reload) ---');

    // Create a new store instance (simulating process restart)
    const newStore = new FileEmbeddingStore(TEST_STORAGE_PATH);
    const reloadedRecords = await newStore.getAll();

    addResult('Persistence - Records survive reload', reloadedRecords.length === result1.eligible, `${reloadedRecords.length} records after reload`);
    addResult('Persistence - Dimensions correct', reloadedRecords.every(r => r.dimensions === 1024), 'All 1024 dimensions');
    addResult('Persistence - Vectors intact', reloadedRecords.every(r => r.vector.length === 1024 && r.vector.every(v => Number.isFinite(v))), 'All vectors valid');

    // ─── Step 10: Semantic Index from Persistence ────────────────────────
    console.log('');
    console.log('--- Step 10: Semantic Index from Persistence ---');

    const semanticIndex = await buildSemanticIndexFromStoredEmbeddings(
      newStore,
      modifiedUnits,
      provider
    );

    addResult('Semantic Index - Loaded', semanticIndex !== null, semanticIndex ? `${semanticIndex.entries.length} entries` : 'null');
    addResult('Semantic Index - Size matches', semanticIndex !== null && semanticIndex.entries.length === result1.eligible, `${semanticIndex?.entries.length}/${result1.eligible} entries`);
    addResult('Semantic Index - Dimensions = 1024', semanticIndex?.dimensions === 1024, `${semanticIndex?.dimensions} dimensions`);
    addResult('Semantic Index - Provider correct', semanticIndex?.provider_id === 'aliyun-text-embedding-v4', semanticIndex?.provider_id || 'N/A');

    // ─── Summary ──────────────────────────────────────────────────────────
    console.log('');
    console.log('=== Summary ===');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}`);

    if (failed > 0) {
      console.log('');
      console.log('Failed tests:');
      for (const r of results.filter(r => !r.passed)) {
        console.log(`  - ${r.name}: ${r.details}`);
      }
      process.exit(1);
    }

    console.log('');
    console.log('🎉 All verification checks passed!');
  } catch (error) {
    if (error instanceof EmbeddingStoreError) {
      console.error(`Store error: ${error.message}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  } finally {
    cleanupTestStorage();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  cleanupTestStorage();
  process.exit(1);
});
