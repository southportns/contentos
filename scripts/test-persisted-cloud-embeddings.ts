#!/usr/bin/env tsx
/**
 * P0.3.2-2 — Cloud Embedding Persistence Smoke Test
 *
 * This script verifies the full persistence pipeline with real cloud API.
 * Requires DASHSCOPE_API_KEY environment variable.
 *
 * Flow:
 *   1. Clear temporary test storage
 *   2. Sync eligible Knowledge (first sync = API calls)
 *   3. Output statistics
 *   4. Sync again (second sync = 0 API calls)
 *   5. Verify second sync produces no new API calls
 *
 * Safety:
 *   - Uses TEMPORARY test storage (not production data)
 *   - Does NOT modify VALIDATED_KNOWLEDGE_UNITS.json
 *   - Cleans up test storage on completion
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { syncKnowledgeEmbeddings } from '../src/knowledge/semantic/persistence/embedding-sync';
import { FileEmbeddingStore, EmbeddingStoreError } from '../src/knowledge/semantic/persistence/embedding-store';
import { AlibabaEmbeddingProvider } from '../src/knowledge/semantic/providers/aliyun-embedding-provider';
import { KNOWLEDGE_UNITS } from '../src/knowledge/knowledge-data';

// ─── Configuration ────────────────────────────────────────────────────────

const TEST_STORAGE_PATH = join(
  process.cwd(),
  'data',
  'knowledge',
  'test-embeddings-smoke.json'
);

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ContextOS Persistence Cloud Smoke Test ===');
  console.log('');

  // Check API key
  if (!process.env.DASHSCOPE_API_KEY) {
    console.log('⚠️  DASHSCOPE_API_KEY not set — skipping cloud smoke test.');
    console.log('   Set DASHSCOPE_API_KEY to run this test.');
    process.exit(0);
  }

  // Clean up any previous test storage
  cleanupTestStorage();

  try {
    // Create provider
    const provider = new AlibabaEmbeddingProvider();
    console.log(`Provider: ${provider.id}`);
    console.log(`Model: text-embedding-v4`);
    console.log(`Dimensions: ${provider.dimensions}`);
    console.log('');

    // Create test store
    const store = new FileEmbeddingStore(TEST_STORAGE_PATH);

    // ─── First Sync ──────────────────────────────────────────────────────
    console.log('--- First Sync ---');
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

    if (result1.failed > 0) {
      console.error('❌ First sync had failures');
      process.exit(1);
    }

    if (result1.created === 0) {
      console.error('❌ First sync created 0 embeddings (unexpected)');
      process.exit(1);
    }

    // ─── Second Sync ─────────────────────────────────────────────────────
    console.log('--- Second Sync (should reuse all) ---');
    const result2 = await syncKnowledgeEmbeddings(KNOWLEDGE_UNITS, provider, {
      storage_path: TEST_STORAGE_PATH,
    });

    console.log(`Total: ${result2.total}`);
    console.log(`Eligible: ${result2.eligible}`);
    console.log(`Created: ${result2.created}`);
    console.log(`Reused: ${result2.reused}`);
    console.log(`Updated: ${result2.updated}`);
    console.log(`Failed: ${result2.failed}`);
    console.log(`API Calls: ${result2.api_calls}`);
    console.log('');

    // ─── Verification ────────────────────────────────────────────────────
    console.log('--- Verification ---');

    let passed = true;

    // Check: second sync should have 0 API calls
    if (result2.api_calls !== 0) {
      console.log(`❌ FAIL: Second sync made ${result2.api_calls} API calls (expected 0)`);
      passed = false;
    } else {
      console.log('✅ PASS: Second sync made 0 API calls');
    }

    // Check: second sync should reuse all
    if (result2.reused !== result1.created) {
      console.log(`❌ FAIL: Second sync reused ${result2.reused} (expected ${result1.created})`);
      passed = false;
    } else {
      console.log(`✅ PASS: Second sync reused all ${result2.reused} embeddings`);
    }

    // Check: second sync should create 0
    if (result2.created !== 0) {
      console.log(`❌ FAIL: Second sync created ${result2.created} (expected 0)`);
      passed = false;
    } else {
      console.log('✅ PASS: Second sync created 0 new embeddings');
    }

    // Check: second sync should update 0
    if (result2.updated !== 0) {
      console.log(`❌ FAIL: Second sync updated ${result2.updated} (expected 0)`);
      passed = false;
    } else {
      console.log('✅ PASS: Second sync updated 0 embeddings');
    }

    // Check: storage has records
    const storedCount = (await store.getAll()).length;
    if (storedCount !== result1.created) {
      console.log(`❌ FAIL: Storage has ${storedCount} records (expected ${result1.created})`);
      passed = false;
    } else {
      console.log(`✅ PASS: Storage has ${storedCount} records`);
    }

    console.log('');

    if (passed) {
      console.log('🎉 All checks passed!');
    } else {
      console.log('💥 Some checks failed.');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof EmbeddingStoreError) {
      console.error(`Store error: ${error.message}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  } finally {
    // Clean up test storage
    cleanupTestStorage();
  }
}

function cleanupTestStorage() {
  if (existsSync(TEST_STORAGE_PATH)) {
    unlinkSync(TEST_STORAGE_PATH);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  cleanupTestStorage();
  process.exit(1);
});
