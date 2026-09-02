/**
 * P0.2.3 — Knowledge Data
 *
 * Canonical Knowledge Unit dataset loaded from validated source.
 * Source: docs/p0.2.2.1/VALIDATED_KNOWLEDGE_UNITS.json
 *
 * This file imports the validated JSON and re-exports as typed data.
 */

import validatedDataset from '../../docs/p0.2.2.1/VALIDATED_KNOWLEDGE_UNITS.json';
import type { CanonicalKnowledgeUnit, KnowledgeDatasetSource } from './types';

// ─── Validated Dataset ───────────────────────────────────────────────────────

const dataset = validatedDataset as unknown as KnowledgeDatasetSource;

/**
 * All 24 Knowledge Units from the validated dataset.
 */
export const KNOWLEDGE_UNITS: CanonicalKnowledgeUnit[] =
  dataset.knowledge_units;

/**
 * Dataset metadata.
 */
export const DATASET_META = {
  version: dataset.version,
  date: dataset.date,
  phase: dataset.phase,
  total_knowledge_units: dataset.total_knowledge_units,
};
