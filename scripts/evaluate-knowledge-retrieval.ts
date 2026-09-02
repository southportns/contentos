/**
 * P0.2.3-FIX — Retrieval Evaluation Runner
 *
 * Runs the evaluation dataset against the real KnowledgeStore.
 * Computes Strict and Relaxed Precision@5, Recall@5, HitRate@5.
 * Also reports Irrelevant Query Rejection Rate.
 *
 * Run: npx tsx scripts/evaluate-knowledge-retrieval.ts
 */

import { knowledgeStore } from '../src/knowledge';
import evalDataset from '../docs/p0.2.3/RETRIEVAL_EVALUATION_DATASET.json';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface QueryResult {
  query_id: string;
  query: string;
  expected: string[];
  accepted: string[];
  retrieved: string[];
  strict_hits: string[];
  relaxed_hits: string[];
  strict_precision_at_5: number;
  strict_recall_at_5: number;
  strict_hit: boolean;
  relaxed_precision_at_5: number;
  relaxed_recall_at_5: number;
  relaxed_hit: boolean;
  is_irrelevant_query: boolean;
  correct_rejection: boolean;
}

interface EvaluationResults {
  version: string;
  evaluated_at: string;
  k: number;
  metrics: {
    strict: {
      precision_at_5: number;
      recall_at_5: number;
      hit_rate_at_5: number;
    };
    relaxed: {
      precision_at_5: number;
      recall_at_5: number;
      hit_rate_at_5: number;
    };
    irrelevant_query_rejection_rate: number;
  };
  queries: QueryResult[];
  summary: {
    best_query: { id: string; query: string; precision: number };
    worst_query: { id: string; query: string; precision: number };
    zero_hit_queries: string[];
    false_positive_queries: string[];
  };
}

// ─── Evaluation Logic ────────────────────────────────────────────────────────

const K = 5;
const dataset = evalDataset as unknown as EvaluationDataset;

function computePrecisionAtK(
  retrieved: string[],
  relevant: string[],
  k: number
): number {
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.includes(id)).length;
  return hits / k;
}

function computeRecall(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1.0; // No relevant items = perfect recall
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / relevant.length;
}

function runEvaluation(): EvaluationResults {
  const results: QueryResult[] = [];

  for (const q of dataset.queries) {
    // Execute real search through the complete pipeline
    const response = knowledgeStore.search({
      topic: q.query,
      limit: K,
    });

    const retrieved = response.results.map((r) => r.knowledge_id);
    const expected = q.expected_knowledge_ids;
    const accepted = q.accepted_knowledge_ids;
    const relaxedRelevant = [...expected, ...accepted];

    // Strict metrics (expected only)
    const strictHits = retrieved.filter((id) => expected.includes(id));
    const strictPrecision = computePrecisionAtK(retrieved, expected, K);
    const strictRecall = computeRecall(retrieved, expected);
    const strictHit = strictHits.length > 0;

    // Relaxed metrics (expected + accepted)
    const relaxedHits = retrieved.filter((id) => relaxedRelevant.includes(id));
    const relaxedPrecision = computePrecisionAtK(retrieved, relaxedRelevant, K);
    const relaxedRecall = computeRecall(retrieved, relaxedRelevant);
    const relaxedHit = relaxedHits.length > 0;

    // Irrelevant query detection
    const isIrrelevant = expected.length === 0 && accepted.length === 0;
    const correctRejection = isIrrelevant && retrieved.length === 0;

    results.push({
      query_id: q.query_id,
      query: q.query,
      expected,
      accepted,
      retrieved,
      strict_hits: strictHits,
      relaxed_hits: relaxedHits,
      strict_precision_at_5: strictPrecision,
      strict_recall_at_5: strictRecall,
      strict_hit: strictHit,
      relaxed_precision_at_5: relaxedPrecision,
      relaxed_recall_at_5: relaxedRecall,
      relaxed_hit: relaxedHit,
      is_irrelevant_query: isIrrelevant,
      correct_rejection: correctRejection,
    });
  }

  // Compute aggregate metrics
  const relevantQueries = results.filter((r) => !r.is_irrelevant_query);
  const irrelevantQueries = results.filter((r) => r.is_irrelevant_query);

  // Strict metrics (only on relevant queries)
  const strictPrecisions = relevantQueries.map((r) => r.strict_precision_at_5);
  const strictRecalls = relevantQueries.map((r) => r.strict_recall_at_5);
  const strictHits = relevantQueries.filter((r) => r.strict_hit).length;

  const strictPrecisionAvg =
    strictPrecisions.length > 0
      ? strictPrecisions.reduce((a, b) => a + b, 0) / strictPrecisions.length
      : 0;
  const strictRecallAvg =
    strictRecalls.length > 0
      ? strictRecalls.reduce((a, b) => a + b, 0) / strictRecalls.length
      : 0;
  const strictHitRate =
    relevantQueries.length > 0 ? strictHits / relevantQueries.length : 0;

  // Relaxed metrics (only on relevant queries)
  const relaxedPrecisions = relevantQueries.map((r) => r.relaxed_precision_at_5);
  const relaxedRecalls = relevantQueries.map((r) => r.relaxed_recall_at_5);
  const relaxedHits = relevantQueries.filter((r) => r.relaxed_hit).length;

  const relaxedPrecisionAvg =
    relaxedPrecisions.length > 0
      ? relaxedPrecisions.reduce((a, b) => a + b, 0) / relaxedPrecisions.length
      : 0;
  const relaxedRecallAvg =
    relaxedRecalls.length > 0
      ? relaxedRecalls.reduce((a, b) => a + b, 0) / relaxedRecalls.length
      : 0;
  const relaxedHitRate =
    relevantQueries.length > 0 ? relaxedHits / relevantQueries.length : 0;

  // Irrelevant query rejection rate
  const correctRejections = irrelevantQueries.filter(
    (r) => r.correct_rejection
  ).length;
  const irrelevantRejectionRate =
    irrelevantQueries.length > 0
      ? correctRejections / irrelevantQueries.length
      : 1.0;

  // Best / Worst queries (by strict precision on relevant queries)
  const sortedByPrecision = [...relevantQueries].sort(
    (a, b) => b.strict_precision_at_5 - a.strict_precision_at_5
  );
  const best = sortedByPrecision[0];
  const worst = sortedByPrecision[sortedByPrecision.length - 1];

  // Zero hit queries
  const zeroHitQueries = relevantQueries
    .filter((r) => !r.strict_hit)
    .map((r) => `${r.query_id} (${r.query})`);

  // False positive queries (irrelevant queries that returned results)
  const falsePositiveQueries = irrelevantQueries
    .filter((r) => !r.correct_rejection)
    .map((r) => `${r.query_id} (${r.query})`);

  return {
    version: '1.0',
    evaluated_at: new Date().toISOString(),
    k: K,
    metrics: {
      strict: {
        precision_at_5: Math.round(strictPrecisionAvg * 100) / 100,
        recall_at_5: Math.round(strictRecallAvg * 100) / 100,
        hit_rate_at_5: Math.round(strictHitRate * 100) / 100,
      },
      relaxed: {
        precision_at_5: Math.round(relaxedPrecisionAvg * 100) / 100,
        recall_at_5: Math.round(relaxedRecallAvg * 100) / 100,
        hit_rate_at_5: Math.round(relaxedHitRate * 100) / 100,
      },
      irrelevant_query_rejection_rate:
        Math.round(irrelevantRejectionRate * 100) / 100,
    },
    queries: results,
    summary: {
      best_query: {
        id: best?.query_id ?? 'N/A',
        query: best?.query ?? 'N/A',
        precision: best?.strict_precision_at_5 ?? 0,
      },
      worst_query: {
        id: worst?.query_id ?? 'N/A',
        query: worst?.query ?? 'N/A',
        precision: worst?.strict_precision_at_5 ?? 0,
      },
      zero_hit_queries: zeroHitQueries,
      false_positive_queries: falsePositiveQueries,
    },
  };
}

// ─── Output Formatting ───────────────────────────────────────────────────────

function formatResults(results: EvaluationResults): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║  P0.2.3-FIX — Retrieval Evaluation Results                     ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push(`  Evaluated at: ${results.evaluated_at}`);
  lines.push(`  K: ${results.k}  |  Queries: ${results.queries.length}`);
  lines.push('');

  // Per-query results
  lines.push('─'.repeat(70));
  lines.push('  PER-QUERY RESULTS');
  lines.push('─'.repeat(70));

  for (const q of results.queries) {
    lines.push('');
    lines.push(`  ${q.query_id}  "${q.query}"`);
    lines.push(`    Expected:   [${q.expected.join(', ') || 'none'}]`);
    lines.push(`    Accepted:   [${q.accepted.join(', ') || 'none'}]`);
    lines.push(`    Retrieved:  [${q.retrieved.join(', ') || '(empty)'}]`);

    if (q.is_irrelevant_query) {
      lines.push(
        `    IRRELEVANT QUERY -> Correct rejection: ${q.correct_rejection ? 'YES' : 'NO (FALSE POSITIVE)'}`
      );
    } else {
      lines.push('');
      lines.push(`    Strict:`);
      lines.push(
        `      Hit: ${q.strict_hit ? 'YES' : 'NO'} | Precision@${results.k}: ${q.strict_precision_at_5.toFixed(2)} | Recall@${results.k}: ${q.strict_recall_at_5.toFixed(2)}`
      );
      lines.push(
        `      Hits: [${q.strict_hits.join(', ') || 'none'}]`
      );
      lines.push('');
      lines.push(`    Relaxed:`);
      lines.push(
        `      Hit: ${q.relaxed_hit ? 'YES' : 'NO'} | Precision@${results.k}: ${q.relaxed_precision_at_5.toFixed(2)} | Recall@${results.k}: ${q.relaxed_recall_at_5.toFixed(2)}`
      );
      lines.push(
        `      Hits: [${q.relaxed_hits.join(', ') || 'none'}]`
      );
    }
  }

  // Aggregate metrics
  lines.push('');
  lines.push('─'.repeat(70));
  lines.push('  AGGREGATE METRICS');
  lines.push('─'.repeat(70));
  lines.push('');
  lines.push(`  Strict Metrics (expected only):`);
  lines.push(`    Precision@${results.k}: ${results.metrics.strict.precision_at_5.toFixed(2)}`);
  lines.push(`    Recall@${results.k}:    ${results.metrics.strict.recall_at_5.toFixed(2)}`);
  lines.push(`    HitRate@${results.k}:   ${results.metrics.strict.hit_rate_at_5.toFixed(2)}`);
  lines.push('');
  lines.push(`  Relaxed Metrics (expected + accepted):`);
  lines.push(`    Precision@${results.k}: ${results.metrics.relaxed.precision_at_5.toFixed(2)}`);
  lines.push(`    Recall@${results.k}:    ${results.metrics.relaxed.recall_at_5.toFixed(2)}`);
  lines.push(`    HitRate@${results.k}:   ${results.metrics.relaxed.hit_rate_at_5.toFixed(2)}`);
  lines.push('');
  lines.push(`  Irrelevant Query Rejection Rate: ${results.metrics.irrelevant_query_rejection_rate.toFixed(2)}`);

  // Summary
  lines.push('');
  lines.push('─'.repeat(70));
  lines.push('  SUMMARY');
  lines.push('─'.repeat(70));
  lines.push('');
  lines.push(
    `  Best Query:  ${results.summary.best_query.id} "${results.summary.best_query.query}" (Strict P@${results.k}: ${results.summary.best_query.precision.toFixed(2)})`
  );
  lines.push(
    `  Worst Query: ${results.summary.worst_query.id} "${results.summary.worst_query.query}" (Strict P@${results.k}: ${results.summary.worst_query.precision.toFixed(2)})`
  );
  lines.push('');
  lines.push(`  Zero Hit Queries: ${results.summary.zero_hit_queries.length}`);
  for (const q of results.summary.zero_hit_queries) {
    lines.push(`    - ${q}`);
  }
  lines.push('');
  lines.push(`  False Positive Queries: ${results.summary.false_positive_queries.length}`);
  for (const q of results.summary.false_positive_queries) {
    lines.push(`    - ${q}`);
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Running retrieval evaluation...');

  const results = runEvaluation();

  // Print to console
  console.log(formatResults(results));

  // Save to JSON file
  const outputPath = path.resolve(
    __dirname,
    '../docs/p0.2.3/RETRIEVAL_EVALUATION_RESULTS.json'
  );
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Results saved to: ${outputPath}`);
  console.log('');
}

main();
