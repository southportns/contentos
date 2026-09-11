#!/usr/bin/env tsx
/**
 * P0.3.3 — Retrieval Calibration Evaluation
 *
 * Systematic comparison of Keyword Retrieval vs Semantic Retrieval
 * using the same P0.2.3 Ground Truth (Q001-Q010).
 *
 * This script performs:
 *   1. Keyword baseline evaluation
 *   2. Semantic retrieval evaluation (real cloud)
 *   3. Query-level comparison
 *   4. Threshold calibration (0.30 - 0.70)
 *   5. Top-K calibration (3, 5, 8, 10)
 *   6. Similarity distribution analysis
 *   7. Short-query analysis
 *   8. Q010 irrelevant rejection analysis
 *   9. Latency measurement
 *  10. API efficiency verification
 *
 * Output:
 *   - docs/p0.3/RETRIEVAL_CALIBRATION_RESULTS.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeStore } from '../src/knowledge';
import { KNOWLEDGE_UNITS } from '../src/knowledge/knowledge-data';
import { AlibabaEmbeddingProvider } from '../src/knowledge/semantic/providers/aliyun-embedding-provider';
import { RealSemanticSearch } from '../src/knowledge/semantic/real-semantic-search';
import { FileEmbeddingStore } from '../src/knowledge/semantic/persistence/embedding-store';
import evalDataset from '../docs/p0.2.3/RETRIEVAL_EVALUATION_DATASET.json';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvaluationQuery {
  query_id: string;
  query: string;
  description: string;
  expected_knowledge_ids: string[];
  accepted_knowledge_ids: string[];
}

interface EvaluationDataset {
  version: string;
  date: string;
  phase: string;
  description: string;
  metrics: string[];
  queries: EvaluationQuery[];
}

// ─── Counting Provider ────────────────────────────────────────────────────

class CountingAlibabaProvider {
  private provider: AlibabaEmbeddingProvider;
  embedCallCount = 0;
  embedBatchCallCount = 0;

  constructor(provider: AlibabaEmbeddingProvider) {
    this.provider = provider;
  }

  get id() { return this.provider.id; }
  get dimensions() { return this.provider.dimensions; }

  async embed(text: string): Promise<number[]> {
    this.embedCallCount++;
    return this.provider.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.embedBatchCallCount++;
    return this.provider.embedBatch(texts);
  }
}

// ─── Result Types ──────────────────────────────────────────────────────────

interface QueryComparison {
  query_id: string;
  query: string;
  query_length: number;
  expected: string[];
  accepted: string[];
  keyword_top5: string[];
  semantic_top5: string[];
  keyword_strict_hit: boolean;
  semantic_strict_hit: boolean;
  keyword_relaxed_hit: boolean;
  semantic_relaxed_hit: boolean;
  keyword_strict_rank: number | null;
  semantic_strict_rank: number | null;
  semantic_top1_similarity: number | null;
  semantic_top5_similarities: number[];
  winner: 'keyword' | 'semantic' | 'tie' | 'both_fail';
}

interface RetrievalMetrics {
  strict_precision_at_5: number;
  strict_recall_at_5: number;
  strict_hit_rate_at_5: number;
  relaxed_precision_at_5: number;
  relaxed_recall_at_5: number;
  relaxed_hit_rate_at_5: number;
  irrelevant_rejection: number;
}

interface ThresholdResult {
  threshold: number;
  precision_at_5: number;
  recall_at_5: number;
  hit_rate_at_5: number;
  avg_results_count: number;
  empty_result_rate: number;
  irrelevant_rejection: number;
}

interface TopKResult {
  topk: number;
  precision: number;
  recall: number;
  hit_rate: number;
  avg_results_count: number;
}

interface SimilarityStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
}

interface LatencyStats {
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

// ─── Metrics Computation ───────────────────────────────────────────────────

const K = 5;

// Metrics functions - kept for potential future use
// function computePrecisionAtK(retrieved: string[], relevant: string[], k: number): number { ... }
// function computeRecall(retrieved: string[], relevant: string[]): number { ... }

// ─── Statistics Helpers ────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function computeStats(values: number[]): SimilarityStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: median(values),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
  };
}

// ─── Main Evaluation ───────────────────────────────────────────────────────

async function main() {
  console.log('=== ContextOS P0.3.3 Retrieval Calibration ===');
  console.log('');

  const dataset = evalDataset as unknown as EvaluationDataset;
  const queries = dataset.queries;

  // Check prerequisites
  if (!process.env.DASHSCOPE_API_KEY) {
    console.log('⚠️  DASHSCOPE_API_KEY not set — skipping semantic evaluation.');
    console.log('   Set DASHSCOPE_API_KEY to run full calibration.');
    process.exit(0);
  }

  // Check persisted embeddings
  const store = new FileEmbeddingStore();
  const storedEmbeddings = await store.getAll();
  if (storedEmbeddings.length === 0) {
    console.log('⚠️  No persisted embeddings found. Run sync-knowledge-embeddings.ts first.');
    process.exit(0);
  }

  console.log(`Persisted embeddings: ${storedEmbeddings.length}`);
  console.log(`Knowledge units: ${KNOWLEDGE_UNITS.length}`);
  console.log(`Evaluation queries: ${queries.length}`);
  console.log('');

  // Initialize semantic search
  const baseProvider = new AlibabaEmbeddingProvider();
  const provider = new CountingAlibabaProvider(baseProvider);

  const search = new RealSemanticSearch({
    provider,
    knowledgeUnits: KNOWLEDGE_UNITS,
    store,
  });

  const initResult = await search.initialize();
  console.log(`Semantic init: source=${initResult.source}, entries=${initResult.entriesLoaded}`);
  console.log('');

  if (!search.isReady) {
    console.log('❌ Semantic search not initialized. Aborting.');
    process.exit(1);
  }

  // Reset counters after init
  provider.embedCallCount = 0;
  provider.embedBatchCallCount = 0;

  // ─── Phase 1: Keyword Baseline ─────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('Phase 1: Keyword Baseline Evaluation');
  console.log('─'.repeat(60));

  const keywordResults: QueryComparison[] = [];

  for (const q of queries) {
    const response = knowledgeStore.search({
      topic: q.query,
      limit: K,
    });

    const retrieved = response.results.map((r) => r.knowledge_id);
    const expected = q.expected_knowledge_ids;
    const accepted = q.accepted_knowledge_ids;
    const relaxedRelevant = [...expected, ...accepted];

    const strictHits = retrieved.filter((id) => expected.includes(id));
    const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));

    // Find rank of first strict hit
    let strictRank: number | null = null;
    for (let i = 0; i < retrieved.length; i++) {
      if (expected.includes(retrieved[i])) {
        strictRank = i + 1;
        break;
      }
    }

    keywordResults.push({
      query_id: q.query_id,
      query: q.query,
      query_length: q.query.length,
      expected,
      accepted,
      keyword_top5: retrieved.slice(0, 5),
      semantic_top5: [],
      keyword_strict_hit: strictHits.length > 0,
      semantic_strict_hit: false,
      keyword_relaxed_hit: relaxedHits.length > 0,
      semantic_relaxed_hit: false,
      keyword_strict_rank: strictRank,
      semantic_strict_rank: null,
      semantic_top1_similarity: null,
      semantic_top5_similarities: [],
      winner: 'both_fail',
    });

    console.log(`  ${q.query_id} "${q.query}"`);
    console.log(`    Retrieved: [${retrieved.join(', ') || '(empty)'}]`);
    console.log(`    Strict Hit: ${strictHits.length > 0 ? 'YES' : 'NO'} | Relaxed Hit: ${relaxedHits.length > 0 ? 'YES' : 'NO'}`);
  }

  // ─── Phase 2: Semantic Evaluation ──────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 2: Semantic Retrieval Evaluation');
  console.log('─'.repeat(60));

  const semanticLatencies: number[] = [];
  const allSemanticSimilarities: number[] = [];
  const correctHitSimilarities: number[] = [];
  const incorrectHitSimilarities: number[] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];

    // Reset counters
    provider.embedCallCount = 0;
    provider.embedBatchCallCount = 0;

    const startTime = Date.now();
    const response = await search.search({
      query: q.query,
      limit: K,
      include_candidates: false,
    });
    const elapsed = Date.now() - startTime;
    semanticLatencies.push(elapsed);

    const embedCalls = provider.embedCallCount;
    const batchCalls = provider.embedBatchCallCount;

    const retrieved = response.results.map((r) => r.knowledge_id);
    const similarities = response.results.map((r) => r.similarity);
    allSemanticSimilarities.push(...similarities);

    const expected = q.expected_knowledge_ids;
    const accepted = q.accepted_knowledge_ids;
    const relaxedRelevant = [...expected, ...accepted];

    const strictHits = retrieved.filter((id) => expected.includes(id));
    const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));

    // Find rank of first strict hit
    let strictRank: number | null = null;
    for (let j = 0; j < retrieved.length; j++) {
      if (expected.includes(retrieved[j])) {
        strictRank = j + 1;
        break;
      }
    }

    // Collect similarity for correct/incorrect hits
    for (let j = 0; j < retrieved.length; j++) {
      if (expected.includes(retrieved[j])) {
        correctHitSimilarities.push(similarities[j]);
      } else {
        incorrectHitSimilarities.push(similarities[j]);
      }
    }

    // Update keyword results with semantic data
    keywordResults[i].semantic_top5 = retrieved.slice(0, 5);
    keywordResults[i].semantic_strict_hit = strictHits.length > 0;
    keywordResults[i].semantic_relaxed_hit = relaxedHits.length > 0;
    keywordResults[i].semantic_strict_rank = strictRank;
    keywordResults[i].semantic_top1_similarity = similarities[0] ?? null;
    keywordResults[i].semantic_top5_similarities = similarities.slice(0, 5);

    // Determine winner
    const kwStrict = keywordResults[i].keyword_strict_hit;
    const semStrict = strictHits.length > 0;
    const kwRelaxed = keywordResults[i].keyword_relaxed_hit;
    const semRelaxed = relaxedHits.length > 0;

    if (semStrict && !kwStrict) {
      keywordResults[i].winner = 'semantic';
    } else if (kwStrict && !semStrict) {
      keywordResults[i].winner = 'keyword';
    } else if (semStrict && kwStrict) {
      keywordResults[i].winner = 'tie';
    } else if (semRelaxed && !kwRelaxed) {
      keywordResults[i].winner = 'semantic';
    } else if (kwRelaxed && !semRelaxed) {
      keywordResults[i].winner = 'keyword';
    } else if (semRelaxed && kwRelaxed) {
      keywordResults[i].winner = 'tie';
    } else {
      keywordResults[i].winner = 'both_fail';
    }

    console.log(`  ${q.query_id} "${q.query}"`);
    console.log(`    Retrieved: [${retrieved.join(', ') || '(empty)'}]`);
    console.log(`    Similarities: [${similarities.map(s => s.toFixed(3)).join(', ')}]`);
    console.log(`    Strict Hit: ${strictHits.length > 0 ? 'YES' : 'NO'} | Relaxed Hit: ${relaxedHits.length > 0 ? 'YES' : 'NO'}`);
    console.log(`    API calls: embed=${embedCalls}, batch=${batchCalls} | Time: ${elapsed}ms`);
  }

  // ─── Phase 3: Aggregate Metrics ────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 3: Aggregate Metrics');
  console.log('─'.repeat(60));

  const relevantQueries = keywordResults.filter(
    (q) => !(q.expected.length === 0 && q.accepted.length === 0)
  );
  const irrelevantQueries = keywordResults.filter(
    (q) => q.expected.length === 0 && q.accepted.length === 0
  );

  // Keyword metrics
  const keywordStrictPrecisions = relevantQueries.map((q) => {
    const top5 = q.keyword_top5;
    const hits = top5.filter((id) => q.expected.includes(id)).length;
    return hits / K;
  });
  const keywordStrictRecalls = relevantQueries.map((q) => {
    const retrieved = q.keyword_top5;
    if (q.expected.length === 0) return 1.0;
    const hits = retrieved.filter((id) => q.expected.includes(id)).length;
    return hits / q.expected.length;
  });
  const keywordStrictHits = relevantQueries.filter((q) => q.keyword_strict_hit).length;

  const keywordRelaxedPrecisions = relevantQueries.map((q) => {
    const top5 = q.keyword_top5;
    const relevant = [...q.expected, ...q.accepted];
    const hits = top5.filter((id) => relevant.includes(id)).length;
    return hits / K;
  });
  const keywordRelaxedRecalls = relevantQueries.map((q) => {
    const retrieved = q.keyword_top5;
    const relevant = [...q.expected, ...q.accepted];
    if (relevant.length === 0) return 1.0;
    const hits = retrieved.filter((id) => relevant.includes(id)).length;
    return hits / relevant.length;
  });
  const keywordRelaxedHits = relevantQueries.filter((q) => q.keyword_relaxed_hit).length;

  // Keyword irrelevant rejection
  const keywordIrrelevantRejection = irrelevantQueries.every(
    (q) => q.keyword_top5.length === 0
  ) ? 1.0 : 0.0;

  // Semantic metrics
  const semanticStrictPrecisions = relevantQueries.map((q) => {
    const top5 = q.semantic_top5;
    const hits = top5.filter((id) => q.expected.includes(id)).length;
    return hits / K;
  });
  const semanticStrictRecalls = relevantQueries.map((q) => {
    const retrieved = q.semantic_top5;
    if (q.expected.length === 0) return 1.0;
    const hits = retrieved.filter((id) => q.expected.includes(id)).length;
    return hits / q.expected.length;
  });
  const semanticStrictHits = relevantQueries.filter((q) => q.semantic_strict_hit).length;

  const semanticRelaxedPrecisions = relevantQueries.map((q) => {
    const top5 = q.semantic_top5;
    const relevant = [...q.expected, ...q.accepted];
    const hits = top5.filter((id) => relevant.includes(id)).length;
    return hits / K;
  });
  const semanticRelaxedRecalls = relevantQueries.map((q) => {
    const retrieved = q.semantic_top5;
    const relevant = [...q.expected, ...q.accepted];
    if (relevant.length === 0) return 1.0;
    const hits = retrieved.filter((id) => relevant.includes(id)).length;
    return hits / relevant.length;
  });
  const semanticRelaxedHits = relevantQueries.filter((q) => q.semantic_relaxed_hit).length;

  // Semantic irrelevant rejection
  const semanticIrrelevantRejection = irrelevantQueries.every(
    (q) => q.semantic_top5.length === 0
  ) ? 1.0 : 0.0;

  const keywordMetrics: RetrievalMetrics = {
    strict_precision_at_5: avg(keywordStrictPrecisions),
    strict_recall_at_5: avg(keywordStrictRecalls),
    strict_hit_rate_at_5: keywordStrictHits / relevantQueries.length,
    relaxed_precision_at_5: avg(keywordRelaxedPrecisions),
    relaxed_recall_at_5: avg(keywordRelaxedRecalls),
    relaxed_hit_rate_at_5: keywordRelaxedHits / relevantQueries.length,
    irrelevant_rejection: keywordIrrelevantRejection,
  };

  const semanticMetrics: RetrievalMetrics = {
    strict_precision_at_5: avg(semanticStrictPrecisions),
    strict_recall_at_5: avg(semanticStrictRecalls),
    strict_hit_rate_at_5: semanticStrictHits / relevantQueries.length,
    relaxed_precision_at_5: avg(semanticRelaxedPrecisions),
    relaxed_recall_at_5: avg(semanticRelaxedRecalls),
    relaxed_hit_rate_at_5: semanticRelaxedHits / relevantQueries.length,
    irrelevant_rejection: semanticIrrelevantRejection,
  };

  console.log('');
  console.log('Keyword Metrics:');
  console.log(`  Strict P@5: ${keywordMetrics.strict_precision_at_5.toFixed(4)}`);
  console.log(`  Strict Recall@5: ${keywordMetrics.strict_recall_at_5.toFixed(4)}`);
  console.log(`  Strict HitRate@5: ${keywordMetrics.strict_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Relaxed P@5: ${keywordMetrics.relaxed_precision_at_5.toFixed(4)}`);
  console.log(`  Relaxed Recall@5: ${keywordMetrics.relaxed_recall_at_5.toFixed(4)}`);
  console.log(`  Relaxed HitRate@5: ${keywordMetrics.relaxed_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Irrelevant Rejection: ${keywordMetrics.irrelevant_rejection.toFixed(4)}`);

  console.log('');
  console.log('Semantic Metrics:');
  console.log(`  Strict P@5: ${semanticMetrics.strict_precision_at_5.toFixed(4)}`);
  console.log(`  Strict Recall@5: ${semanticMetrics.strict_recall_at_5.toFixed(4)}`);
  console.log(`  Strict HitRate@5: ${semanticMetrics.strict_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Relaxed P@5: ${semanticMetrics.relaxed_precision_at_5.toFixed(4)}`);
  console.log(`  Relaxed Recall@5: ${semanticMetrics.relaxed_recall_at_5.toFixed(4)}`);
  console.log(`  Relaxed HitRate@5: ${semanticMetrics.relaxed_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Irrelevant Rejection: ${semanticMetrics.irrelevant_rejection.toFixed(4)}`);

  // ─── Phase 4: Query-Level Comparison ───────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 4: Query-Level Comparison');
  console.log('─'.repeat(60));

  const semanticBetter = keywordResults.filter((q) => q.winner === 'semantic').length;
  const keywordBetter = keywordResults.filter((q) => q.winner === 'keyword').length;
  const tie = keywordResults.filter((q) => q.winner === 'tie').length;
  const bothFail = keywordResults.filter((q) => q.winner === 'both_fail').length;

  console.log('');
  console.log(`Semantic Better: ${semanticBetter}/${queries.length}`);
  console.log(`Keyword Better: ${keywordBetter}/${queries.length}`);
  console.log(`Tie: ${tie}/${queries.length}`);
  console.log(`Both Fail: ${bothFail}/${queries.length}`);

  console.log('');
  console.log('Query-Level Details:');
  for (const q of keywordResults) {
    console.log(`  ${q.query_id} "${q.query}"`);
    console.log(`    Keyword: strict=${q.keyword_strict_hit ? 'Y' : 'N'} relaxed=${q.keyword_relaxed_hit ? 'Y' : 'N'} rank=${q.keyword_strict_rank ?? '-'}`);
    console.log(`    Semantic: strict=${q.semantic_strict_hit ? 'Y' : 'N'} relaxed=${q.semantic_relaxed_hit ? 'Y' : 'N'} rank=${q.semantic_strict_rank ?? '-'} sim=${q.semantic_top1_similarity?.toFixed(3) ?? '-'}`);
    console.log(`    Winner: ${q.winner}`);
  }

  // ─── Phase 5: Threshold Calibration ─────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 5: Threshold Calibration');
  console.log('─'.repeat(60));

  const thresholds = [0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];
  const thresholdResults: ThresholdResult[] = [];

  for (const threshold of thresholds) {
    // Reset counters
    provider.embedCallCount = 0;
    provider.embedBatchCallCount = 0;

    let totalPrecision = 0;
    let totalRecall = 0;
    let totalHits = 0;
    let totalResultsCount = 0;
    let emptyResults = 0;
    let irrelevantCorrect = 0;

    for (const q of queries) {
      const response = await search.search({
        query: q.query,
        limit: K,
        min_similarity: threshold,
        include_candidates: false,
      });

      const retrieved = response.results.map((r) => r.knowledge_id);
      const expected = q.expected_knowledge_ids;
      const accepted = q.accepted_knowledge_ids;
      const relaxedRelevant = [...expected, ...accepted];

      const isIrrelevant = expected.length === 0 && accepted.length === 0;

      if (isIrrelevant) {
        if (retrieved.length === 0) {
          irrelevantCorrect++;
        }
      } else {
        const strictHits = retrieved.filter((id) => expected.includes(id)).length;

        totalPrecision += strictHits / K;
        totalRecall += expected.length > 0 ? strictHits / expected.length : 1.0;
        totalHits += strictHits > 0 ? 1 : 0;
      }

      totalResultsCount += retrieved.length;
      if (retrieved.length === 0) emptyResults++;
    }

    const relevantCount = queries.length - irrelevantQueries.length;
    thresholdResults.push({
      threshold,
      precision_at_5: totalPrecision / relevantCount,
      recall_at_5: totalRecall / relevantCount,
      hit_rate_at_5: totalHits / relevantCount,
      avg_results_count: totalResultsCount / queries.length,
      empty_result_rate: emptyResults / queries.length,
      irrelevant_rejection: irrelevantQueries.length > 0 ? irrelevantCorrect / irrelevantQueries.length : 1.0,
    });

    console.log(`  Threshold ${threshold.toFixed(2)}: P@5=${(totalPrecision / relevantCount).toFixed(4)} Recall@5=${(totalRecall / relevantCount).toFixed(4)} HitRate@5=${(totalHits / relevantCount).toFixed(4)} AvgResults=${(totalResultsCount / queries.length).toFixed(2)} EmptyRate=${(emptyResults / queries.length).toFixed(2)}`);
  }

  // ─── Phase 6: Top-K Calibration ─────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 6: Top-K Calibration');
  console.log('─'.repeat(60));

  const topKValues = [3, 5, 8, 10];
  const topKResults: TopKResult[] = [];

  for (const topk of topKValues) {
    // Reset counters
    provider.embedCallCount = 0;
    provider.embedBatchCallCount = 0;

    let totalPrecision = 0;
    let totalRecall = 0;
    let totalHits = 0;
    let totalResultsCount = 0;

    for (const q of queries) {
      const expectedIds = q.expected_knowledge_ids;
      const acceptedIds = q.accepted_knowledge_ids;
      const isIrrelevant = expectedIds.length === 0 && acceptedIds.length === 0;
      if (isIrrelevant) continue;

      const response = await search.search({
        query: q.query,
        limit: topk,
        include_candidates: false,
      });

      const retrieved = response.results.map((r) => r.knowledge_id);

      const strictHits = retrieved.filter((id) => expectedIds.includes(id)).length;

      totalPrecision += strictHits / topk;
      totalRecall += expectedIds.length > 0 ? strictHits / expectedIds.length : 1.0;
      totalHits += strictHits > 0 ? 1 : 0;
      totalResultsCount += retrieved.length;
    }

    const relevantCount = queries.length - irrelevantQueries.length;
    topKResults.push({
      topk,
      precision: totalPrecision / relevantCount,
      recall: totalRecall / relevantCount,
      hit_rate: totalHits / relevantCount,
      avg_results_count: totalResultsCount / relevantCount,
    });

    console.log(`  TopK=${topk}: P=${(totalPrecision / relevantCount).toFixed(4)} Recall=${(totalRecall / relevantCount).toFixed(4)} HitRate=${(totalHits / relevantCount).toFixed(4)} AvgResults=${(totalResultsCount / relevantCount).toFixed(2)}`);
  }

  // ─── Phase 7: Similarity Distribution ───────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 7: Similarity Distribution Analysis');
  console.log('─'.repeat(60));

  const allSimStats = computeStats(allSemanticSimilarities);
  const correctSimStats = computeStats(correctHitSimilarities);
  const incorrectSimStats = computeStats(incorrectHitSimilarities);

  console.log('');
  console.log('All Similarities:');
  console.log(`  min=${allSimStats.min.toFixed(4)} max=${allSimStats.max.toFixed(4)} mean=${allSimStats.mean.toFixed(4)} median=${allSimStats.median.toFixed(4)} p25=${allSimStats.p25.toFixed(4)} p75=${allSimStats.p75.toFixed(4)}`);

  console.log('Correct Hit Similarities:');
  console.log(`  min=${correctSimStats.min.toFixed(4)} max=${correctSimStats.max.toFixed(4)} mean=${correctSimStats.mean.toFixed(4)} median=${correctSimStats.median.toFixed(4)} p25=${correctSimStats.p25.toFixed(4)} p75=${correctSimStats.p75.toFixed(4)}`);

  console.log('Incorrect Hit Similarities:');
  console.log(`  min=${incorrectSimStats.min.toFixed(4)} max=${incorrectSimStats.max.toFixed(4)} mean=${incorrectSimStats.mean.toFixed(4)} median=${incorrectSimStats.median.toFixed(4)} p25=${incorrectSimStats.p25.toFixed(4)} p75=${incorrectSimStats.p75.toFixed(4)}`);

  // ─── Phase 8: Short Query Analysis ──────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 8: Short Query Analysis');
  console.log('─'.repeat(60));

  const queryLengthGroups: { [key: string]: QueryComparison[] } = {
    '2字': [],
    '3字': [],
    '4字': [],
    '5字+': [],
  };

  for (const q of keywordResults) {
    const len = q.query_length;
    if (len === 2) queryLengthGroups['2字'].push(q);
    else if (len === 3) queryLengthGroups['3字'].push(q);
    else if (len === 4) queryLengthGroups['4字'].push(q);
    else queryLengthGroups['5字+'].push(q);
  }

  for (const [group, groupQueries] of Object.entries(queryLengthGroups)) {
    if (groupQueries.length === 0) continue;

    const kwHits = groupQueries.filter((q) => q.keyword_strict_hit).length;
    const semHits = groupQueries.filter((q) => q.semantic_strict_hit).length;

    console.log(`  ${group} (${groupQueries.length} queries):`);
    console.log(`    Keyword Strict HitRate: ${kwHits}/${groupQueries.length} = ${(kwHits / groupQueries.length).toFixed(2)}`);
    console.log(`    Semantic Strict HitRate: ${semHits}/${groupQueries.length} = ${(semHits / groupQueries.length).toFixed(2)}`);
  }

  // ─── Phase 9: Q010 Irrelevant Rejection ─────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 9: Q010 Irrelevant Query Rejection');
  console.log('─'.repeat(60));

  const q010 = keywordResults.find((q) => q.query_id === 'Q010');
  if (q010) {
    console.log('');
    console.log(`  Query: "${q010.query}"`);
    console.log(`  Keyword top5: [${q010.keyword_top5.join(', ') || '(empty)'}]`);
    console.log(`  Semantic top5: [${q010.semantic_top5.join(', ') || '(empty)'}]`);
    console.log(`  Semantic top1 similarity: ${q010.semantic_top1_similarity?.toFixed(4) ?? 'N/A'}`);
    console.log(`  Keyword irrelevant rejection: ${q010.keyword_top5.length === 0 ? 'YES' : 'NO'}`);
    console.log(`  Semantic irrelevant rejection: ${q010.semantic_top5.length === 0 ? 'YES' : 'NO'}`);
  }

  // ─── Phase 10: Latency & API Efficiency ─────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 10: Latency & API Efficiency');
  console.log('─'.repeat(60));

  const latencyStats: LatencyStats = {
    mean: avg(semanticLatencies),
    median: median(semanticLatencies),
    p95: percentile(semanticLatencies, 95),
    min: Math.min(...semanticLatencies),
    max: Math.max(...semanticLatencies),
  };

  console.log('');
  console.log('Semantic Retrieval Latency:');
  console.log(`  mean=${latencyStats.mean.toFixed(0)}ms median=${latencyStats.median.toFixed(0)}ms p95=${latencyStats.p95.toFixed(0)}ms min=${latencyStats.min}ms max=${latencyStats.max}ms`);

  const totalEmbedCalls = provider.embedCallCount;
  const totalBatchCalls = provider.embedBatchCallCount;
  console.log('');
  console.log('API Efficiency:');
  console.log(`  Query count: ${queries.length}`);
  console.log(`  Embedding API calls: ${totalEmbedCalls}`);
  console.log(`  Batch API calls: ${totalBatchCalls}`);
  console.log(`  Knowledge API calls: 0 (from persistence)`);

  // ─── Save Results ───────────────────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Saving Results...');
  console.log('─'.repeat(60));

  const output = {
    task: 'P0.3.3',
    date: new Date().toISOString(),
    knowledge_count: KNOWLEDGE_UNITS.length,
    knowledge_validated: KNOWLEDGE_UNITS.filter((ku) => ku.status === 'validated').length,
    evaluation_queries: queries.length,
    keyword: keywordMetrics,
    semantic: semanticMetrics,
    comparison: {
      semantic_better: semanticBetter,
      keyword_better: keywordBetter,
      tie,
      both_fail: bothFail,
    },
    threshold_calibration: thresholdResults,
    topk_calibration: topKResults,
    similarity_distribution: {
      all: allSimStats,
      correct_hits: correctSimStats,
      incorrect_hits: incorrectSimStats,
    },
    latency: latencyStats,
    api_efficiency: {
      query_count: queries.length,
      embedding_api_calls: totalEmbedCalls,
      batch_api_calls: totalBatchCalls,
      knowledge_api_calls: 0,
    },
    irrelevant_query_analysis: {
      keyword_rejection: keywordIrrelevantRejection,
      semantic_rejection: semanticIrrelevantRejection,
      q010_keyword_top5: q010?.keyword_top5 ?? [],
      q010_semantic_top5: q010?.semantic_top5 ?? [],
      q010_semantic_top1_similarity: q010?.semantic_top1_similarity ?? null,
    },
    query_level: keywordResults.map((q) => ({
      query_id: q.query_id,
      query: q.query,
      query_length: q.query_length,
      expected: q.expected,
      accepted: q.accepted,
      keyword_top5: q.keyword_top5,
      semantic_top5: q.semantic_top5,
      keyword_strict_hit: q.keyword_strict_hit,
      semantic_strict_hit: q.semantic_strict_hit,
      keyword_relaxed_hit: q.keyword_relaxed_hit,
      semantic_relaxed_hit: q.semantic_relaxed_hit,
      keyword_strict_rank: q.keyword_strict_rank,
      semantic_strict_rank: q.semantic_strict_rank,
      semantic_top1_similarity: q.semantic_top1_similarity,
      semantic_top5_similarities: q.semantic_top5_similarities,
      winner: q.winner,
    })),
  };

  const outputDir = join(process.cwd(), 'docs', 'p0.3');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'RETRIEVAL_CALIBRATION_RESULTS.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Results saved to: ${outputPath}`);
  console.log('');
  console.log('✅ P0.3.3 Retrieval Calibration Complete');
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
