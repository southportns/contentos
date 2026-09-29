/**
 * P0.6.3.1 — Memory Shared Types
 *
 * Shared type definitions for the Memory Layer.
 *
 * This module defines MemoryContextPayload which is the Context Layer's
 * view of memory data. It is used by the memoryRecordToContext bridge.
 *
 * Architecture Position:
 *   Memory Layer defines MemoryContextPayload (its own notion of memory payload).
 *   Context Layer imports it rather than defining its own duplicate.
 *
 * Design Principles:
 *   1. Single source of truth for MemoryContextPayload
 *   2. Memory Layer is the owner of memory payload structure
 *   3. Context Layer views MemoryContextPayload as a context sub-type
 */

import type { MemoryKind } from './memory-kind';

/**
 * Payload structure for memory data used in ContextObject.
 *
 * This interface is defined in the Memory Layer but consumed
 * by the Context Layer's ContextObject<MemoryContextPayload>.
 *
 * Fields:
 * - memoryKind: The memory kind (static/dynamic/episodic/semantic)
 * - memoryType: The memory type discriminator (e.g., 'writing_profile', 'draft')
 * - value: The actual memory payload data
 * - importance: Importance score (0.0 - 1.0) for context assembly ranking
 * - confidence: Confidence score (0.0 - 1.0) for reliability
 * - accessCount: Number of times this memory has been accessed
 * - lastAccessedAt: Last access timestamp
 * - expiresAt: Expiration timestamp
 * - status: Lifecycle status
 */
export interface MemoryContextPayload {
  /** The memory kind (static/dynamic/episodic/semantic) */
  memoryKind: MemoryKind;

  /** The memory type discriminator (e.g., 'writing_profile', 'draft') */
  memoryType?: string | null;

  /** The actual memory payload data */
  value?: unknown;

  /** Importance score (0.0 - 1.0) for context assembly ranking */
  importance?: number | null;

  /** Confidence score (0.0 - 1.0) for reliability assessment */
  confidence?: number | null;

  /** Number of times this memory has been accessed */
  accessCount?: number | null;

  /** Last access timestamp (ISO 8601) */
  lastAccessedAt?: string | null;

  /** Expiration timestamp (ISO 8601). null = never expires. */
  expiresAt?: string | null;

  /** Lifecycle status of this memory */
  status?: 'active' | 'superseded' | 'expired' | 'archived' | null;
}
