/**
 * P0.6.2 — Context Assembler (Orchestrator)
 *
 * Orchestrates the full assembly pipeline:
 *   Input → Select → Rank → Deduplicate → Budget → Result
 *
 * Architecture Position:
 *   The Assembler is the main entry point for the Assembly Engine.
 *   It coordinates all assembly stages through dependency injection
 *   but does NOT implement any stage logic itself.
 *
 * Design Principles:
 *   1. Pipeline — stages are sequential, each consuming the previous output
 *   2. Composable — stages can be tested/replaced independently
 *   3. Transparent — every exclusion is tracked
 *   4. Graceful — never throws for recoverable issues
 *   5. Explainable — every decision has a reason
 *
 * Non-goals:
 *   - Not implementing stage logic (delegated to modules)
 *   - Not retrieving context (that is Retriever layer)
 *   - Not serializing to text (that is Serializer)
 */

import type { ContextObject } from '../context-object';
import type {
  AssemblyPurpose,
  ContextAssemblyRequest,
  ContextAssemblyResult,
  ContextBudget,
  AssemblyWarning,
  ExcludedContext,
} from './types';
import { selectContexts } from './context-selector';
import { rankContexts } from './context-priority';
import { deduplicateContexts } from './context-dedup';
import { applyBudget, createDefaultBudget, estimateCollectionTokens } from './context-budget';

// ═══════════════════════════════════════════════════════════════════════════════
// Main Assembly Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assemble a ContextPackage from the given request.
 *
 * Pipeline:
 * 1. Select — filter by kind/scope
 * 2. Rank — score by priority factors
 * 3. Deduplicate — remove deterministic duplicates
 * 4. Budget — apply token/count limits
 * 5. Return result — with full provenance
 *
 * @param request - Assembly request with contexts and constraints
 * @return AssemblyResult with selected, excluded, warnings, and metadata
 */
export function assembleContexts(
  request: ContextAssemblyRequest
): ContextAssemblyResult {
  const now = new Date().toISOString();
  const allExcluded: ExcludedContext[] = [];
  const warnings: AssemblyWarning[] = [];

  // Resolve budget
  const budget: ContextBudget = request.budget ?? createDefaultBudget({
    maxTokens: request.maxTokens,
    maxContexts: request.maxContexts,
  });

  // ─── Stage 1: Select ─────────────────────────────────────────────────────
  const selectionResult = selectContexts(request);
  allExcluded.push(...selectionResult.excluded);

  // Check for empty context
  if (selectionResult.selected.length === 0) {
    warnings.push({
      code: 'EMPTY_CONTEXT',
      message: 'No valid contexts available for assembly',
    });
  }

  // Check for all excluded
  if (selectionResult.selected.length === 0 && request.contexts.length > 0) {
    warnings.push({
      code: 'ALL_CONTEXTS_EXCLUDED',
      message: `All ${request.contexts.length} contexts were excluded during selection`,
    });
  }

  // ─── Stage 2: Rank ───────────────────────────────────────────────────────
  const ranked = rankContexts(selectionResult.selected, {
    purpose: request.purpose,
    topicId: request.topicId,
    projectId: request.projectId,
    query: request.query,
    requiredKinds: request.requiredKinds,
  });

  // ─── Stage 3: Deduplicate ────────────────────────────────────────────────
  const dedupResult = deduplicateContexts(ranked);
  allExcluded.push(...dedupResult.duplicates);

  // ─── Stage 4: Budget ─────────────────────────────────────────────────────
  const budgetResult = applyBudget(
    dedupResult.unique,
    budget,
    request.requiredKinds
  );
  allExcluded.push(...budgetResult.excluded);

  // Check for required context missing
  if (request.requiredKinds && request.requiredKinds.length > 0) {
    const selectedKinds = new Set(
      budgetResult.selected.map((s) => s.context.kind)
    );
    for (const required of request.requiredKinds) {
      if (!selectedKinds.has(required)) {
        warnings.push({
          code: 'REQUIRED_CONTEXT_MISSING',
          message: `Required kind '${required}' is not present in the selected contexts`,
        });
      }
    }
  }

  // Check if required contexts alone exceed budget
  const requiredTokens = budgetResult.selected
    .filter((s) => request.requiredKinds?.includes(s.context.kind))
    .reduce((sum, s) => sum + estimateCollectionTokens([s]), 0);

  const effectiveMaxTokens = budget.maxTokens - (budget.reservedTokens ?? 0);
  if (requiredTokens > effectiveMaxTokens) {
    warnings.push({
      code: 'REQUIRED_KINDS_EXCEED_BUDGET',
      message: `Required contexts (${requiredTokens} tokens) exceed effective budget (${effectiveMaxTokens} tokens)`,
    });
  }

  // Check budget exceeded (optional contexts couldn't fit)
  const hasBudgetExcluded = budgetResult.excluded.some((e) => e.reason === 'budget');
  if (hasBudgetExcluded) {
    warnings.push({
      code: 'BUDGET_EXCEEDED',
      message: 'Some contexts were excluded to stay within token/count budget',
    });
  }

  // ─── Return Result ───────────────────────────────────────────────────────
  return {
    selected: budgetResult.selected,
    excluded: allExcluded,
    tokenEstimate: budgetResult.tokenEstimate,
    budget,
    warnings,
    metadata: {
      purpose: request.purpose,
      assembledAt: now,
      inputCount: request.contexts.length,
      selectedCount: budgetResult.selected.length,
      excludedCount: allExcluded.length,
      dedupCount: dedupResult.duplicates.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience Builders
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick assembly with minimal configuration.
 *
 * Uses defaults for all optional parameters.
 */
export function quickAssemble(
  contexts: ContextObject[],
  purpose: AssemblyPurpose,
  options?: Partial<Omit<ContextAssemblyRequest, 'contexts' | 'purpose'>>
): ContextAssemblyResult {
  return assembleContexts({
    contexts,
    purpose,
    ...options,
  });
}
