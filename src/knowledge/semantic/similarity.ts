/**
 * P0.3.1 — Vector Similarity
 *
 * Implements cosine similarity and related vector comparison utilities.
 * All functions are pure and handle edge cases safely (no NaN or Infinity).
 */

/**
 * Compute cosine similarity between two vectors.
 *
 * Formula:
 *   similarity = (a · b) / (||a|| * ||b||)
 *
 * Returns a value in the range [-1, 1].
 *
 * Edge case handling:
 * - Empty vectors → returns 0
 * - Zero vectors → returns 0
 * - Different dimensions → throws error (caller must ensure consistency)
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in range [-1, 1]
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  // Handle null/undefined
  if (!a || !b) {
    return 0;
  }

  // Handle empty vectors
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  // Dimension mismatch — cannot compute
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: a.length=${a.length}, b.length=${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];

    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors (division by zero)
  if (magnitude === 0) {
    return 0;
  }

  const similarity = dotProduct / magnitude;

  // Clamp to valid range to avoid floating point edge cases
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Compute cosine similarity normalized to [0, 1] range.
 * Useful for ranking where negative similarity is not meaningful.
 *
 * Returns: (cosineSimilarity + 1) / 2
 */
export function normalizedCosineSimilarity(a: number[], b: number[]): number {
  return (cosineSimilarity(a, b) + 1) / 2;
}

/**
 * Find the most similar vector in a list of candidates.
 *
 * @param query - The query vector
 * @param candidates - Array of candidate vectors with their IDs
 * @returns The ID and similarity of the most similar candidate
 * @throws Error if candidates is empty
 */
export function findMostSimilar(
  query: number[],
  candidates: Array<{ id: string; vector: number[] }>
): { id: string; similarity: number } {
  if (candidates.length === 0) {
    throw new Error('Cannot find most similar from empty candidate list');
  }

  let bestId = candidates[0].id;
  let bestSimilarity = -Infinity;

  for (const candidate of candidates) {
    const sim = cosineSimilarity(query, candidate.vector);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestId = candidate.id;
    }
  }

  return { id: bestId, similarity: bestSimilarity };
}

/**
 * Rank a list of vectors by similarity to a query vector.
 *
 * @param query - The query vector
 * @param candidates - Array of candidate vectors with their IDs
 * @returns Sorted array (highest similarity first) with similarity scores
 */
export function rankBySimilarity(
  query: number[],
  candidates: Array<{ id: string; vector: number[] }>
): Array<{ id: string; similarity: number }> {
  return candidates
    .map((c) => ({
      id: c.id,
      similarity: cosineSimilarity(query, c.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}