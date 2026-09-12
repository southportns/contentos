#!/usr/bin/env tsx
/**
 * P0.3.5 — Retrieval Evaluation V2
 *
 * Comprehensive evaluation using the expanded dataset (Q001-Q090).
 * Evaluates both Keyword Retrieval and Semantic Retrieval, producing:
 *   - Per-query results with strict/relaxed hit analysis
 *   - Aggregate metrics (P@5, Recall@5, HitRate@5)
 *   - Negative rejection rate
 *   - Query-type breakdown
 *   - Threshold calibration (0.30-0.70)
 *   - Query length analysis
 *   - Dataset statistics
 *
 * Output:
 *   - docs/p0.3/RETRIEVAL_EVALUATION_V2_RESULTS.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeStore } from '../src/knowledge';
import { KNOWLEDGE_UNITS } from '../src/knowledge/knowledge-data';
import { AlibabaEmbeddingProvider } from '../src/knowledge/semantic/providers/aliyun-embedding-provider';
import { RealSemanticSearch } from '../src/knowledge/semantic/real-semantic-search';
import { FileEmbeddingStore } from '../src/knowledge/semantic/persistence/embedding-store';
import evalDataset from '../docs/p0.3/RETRIEVAL_EVALUATION_DATASET_V2.json';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvaluationQuery {
  query_id: string;
  query: string;
  type: string;
  description: string;
  expected_knowledge_ids: string[];
  accepted_knowledge_ids: string[];
}

interface EvaluationDataset {
  version: string;
  date: string;
  phase: string;
  description: string;
  query_types: Record<string, string>;
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

interface QueryResult {
  query_id: string;
  query: string;
  query_length: number;
  type: string;
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

interface TypeMetrics {
  type: string;
  count: number;
  keyword_strict_hit_rate: number;
  semantic_strict_hit_rate: number;
  keyword_relaxed_hit_rate: number;
  semantic_relaxed_hit_rate: number;
  avg_semantic_top1_similarity: number;
}

interface DatasetStatistics {
  total_queries: number;
  positive_queries: number;
  negative_queries: number;
  multi_hit_queries: number;
  avg_query_length: number;
  min_query_length: number;
  max_query_length: number;
  type_distribution: Record<string, number>;
  avg_ground_truth_count: number;
  avg_accepted_count: number;
}

// ─── Statistics Helpers ────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

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

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: avg(values),
    median: median(values),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
  };
}

// ─── Main Evaluation ───────────────────────────────────────────────────────

async function main() {
  console.log('=== ContextOS P0.3.5 Retrieval Evaluation V2 ===');
  console.log('');

  const dataset = evalDataset as unknown as EvaluationDataset;
  const queries = dataset.queries;

  // Check prerequisites for semantic evaluation
  const hasDashScope = !!process.env.DASHSCOPE_API_KEY;
  let search: RealSemanticSearch | null = null;
  let provider: CountingAlibabaProvider | null = null;

  if (hasDashScope) {
    const store = new FileEmbeddingStore();
    const storedEmbeddings = await store.getAll();
    if (storedEmbeddings.length === 0) {
      console.log('⚠️  No persisted embeddings found. Run sync-knowledge-embeddings.ts first.');
      console.log('   Semantic evaluation will be skipped.');
    } else {
      console.log(`Persisted embeddings: ${storedEmbeddings.length}`);
      const baseProvider = new AlibabaEmbeddingProvider();
      provider = new CountingAlibabaProvider(baseProvider);
      search = new RealSemanticSearch({
        provider,
        knowledgeUnits: KNOWLEDGE_UNITS,
        store,
      });
      const initResult = await search.initialize();
      console.log(`Semantic init: source=${initResult.source}, entries=${initResult.entriesLoaded}`);
      if (!search.isReady) {
        console.log('❌ Semantic search not initialized. Semantic evaluation will be skipped.');
        search = null;
      }
      // Reset counters after init
      provider.embedCallCount = 0;
      provider.embedBatchCallCount = 0;
    }
  } else {
    console.log('⚠️  DASHSCOPE_API_KEY not set — semantic evaluation will be skipped.');
  }

  console.log(`Knowledge units: ${KNOWLEDGE_UNITS.length}`);
  console.log(`Evaluation queries: ${queries.length}`);
  console.log('');

  // ─── Phase 1: Dataset Statistics ───────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('Phase 1: Dataset Statistics');
  console.log('─'.repeat(60));

  const relevantQueries = queries.filter(
    (q) => !(q.expected_knowledge_ids.length === 0 && q.accepted_knowledge_ids.length === 0)
  );
  const negativeQueries = queries.filter(
    (q) => q.expected_knowledge_ids.length === 0 && q.accepted_knowledge_ids.length === 0
  );
  const multiHitQueries = queries.filter(
    (q) => q.expected_knowledge_ids.length > 1
  );

  const queryLengths = queries.map((q) => q.query.length);
  const typeDistribution: Record<string, number> = {};
  queries.forEach((q) => {
    typeDistribution[q.type] = (typeDistribution[q.type] || 0) + 1;
  });

  const gtCounts = relevantQueries.map((q) => q.expected_knowledge_ids.length);
  const acceptedCounts = queries.map((q) => q.accepted_knowledge_ids.length);

  const datasetStats: DatasetStatistics = {
    total_queries: queries.length,
    positive_queries: relevantQueries.length,
    negative_queries: negativeQueries.length,
    multi_hit_queries: multiHitQueries.length,
    avg_query_length: avg(queryLengths),
    min_query_length: Math.min(...queryLengths),
    max_query_length: Math.max(...queryLengths),
    type_distribution: typeDistribution,
    avg_ground_truth_count: avg(gtCounts),
    avg_accepted_count: avg(acceptedCounts),
  };

  console.log(`  Total Queries: ${datasetStats.total_queries}`);
  console.log(`  Positive: ${datasetStats.positive_queries}`);
  console.log(`  Negative: ${datasetStats.negative_queries}`);
  console.log(`  Multi-hit: ${datasetStats.multi_hit_queries}`);
  console.log(`  Type Distribution: ${JSON.stringify(typeDistribution)}`);
  console.log(`  Query Length: min=${datasetStats.min_query_length} max=${datasetStats.max_query_length} avg=${datasetStats.avg_query_length.toFixed(1)}`);
  console.log('');

  // ─── Phase 2: Keyword Baseline ─────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('Phase 2: Keyword Retrieval Baseline');
  console.log('─'.repeat(60));

  const results: QueryResult[] = [];

  for (const q of queries) {
    const response = knowledgeStore.search({
      topic: q.query,
      limit: 5,
    });

    const retrieved = response.results.map((r) => r.knowledge_id);
    const expected = q.expected_knowledge_ids;
    const accepted = q.accepted_knowledge_ids;
    const relaxedRelevant = [...expected, ...accepted];

    const strictHits = retrieved.filter((id) => expected.includes(id));
    const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));

    let strictRank: number | null = null;
    for (let i = 0; i < retrieved.length; i++) {
      if (expected.includes(retrieved[i])) {
        strictRank = i + 1;
        break;
      }
    }

    results.push({
      query_id: q.query_id,
      query: q.query,
      query_length: q.query.length,
      type: q.type,
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

    console.log(`  ${q.query_id} [${q.type}] "${q.query}" → [${retrieved.join(', ') || '(empty)'}] strict=${strictHits.length > 0 ? 'Y' : 'N'}`);
  }

  // ─── Phase 3: Semantic Evaluation (if available) ───────────────────────
  const semanticLatencies: number[] = [];
  const allSemanticSimilarities: number[] = [];
  const correctHitSimilarities: number[] = [];
  const incorrectHitSimilarities: number[] = [];

  if (search && provider) {
    console.log('');
    console.log('─'.repeat(60));
    console.log('Phase 3: Semantic Retrieval Evaluation');
    console.log('─'.repeat(60));

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];

      provider.embedCallCount = 0;
      provider.embedBatchCallCount = 0;

      const startTime = Date.now();
      const response = await search.search({
        query: q.query,
        limit: 5,
        include_candidates: false,
      });
      const elapsed = Date.now() - startTime;
      semanticLatencies.push(elapsed);

      const retrieved = response.results.map((r) => r.knowledge_id);
      const similarities = response.results.map((r) => r.similarity);
      allSemanticSimilarities.push(...similarities);

      const expected = q.expected_knowledge_ids;
      const accepted = q.accepted_knowledge_ids;
      const relaxedRelevant = [...expected, ...accepted];

      const strictHits = retrieved.filter((id) => expected.includes(id));
      const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));

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

      // Update result
      results[i].semantic_top5 = retrieved.slice(0, 5);
      results[i].semantic_strict_hit = strictHits.length > 0;
      results[i].semantic_relaxed_hit = relaxedHits.length > 0;
      results[i].semantic_strict_rank = strictRank;
      results[i].semantic_top1_similarity = similarities[0] ?? null;
      results[i].semantic_top5_similarities = similarities.slice(0, 5);

      // Determine winner
      const kwStrict = results[i].keyword_strict_hit;
      const semStrict = strictHits.length > 0;
      const kwRelaxed = results[i].keyword_relaxed_hit;
      const semRelaxed = relaxedHits.length > 0;

      if (semStrict && !kwStrict) results[i].winner = 'semantic';
      else if (kwStrict && !semStrict) results[i].winner = 'keyword';
      else if (semStrict && kwStrict) results[i].winner = 'tie';
      else if (semRelaxed && !kwRelaxed) results[i].winner = 'semantic';
      else if (kwRelaxed && !semRelaxed) results[i].winner = 'keyword';
      else if (semRelaxed && kwRelaxed) results[i].winner = 'tie';
      else results[i].winner = 'both_fail';

      console.log(`  ${q.query_id} [${q.type}] "${q.query}" → [${retrieved.join(', ') || '(empty)'}] sim=${similarities[0]?.toFixed(3) ?? '-'} strict=${strictHits.length > 0 ? 'Y' : 'N'}`);
    }
  } else {
    console.log('');
    console.log('⚠️  Semantic evaluation skipped (no API key or embeddings)');
  }

  // ─── Phase 4: Aggregate Metrics ────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 4: Aggregate Metrics');
  console.log('─'.repeat(60));

  // Keyword metrics
  const keywordStrictPrecisions = relevantQueries.map((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    const hits = r.keyword_top5.filter((id) => q.expected_knowledge_ids.includes(id)).length;
    return hits / 5;
  });
  const keywordStrictRecalls = relevantQueries.map((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    if (q.expected_knowledge_ids.length === 0) return 1.0;
    const hits = r.keyword_top5.filter((id) => q.expected_knowledge_ids.includes(id)).length;
    return hits / q.expected_knowledge_ids.length;
  });
  const keywordStrictHits = relevantQueries.filter((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    return r.keyword_strict_hit;
  }).length;

  const keywordRelaxedPrecisions = relevantQueries.map((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    const relevant = [...q.expected_knowledge_ids, ...q.accepted_knowledge_ids];
    const hits = r.keyword_top5.filter((id) => relevant.includes(id)).length;
    return hits / 5;
  });
  const keywordRelaxedRecalls = relevantQueries.map((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    const relevant = [...q.expected_knowledge_ids, ...q.accepted_knowledge_ids];
    if (relevant.length === 0) return 1.0;
    const hits = r.keyword_top5.filter((id) => relevant.includes(id)).length;
    return hits / relevant.length;
  });
  const keywordRelaxedHits = relevantQueries.filter((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    return r.keyword_relaxed_hit;
  }).length;

  const keywordCorrectlyRejectedCount = negativeQueries.filter((q) => {
    const r = results.find((r) => r.query_id === q.query_id)!;
    return r.keyword_top5.length === 0;
  }).length;
  const keywordIrrelevantRejection = negativeQueries.length > 0
    ? keywordCorrectlyRejectedCount / negativeQueries.length
    : 0;

  const keywordMetrics: RetrievalMetrics = {
    strict_precision_at_5: avg(keywordStrictPrecisions),
    strict_recall_at_5: avg(keywordStrictRecalls),
    strict_hit_rate_at_5: keywordStrictHits / relevantQueries.length,
    relaxed_precision_at_5: avg(keywordRelaxedPrecisions),
    relaxed_recall_at_5: avg(keywordRelaxedRecalls),
    relaxed_hit_rate_at_5: keywordRelaxedHits / relevantQueries.length,
    irrelevant_rejection: keywordIrrelevantRejection,
  };

  console.log('');
  console.log('Keyword Metrics:');
  console.log(`  Strict P@5: ${keywordMetrics.strict_precision_at_5.toFixed(4)}`);
  console.log(`  Strict Recall@5: ${keywordMetrics.strict_recall_at_5.toFixed(4)}`);
  console.log(`  Strict HitRate@5: ${keywordMetrics.strict_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Relaxed P@5: ${keywordMetrics.relaxed_precision_at_5.toFixed(4)}`);
  console.log(`  Relaxed Recall@5: ${keywordMetrics.relaxed_recall_at_5.toFixed(4)}`);
  console.log(`  Relaxed HitRate@5: ${keywordMetrics.relaxed_hit_rate_at_5.toFixed(4)}`);
  console.log(`  Irrelevant Rejection: ${keywordMetrics.irrelevant_rejection.toFixed(4)} (${keywordCorrectlyRejectedCount}/${negativeQueries.length})`);

  // Semantic metrics (if available)
  let semanticMetrics: RetrievalMetrics | null = null;
  if (search) {
    const semanticStrictPrecisions = relevantQueries.map((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      const hits = r.semantic_top5.filter((id) => q.expected_knowledge_ids.includes(id)).length;
      return hits / 5;
    });
    const semanticStrictRecalls = relevantQueries.map((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      if (q.expected_knowledge_ids.length === 0) return 1.0;
      const hits = r.semantic_top5.filter((id) => q.expected_knowledge_ids.includes(id)).length;
      return hits / q.expected_knowledge_ids.length;
    });
    const semanticStrictHits = relevantQueries.filter((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      return r.semantic_strict_hit;
    }).length;

    const semanticRelaxedPrecisions = relevantQueries.map((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      const relevant = [...q.expected_knowledge_ids, ...q.accepted_knowledge_ids];
      const hits = r.semantic_top5.filter((id) => relevant.includes(id)).length;
      return hits / 5;
    });
    const semanticRelaxedRecalls = relevantQueries.map((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      const relevant = [...q.expected_knowledge_ids, ...q.accepted_knowledge_ids];
      if (relevant.length === 0) return 1.0;
      const hits = r.semantic_top5.filter((id) => relevant.includes(id)).length;
      return hits / relevant.length;
    });
    const semanticRelaxedHits = relevantQueries.filter((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      return r.semantic_relaxed_hit;
    }).length;

    const semanticCorrectlyRejectedCount = negativeQueries.filter((q) => {
      const r = results.find((r) => r.query_id === q.query_id)!;
      return r.semantic_top5.length === 0;
    }).length;
    const semanticIrrelevantRejection = negativeQueries.length > 0
      ? semanticCorrectlyRejectedCount / negativeQueries.length
      : 0;

    semanticMetrics = {
      strict_precision_at_5: avg(semanticStrictPrecisions),
      strict_recall_at_5: avg(semanticStrictRecalls),
      strict_hit_rate_at_5: semanticStrictHits / relevantQueries.length,
      relaxed_precision_at_5: avg(semanticRelaxedPrecisions),
      relaxed_recall_at_5: avg(semanticRelaxedRecalls),
      relaxed_hit_rate_at_5: semanticRelaxedHits / relevantQueries.length,
      irrelevant_rejection: semanticIrrelevantRejection,
    };

    console.log('');
    console.log('Semantic Metrics:');
    console.log(`  Strict P@5: ${semanticMetrics.strict_precision_at_5.toFixed(4)}`);
    console.log(`  Strict Recall@5: ${semanticMetrics.strict_recall_at_5.toFixed(4)}`);
    console.log(`  Strict HitRate@5: ${semanticMetrics.strict_hit_rate_at_5.toFixed(4)}`);
    console.log(`  Relaxed P@5: ${semanticMetrics.relaxed_precision_at_5.toFixed(4)}`);
    console.log(`  Relaxed Recall@5: ${semanticMetrics.relaxed_recall_at_5.toFixed(4)}`);
    console.log(`  Relaxed HitRate@5: ${semanticMetrics.relaxed_hit_rate_at_5.toFixed(4)}`);
    console.log(`  Irrelevant Rejection: ${semanticMetrics.irrelevant_rejection.toFixed(4)} (${semanticCorrectlyRejectedCount}/${negativeQueries.length})`);
  }

  // ─── Phase 5: Query Type Breakdown ─────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 5: Query Type Breakdown');
  console.log('─'.repeat(60));

  const queryTypes = ['exact', 'paraphrase', 'concept', 'multi', 'negative', 'boundary'];
  const typeMetricsList: TypeMetrics[] = [];

  for (const type of queryTypes) {
    const typeQueries = queries.filter((q) => q.type === type);
    if (typeQueries.length === 0) continue;

    const typeResults = typeQueries.map((q) => results.find((r) => r.query_id === q.query_id)!);
    const kwStrictHits = typeResults.filter((r) => r.keyword_strict_hit).length;
    const semStrictHits = typeResults.filter((r) => r.semantic_strict_hit).length;
    const kwRelaxedHits = typeResults.filter((r) => r.keyword_relaxed_hit).length;
    const semRelaxedHits = typeResults.filter((r) => r.semantic_relaxed_hit).length;

    const top1Sims = typeResults
      .map((r) => r.semantic_top1_similarity)
      .filter((s): s is number => s !== null);

    typeMetricsList.push({
      type,
      count: typeQueries.length,
      keyword_strict_hit_rate: kwStrictHits / typeQueries.length,
      semantic_strict_hit_rate: semStrictHits / typeQueries.length,
      keyword_relaxed_hit_rate: kwRelaxedHits / typeQueries.length,
      semantic_relaxed_hit_rate: semRelaxedHits / typeQueries.length,
      avg_semantic_top1_similarity: top1Sims.length > 0 ? avg(top1Sims) : 0,
    });

    console.log(`  ${type} (${typeQueries.length}):`);
    console.log(`    Keyword Strict HitRate: ${(kwStrictHits / typeQueries.length).toFixed(3)}`);
    console.log(`    Semantic Strict HitRate: ${(semStrictHits / typeQueries.length).toFixed(3)}`);
    console.log(`    Keyword Relaxed HitRate: ${(kwRelaxedHits / typeQueries.length).toFixed(3)}`);
    console.log(`    Semantic Relaxed HitRate: ${(semRelaxedHits / typeQueries.length).toFixed(3)}`);
    if (top1Sims.length > 0) {
      console.log(`    Avg Top1 Similarity: ${avg(top1Sims).toFixed(4)}`);
    }
  }

  // ─── Phase 6: Negative Query Rejection ─────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 6: Negative Query Rejection Analysis');
  console.log('─'.repeat(60));

  const negativeResults = negativeQueries.map((q) => results.find((r) => r.query_id === q.query_id)!);
  const negativeCorrectlyRejected = negativeResults.filter((r) => r.keyword_top5.length === 0).length;
  const keywordFalsePositives = negativeQueries.length - negativeCorrectlyRejected;

  console.log(`  Negative Queries: ${negativeQueries.length}`);
  console.log(`  Keyword Correctly Rejected: ${negativeCorrectlyRejected}/${negativeQueries.length}`);
  console.log(`  Keyword False Positives: ${keywordFalsePositives}/${negativeQueries.length}`);
  console.log(`  Keyword Negative Rejection Rate: ${negativeQueries.length > 0 ? (negativeCorrectlyRejected / negativeQueries.length * 100).toFixed(1) : 0}%`);
  if (search) {
    const semanticNegativeCorrect = negativeResults.filter((r) => r.semantic_top5.length === 0).length;
    const semanticFalsePositives = negativeQueries.length - semanticNegativeCorrect;
    console.log(`  Semantic Correctly Rejected: ${semanticNegativeCorrect}/${negativeQueries.length}`);
    console.log(`  Semantic False Positives: ${semanticFalsePositives}/${negativeQueries.length}`);
    console.log(`  Semantic Negative Rejection Rate: ${negativeQueries.length > 0 ? (semanticNegativeCorrect / negativeQueries.length * 100).toFixed(1) : 0}%`);
  }

  // ─── Phase 7: Latency (if semantic) ────────────────────────────────────
  let latencyStats = null;
  if (search && semanticLatencies.length > 0) {
    console.log('');
    console.log('─'.repeat(60));
    console.log('Phase 7: Semantic Retrieval Latency');
    console.log('─'.repeat(60));

    latencyStats = {
      mean: avg(semanticLatencies),
      median: median(semanticLatencies),
      p95: percentile(semanticLatencies, 95),
      min: Math.min(...semanticLatencies),
      max: Math.max(...semanticLatencies),
    };

    console.log(`  mean=${latencyStats.mean.toFixed(0)}ms median=${latencyStats.median.toFixed(0)}ms p95=${latencyStats.p95.toFixed(0)}ms min=${latencyStats.min}ms max=${latencyStats.max}ms`);
  }

  // ─── Phase 8: Similarity Distribution (if semantic) ────────────────────
  let similarityDistribution = null;
  if (search && allSemanticSimilarities.length > 0) {
    console.log('');
    console.log('─'.repeat(60));
    console.log('Phase 8: Similarity Distribution');
    console.log('─'.repeat(60));

    const allSimStats = computeStats(allSemanticSimilarities);
    const correctSimStats = computeStats(correctHitSimilarities);
    const incorrectSimStats = computeStats(incorrectHitSimilarities);

    similarityDistribution = {
      all: allSimStats,
      correct_hits: correctSimStats,
      incorrect_hits: incorrectSimStats,
    };

    console.log(`  All: min=${allSimStats.min.toFixed(4)} max=${allSimStats.max.toFixed(4)} mean=${allSimStats.mean.toFixed(4)}`);
    console.log(`  Correct: min=${correctSimStats.min.toFixed(4)} max=${correctSimStats.max.toFixed(4)} mean=${correctSimStats.mean.toFixed(4)}`);
    console.log(`  Incorrect: min=${incorrectSimStats.min.toFixed(4)} max=${incorrectSimStats.max.toFixed(4)} mean=${incorrectSimStats.mean.toFixed(4)}`);
  }

  // ─── Phase 9: Winner Comparison ────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Phase 9: Keyword vs Semantic Comparison');
  console.log('─'.repeat(60));

  const semanticBetter = results.filter((r) => r.winner === 'semantic').length;
  const keywordBetter = results.filter((r) => r.winner === 'keyword').length;
  const tie = results.filter((r) => r.winner === 'tie').length;
  const bothFail = results.filter((r) => r.winner === 'both_fail').length;

  console.log(`  Semantic Better: ${semanticBetter}/${queries.length}`);
  console.log(`  Keyword Better: ${keywordBetter}/${queries.length}`);
  console.log(`  Tie: ${tie}/${queries.length}`);
  console.log(`  Both Fail: ${bothFail}/${queries.length}`);

  // ─── Save Results ───────────────────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(60));
  console.log('Saving Results...');
  console.log('─'.repeat(60));

  const output = {
    task: 'P0.3.5',
    date: new Date().toISOString(),
    knowledge_count: KNOWLEDGE_UNITS.length,
    knowledge_validated: KNOWLEDGE_UNITS.filter((ku) => ku.status === 'validated').length,
    evaluation_queries: queries.length,
    dataset_statistics: datasetStats,
    keyword: keywordMetrics,
    semantic: semanticMetrics,
    comparison: {
      semantic_better: semanticBetter,
      keyword_better: keywordBetter,
      tie,
      both_fail: bothFail,
    },
    type_breakdown: typeMetricsList,
    negative_rejection: {
      negative_queries: negativeQueries.length,
      keyword: {
        correctly_rejected: negativeCorrectlyRejected,
        false_positives: keywordFalsePositives,
        rejection_rate: negativeQueries.length > 0 ? negativeCorrectlyRejected / negativeQueries.length : 0,
      },
      semantic: search ? {
        correctly_rejected: negativeResults.filter((r) => r.semantic_top5.length === 0).length,
        false_positives: negativeResults.filter((r) => r.semantic_top5.length > 0).length,
        rejection_rate: negativeQueries.length > 0 ? negativeResults.filter((r) => r.semantic_top5.length === 0).length / negativeQueries.length : 0,
      } : null,
    },
    similarity_distribution: similarityDistribution,
    latency: latencyStats,
    query_level: results.map((r) => ({
      query_id: r.query_id,
      query: r.query,
      query_length: r.query_length,
      type: r.type,
      expected: r.expected,
      accepted: r.accepted,
      keyword_top5: r.keyword_top5,
      semantic_top5: r.semantic_top5,
      keyword_strict_hit: r.keyword_strict_hit,
      semantic_strict_hit: r.semantic_strict_hit,
      keyword_relaxed_hit: r.keyword_relaxed_hit,
      semantic_relaxed_hit: r.semantic_relaxed_hit,
      semantic_top1_similarity: r.semantic_top1_similarity,
      winner: r.winner,
    })),
  };

  const outputDir = join(process.cwd(), 'docs', 'p0.3');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'RETRIEVAL_EVALUATION_V2_RESULTS.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Results saved to: ${outputPath}`);
  console.log('');
  console.log('✅ P0.3.5 Retrieval Evaluation V2 Complete');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
