/**
 * P0.6.5.4 — Outcome Aggregation Entry Point
 *
 * Connects the Aggregation Layer to the existing Outcome Retrieval layer.
 *
 * Architecture Position:
 *
 *   aggregateOutcomeMemories()
 *       ↓ (reuses)
 *   retrieveOutcomeMemories()  (from outcome-memory-retrieval.ts)
 *       ↓
 *   MemoryRetriever
 *       ↓
 *   Database
 *       ↓
 *   OutcomeMemory[]
 *       ↓
 *   OutcomeAggregationServiceImpl.aggregate()
 *       ↓
 *   OutcomeAggregation
 *
 * Design Principles:
 *   1. REUSES existing Outcome retrieval — no new DB query path
 *   2. REUSES existing Outcome Aggregation Service — no duplication
 *   3. Applies parameter-level filtering AGAIN after retrieval (defense-in-depth)
 *   4. Honest completeness reporting based on retrieval bounds
 */

import type { MemoryRetriever } from './memory-retriever';
import type { OutcomeMemory } from './outcome-memory';
import type { OutcomeAggregationService } from './outcome-aggregation-service';
import { OutcomeAggregationServiceImpl } from './outcome-aggregation-service';
import type {
  OutcomeAggregationParams,
  OutcomeAggregation,
  OutcomeAggregationSeries,
  OutcomeTrendParams,
  OutcomeTrendResult,
} from './outcome-aggregation';
import { retrieveOutcomeMemories } from './outcome-memory-retrieval';
import type { OutcomeRetrievalParams } from './outcome-memory-retrieval';
import { MAX_OUTCOME_HISTORY_LIMIT } from './outcome-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregation Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregate outcome memories using the existing retrieval pipeline.
 *
 * This is the primary entry point for applications that want aggregation
 * data from the database. It:
 * 1. Reuses retrieveOutcomeMemories() — no new DB queries
 * 2. Passes results through OutcomeAggregationServiceImpl.aggregate()
 * 3. Reports completeness based on retrieval bounds
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Aggregation parameters (owner, filters, window)
 * @param service - Optional custom aggregation service (default: new instance)
 * @return Aggregation result
 * @throws Error if windowStart >= windowEnd
 */
export async function aggregateOutcomeMemories(
  retriever: MemoryRetriever,
  params: OutcomeAggregationParams,
  service: OutcomeAggregationService = new OutcomeAggregationServiceImpl(),
): Promise<OutcomeAggregation> {
  // Build retrieval params from aggregation params
  // We request up to retrievalLimit outcomes within the window
  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    targetType: params.targetType,
    targetId: params.targetId,
    outcomeType: params.outcomeType,
    limit: params.retrievalLimit ?? MAX_OUTCOME_HISTORY_LIMIT,
  };

  // Reuse existing Outcome retrieval
  const outcomes = await retrieveOutcomeMemories(retriever, retrievalParams);

  // Aggregate the retrieved outcomes
  return service.aggregate(outcomes, params);
}

/**
 * Aggregate outcomes into time series using the existing retrieval pipeline.
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Aggregation parameters (owner, filters, window)
 * @param granularity - Day or week bucketing
 * @param service - Optional custom aggregation service
 * @return Time-series aggregation result
 */
export async function aggregateOutcomeMemoriesTimeSeries(
  retriever: MemoryRetriever,
  params: Omit<OutcomeAggregationParams, 'aggregationFunctions'>,
  granularity: 'day' | 'week',
  service: OutcomeAggregationService = new OutcomeAggregationServiceImpl(),
): Promise<OutcomeAggregationSeries> {
  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    targetType: params.targetType,
    targetId: params.targetId,
    outcomeType: params.outcomeType,
    limit: params.retrievalLimit ?? MAX_OUTCOME_HISTORY_LIMIT,
  };

  // Reuse existing Outcome retrieval
  const outcomes = await retrieveOutcomeMemories(retriever, retrievalParams);

  // Aggregate into time series
  return service.aggregateTimeSeries(outcomes, params, granularity);
}

/**
 * Compare two adjacent windows using the existing retrieval pipeline.
 *
 * @param retriever - MemoryRetriever implementation
 * @param params - Trend parameters (owner, filters, current window)
 * @param service - Optional custom aggregation service
 * @return Trend comparison result
 */
export async function compareOutcomeMemoriesWindows(
  retriever: MemoryRetriever,
  params: OutcomeTrendParams,
  service: OutcomeAggregationService = new OutcomeAggregationServiceImpl(),
): Promise<OutcomeTrendResult> {
  // We need outcomes from BOTH windows, so extend retrieval to cover previous window
  const currentStart = new Date(params.windowStart).getTime();
  const currentEnd = new Date(params.windowEnd).getTime();
  const windowLength = currentEnd - currentStart;
  const previousStart = new Date(currentStart - windowLength).toISOString();

  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    targetType: params.targetType,
    targetId: params.targetId,
    outcomeType: params.outcomeType,
    limit: params.retrievalLimit ?? MAX_OUTCOME_HISTORY_LIMIT,
  };

  // Reuse existing Outcome retrieval
  // Note: retrieveOutcomeMemories doesn't have a time window filter,
  // so we retrieve broadly and let the service filter
  const outcomes = await retrieveOutcomeMemories(retriever, retrievalParams);

  // Use the service to compare windows (which does parameter-level filtering)
  return service.compareWindows(outcomes, params);
}
