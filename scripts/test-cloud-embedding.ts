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