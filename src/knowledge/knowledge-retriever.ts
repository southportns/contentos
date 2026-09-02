/**
 * P0.2.3 — Knowledge Retriever (Keyword-based)
 *
 * First implementation: Lexical / Rule-based Retrieval.
 * No LLM, no embeddings, no vector database.
 *
 * Pipeline:
 *   1. Extract keywords from topic/keywords input
 *   2. Filter index entries (metadata + safety filters)
 *   3. Score and rank entries by keyword relevance
 *   4. Return Top K results
 */

import {
  KnowledgeIndexEntry,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalResponse,
  KnowledgeQuery,
  DEFAULT_QUERY,
} from './types';
import { extractKeywords } from './knowledge-index';
import { rankEntries } from './knowledge-ranker';

// ─── Main Retrieval Function ─────────────────────────────────────────────────

/**
 * Execute a keyword-based retrieval against pre-filtered index entries.
 *
 * @param indexEntries - Pre-filtered list of index entries (filters applied)
 * @param query - Knowledge query with topic/keywords
 * @returns Retrieval response with ranked results
 */
export function retrieve(
  indexEntries: KnowledgeIndexEntry[],
  query: KnowledgeQuery
): KnowledgeRetrievalResponse {
  const limit = query.limit ?? DEFAULT_QUERY.limit;

  // 1. Build keyword list from topic + explicit keywords
  const allKeywords: string[] = [];

  if (query.topic) {
    allKeywords.push(...extractKeywords(query.topic));
  }

  if (query.keywords && query.keywords.length > 0) {
    allKeywords.push(...query.keywords.map((k) => k.toLowerCase()));
  }

  // Deduplicate
  const uniqueKeywords = [...new Set(allKeywords)];

  // 2. If no keywords at all, return empty
  if (uniqueKeywords.length === 0) {
    return {
      query: query.topic ?? '',
      results: [],
      total: 0,
    };
  }

  // 3. Rank entries
  const ranked = rankEntries(indexEntries, uniqueKeywords);

  // 4. Take top K
  const topK = ranked.slice(0, limit);

  return {
    query: query.topic ?? query.keywords?.join(' ') ?? '',
    results: topK,
    total: topK.length,
  };
}

/**
 * Convenience: Search and return raw results (no response wrapper).
 */
export function searchEntries(
  indexEntries: KnowledgeIndexEntry[],
  topic: string,
  limit: number = DEFAULT_QUERY.limit
): KnowledgeRetrievalResult[] {
  const response = retrieve(indexEntries, { topic, limit });
  return response.results;
}
