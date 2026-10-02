import type { MemoryRetriever } from './memory-retriever';
import type { OutcomeAggregationService } from './outcome-aggregation-service';
import { OutcomeAggregationServiceImpl } from './outcome-aggregation-service';
import type {
  OutcomeAggregationParams,
  OutcomeAggregation,
  OutcomeAggregationSeries,
  OutcomeTrendParams,
  OutcomeTrendResult,
} from './outcome-aggregation';
import {
  retrieveOutcomeMemoriesWithMetadata,
} from './outcome-memory-retrieval';
import type {
  OutcomeRetrievalParams,
  OutcomeRetrievalMetadata,
} from './outcome-memory-retrieval';
import { MAX_OUTCOME_HISTORY_LIMIT } from './outcome-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregation Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

export async function aggregateOutcomeMemories(
  retriever: MemoryRetriever,
  params: OutcomeAggregationParams,
  service: OutcomeAggregationService = new OutcomeAggregationServiceImpl(),
): Promise<OutcomeAggregation> {
  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    targetType: params.targetType,
    targetId: params.targetId,
    outcomeType: params.outcomeType,
    limit: params.retrievalLimit ?? MAX_OUTCOME_HISTORY_LIMIT,
  };

  const retrievalResult = await retrieveOutcomeMemoriesWithMetadata(retriever, retrievalParams);
  const aggregation = service.aggregate(retrievalResult.outcomes, params);

  if (retrievalResult.metadata.truncated) {
    aggregation.completeness = 'bounded';
  }

  return aggregation;
}

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

  const retrievalResult = await retrieveOutcomeMemoriesWithMetadata(retriever, retrievalParams);
  const series = service.aggregateTimeSeries(retrievalResult.outcomes, params, granularity);

  if (retrievalResult.metadata.truncated) {
    series.completeness = 'bounded';
  }

  return series;
}

export async function compareOutcomeMemoriesWindows(
  retriever: MemoryRetriever,
  params: OutcomeTrendParams,
  service: OutcomeAggregationService = new OutcomeAggregationServiceImpl(),
): Promise<OutcomeTrendResult> {
  const retrievalParams: OutcomeRetrievalParams = {
    ownerId: params.ownerId,
    projectId: params.projectId,
    topicId: params.topicId,
    targetType: params.targetType,
    targetId: params.targetId,
    outcomeType: params.outcomeType,
    limit: params.retrievalLimit ?? MAX_OUTCOME_HISTORY_LIMIT,
  };

  const retrievalResult = await retrieveOutcomeMemoriesWithMetadata(retriever, retrievalParams);
  const trendResult = service.compareWindows(retrievalResult.outcomes, params);

  if (retrievalResult.metadata.truncated) {
    trendResult.completeness = 'bounded';
    trendResult.currentWindow.completeness = 'bounded';
    trendResult.previousWindow.completeness = 'bounded';
  }

  return trendResult;
}

export type { OutcomeRetrievalMetadata };
