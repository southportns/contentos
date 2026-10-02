/**
 * @file outcome-alert-store.ts
 * @brief P0.6.5.3 Outcome Alert Store Interface & Prisma Implementation
 * @copyright Copyright 2026 ContentOS
 * @par License MIT License
 * 
 * @details Persistence contract and Prisma-backed implementation for OutcomeAlert storage.
 * Core features:
 * - CRUD operations with OCC (optimistic concurrency control)
 * - Owner-based data isolation (cross-user access blocked at query level)
 * - Fingerprint-based deduplication enforcement
 * - List filtering by status, severity, rule, outcome, project, topic
 * - listActionable convenience method for open/acknowledged alerts
 * 
 * @see OutcomeAlert for domain entity structure
 * @see OutcomeAlertService for lifecycle orchestration
 * @see OutcomeAlertListFilters for available list filter options
 */

import type { Prisma as PrismaType } from '@/generated/prisma';
import type { OutcomeAlert } from '../outcome-alert';
import type { OutcomeAlertSeverity, OutcomeAlertStatus } from '../outcome-alert';
import { MemoryConcurrencyError, MemoryNotFoundError, MemoryAuthorizationError } from './memory-persistence-types';
import { prisma } from '@/lib/prisma';

/**
 * @brief Filter options for listing OutcomeAlerts
 * @details All status/severity filters use IN clause (supports multiple values)
 */
export interface OutcomeAlertListFilters {
  /** @brief Filter by alert status(es) */
  status?: OutcomeAlertStatus[];
  /** @brief Filter by alert severity(ies) */
  severity?: OutcomeAlertSeverity[];
  /** @brief Filter by rule ID */
  ruleId?: string;
  /** @brief Filter by Outcome ID */
  outcomeId?: string;
  /** @brief Filter by project ID */
  projectId?: string;
  /** @brief Filter by topic ID */
  topicId?: string;
  /** @brief Max number of results to return */
  limit?: number;
}

/**
 * @brief OutcomeAlertStore interface (contract for DI/ mocking)
 * @details All methods enforce owner isolation: authenticatedOwnerId is required for all operations
 */
export interface OutcomeAlertStore {
  create(alert: OutcomeAlert): Promise<OutcomeAlert>;
  getById(id: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null>;
  getByFingerprint(fingerprint: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null>;
  list(authenticatedOwnerId: string, filters?: OutcomeAlertListFilters): Promise<OutcomeAlert[]>;
  listActionable(authenticatedOwnerId: string, filters?: Omit<OutcomeAlertListFilters, 'status'>): Promise<OutcomeAlert[]>;
  update(alert: OutcomeAlert, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlert>;
}

/**
 * @brief Prisma implementation of OutcomeAlertStore
 * @details Uses Prisma ORM with SQLite/PostgreSQL. All queries include ownerId WHERE clause
 * for cross-user isolation. OCC via version field on update.
 */
export class PrismaOutcomeAlertStore implements OutcomeAlertStore {
  async create(alert: OutcomeAlert): Promise<OutcomeAlert> {
    try {
      const created = await prisma.outcomeAlert.create({
        data: {
          id: alert.id, ruleId: alert.ruleId, outcomeId: alert.outcomeId, ownerId: alert.ownerId,
          projectId: alert.projectId ?? null, topicId: alert.topicId ?? null,
          severity: alert.severity, status: alert.status, title: alert.title, message: alert.message,
          matchedConditions: alert.matchedConditions ? JSON.stringify(alert.matchedConditions) : null,
          triggeredAt: new Date(alert.triggeredAt),
          acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          suppressedAt: alert.suppressedAt ? new Date(alert.suppressedAt) : null,
          createdAt: new Date(alert.createdAt), updatedAt: new Date(alert.updatedAt),
          version: alert.version, fingerprint: alert.fingerprint,
        },
      });
      return this._rowToAlert(created);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
        const prismaError = error as { code: string; meta?: { target?: string[] } };
        if (prismaError.code === 'P2002') {
          throw new MemoryConcurrencyError(alert.id, alert.version);
        }
      }
      throw error;
    }
  }

  async getById(id: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null> {
    const row = await prisma.outcomeAlert.findFirst({ where: { id, ownerId: authenticatedOwnerId } });
    if (!row) return null;
    return this._rowToAlert(row);
  }

  async getByFingerprint(fingerprint: string, authenticatedOwnerId: string): Promise<OutcomeAlert | null> {
    const row = await prisma.outcomeAlert.findFirst({ where: { fingerprint, ownerId: authenticatedOwnerId } });
    if (!row) return null;
    return this._rowToAlert(row);
  }

  async list(authenticatedOwnerId: string, filters?: OutcomeAlertListFilters): Promise<OutcomeAlert[]> {
    const where: PrismaType.OutcomeAlertWhereInput = { ownerId: authenticatedOwnerId };
    if (filters?.status?.length) where.status = filters.status.length === 1 ? filters.status[0] : { in: filters.status };
    if (filters?.severity?.length) where.severity = filters.severity.length === 1 ? filters.severity[0] : { in: filters.severity };
    if (filters?.ruleId) where.ruleId = filters.ruleId;
    if (filters?.outcomeId) where.outcomeId = filters.outcomeId;
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.topicId) where.topicId = filters.topicId;
    const rows = await prisma.outcomeAlert.findMany({ where, orderBy: [{ triggeredAt: 'desc' }], take: filters?.limit });
    return rows.map(row => this._rowToAlert(row));
  }

  async listActionable(authenticatedOwnerId: string, filters?: Omit<OutcomeAlertListFilters, 'status'>): Promise<OutcomeAlert[]> {
    return this.list(authenticatedOwnerId, { ...filters, status: ['open', 'acknowledged'] });
  }

  async update(alert: OutcomeAlert, authenticatedOwnerId: string, expectedVersion: number): Promise<OutcomeAlert> {
    if (alert.ownerId !== authenticatedOwnerId) throw new MemoryAuthorizationError(alert.id);
    const newVersion = expectedVersion + 1;
    const now = new Date().toISOString();
    try {
      const updated = await prisma.outcomeAlert.updateMany({
        where: { id: alert.id, ownerId: authenticatedOwnerId, version: expectedVersion },
        data: {
          status: alert.status, title: alert.title, message: alert.message,
          matchedConditions: alert.matchedConditions ? JSON.stringify(alert.matchedConditions) : null,
          acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          suppressedAt: alert.suppressedAt ? new Date(alert.suppressedAt) : null,
          updatedAt: new Date(now),
          version: newVersion,
        },
      });
      if (updated.count === 0) throw new MemoryConcurrencyError(alert.id, expectedVersion, expectedVersion);
      return { ...alert, version: newVersion, updatedAt: now };
    } catch (error: unknown) {
      if (error instanceof MemoryConcurrencyError) throw error;
      throw error;
    }
  }

  private _rowToAlert(row: PrismaType.OutcomeAlertGetPayload<{}>): OutcomeAlert {
    return {
      id: row.id, ruleId: row.ruleId, outcomeId: row.outcomeId, ownerId: row.ownerId,
      projectId: row.projectId, topicId: row.topicId, severity: row.severity as import('../outcome-alert-rule').OutcomeAlertSeverity,
      status: row.status as OutcomeAlertStatus, title: row.title, message: row.message,
      matchedConditions: row.matchedConditions ? JSON.parse(row.matchedConditions) : [],
      triggeredAt: row.triggeredAt.toISOString(), acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null, suppressedAt: row.suppressedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      version: row.version, fingerprint: row.fingerprint,
    };
  }
}