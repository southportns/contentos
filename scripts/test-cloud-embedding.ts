#!/usr/bin/env tsx
/**
 * P0.3.2-1 — Cloud Embedding Smoke Test
 *
 * Tests the AlibabaEmbeddingProvider with real DashScope API.
 * Requires DASHSCOPE_API_KEY environment variable.
 *
 * Usage:
 *   npx tsx scripts/test-cloud-embedding.ts
 *
 * This script is NOT part of npm test.
 * It requires a real API key and makes real API calls.
 */

import { AlibabaEmbeddingProvider } from '../src/knowledge/semantic/providers/aliyun-embedding-provider';

async function main() {
  console.log('=== ContextOS Cloud Embedding Smoke Test ===\n');

  // Check for API key
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.log('⚠️  DASHSCOPE_API_KEY not set.');
    console.log('   Set the environment variable to run this test.');
    console.log('   Example: DASHSCOPE_API_KEY=your-key npx tsx scripts/test-cloud-embedding.ts');
    process.exit(0);
  }

  // Create provider
  let provider: AlibabaEmbeddingProvider;
  try {
    provider = new AlibabaEmbeddingProvider();
  } catch (error) {
    console.error('❌ Failed to create provider:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`Provider: ${provider.id}`);
  console.log(`Model: text-embedding-v4`);
  console.log(`Dimensions: ${provider.dimensions}`);
  console.log('');

  // Test embedding
  const testText = '一个女人要学会建立自己的价值感';
  console.log(`Test text: "${testText}"`);
  console.log('Calling DashScope API...');

  const startTime = Date.now();
  try {
    const vector = await provider.embed(testText);
    const elapsed = Date.now() - startTime;

    // Validate
    const isValid =
      vector.length === 1024 &&
      vector.every((v) => typeof v === 'number' && Number.isFinite(v));

    console.log(`\n✅ Success!`);
    console.log(`   Dimensions: ${vector.length}`);
    console.log(`   Vector valid: ${isValid}`);
    console.log(`   Sample values: [${vector.slice(0, 5).map((v) => v.toFixed(6)).join(', ')}, ...]`);
    console.log(`   Time: ${elapsed}ms`);

    // Test batch
    console.log('\n--- Batch Test ---');
    const batchTexts = [
      '一个女人要学会建立自己的价值感',
      '如何找到自己的人生方向',
      '自我成长的关键是什么',
    ];
    console.log(`Batch size: ${batchTexts.length}`);

    const batchStart = Date.now();
    const batchVectors = await provider.embedBatch(batchTexts);
    const batchElapsed = Date.now() - batchStart;

    console.log(`✅ Batch success!`);
    console.log(`   Vectors: ${batchVectors.length}`);
    console.log(`   All valid: ${batchVectors.every((v) => v.length === 1024 && v.every((n) => Number.isFinite(n)))}`);
    console.log(`   Time: ${batchElapsed}ms`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`\n❌ Failed after ${elapsed}ms`);

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if ('status' in error) {
        console.error(`   Status: ${(error as { status?: number }).status ?? 'N/A'}`);
      }
      if ('retryable' in error) {
        console.error(`   Retryable: ${(error as { retryable?: boolean }).retryable}`);
      }
    }

    process.exit(1);
  }

  console.log('\n=== Smoke Test Complete ===');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
