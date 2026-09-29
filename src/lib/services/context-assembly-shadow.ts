/**
 * P0.6.2-R1 — Context Assembly Shadow Integration
 *
 * Provides a non-breaking shadow integration of the Context Assembly Engine
 * into the Writing production path. When enabled, it builds ContextObjects
 * from real Writing request data, runs the assembly pipeline, and returns
 * observability metadata — WITHOUT modifying the existing Writing output.
 *
 * Architecture Position:
 *   This is a SHADOW: parallel observation, not replacement.
 *   The existing WRITING_PROMPT path remains the source of truth.
 *
 * Feature Flag:
 *   CONTEXT_ASSEMBLY_SHADOW_ENABLED (default: false)
 *   When false: zero overhead, no behavior change.
 *   When true: assembly runs as shadow, metadata is logged.
 *
 * Non-goals:
 *   - Not modifying the existing Writing Prompt
 *   - Not changing Draft output structure
 *   - Not writing to any database table
 *   - Not blocking Writing on assembly failure
 */

import type { ContextObject } from '@/context';
import { createIntentContext, createStrategyContext, createIdentityContext, createKnowledgeContext } from '@/context';
import { assembleContexts, buildContextPackage, serializeContextPackage } from '@/context/assembly';
import type { AssemblyPurpose, ContextAssemblyResult } from '@/context/assembly';

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Flag
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if the Context Assembly Shadow is enabled.
 *
 * Reads CONTEXT_ASSEMBLY_SHADOW_ENABLED from environment.
 * Default: false (opt-in).
 */
export function isShadowEnabled(): boolean {
  const value = process.env.CONTEXT_ASSEMBLY_SHADOW_ENABLED;
  return value === 'true' || value === '1';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shadow Input (derived from Writing request data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input data for building shadow ContextObjects.
 * Derived from the real Writing request.
 */
export interface ShadowInput {
  /** Topic name */
  topic: string;
  /** Strategy data (title, hook, structure, etc.) */
  strategy: {
    title: string;
    hook: string;
    callToAction: string;
    tone: string;
  };
  /** Selected angle */
  selectedAngle: {
    title: string;
    angle: string;
    targetEmotion: string;
    keyPoints: string[];
  };
  /** Platform */
  platform?: string;
  /** Persona (identity) */
  persona?: {
    name: string;
    description: string | null;
  };
  /** Audience summary */
  audience?: string;
  /** Knowledge context from retrieval */
  knowledgeContext: import('@/knowledge/context').KnowledgeContext | null;
  /** Project ID (if available) */
  projectId?: string;
  /** Topic ID (if available) */
  topicId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Build ContextObjects from Shadow Input
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build ContextObjects from real Writing request data.
 *
 * Uses existing factory functions — no second conversion logic.
 * Sets appropriate provenance with scope information.
 *
 * @param input - Shadow input derived from Writing request
 * @return Array of ContextObjects ready for assembly
 */
export function buildShadowContexts(input: ShadowInput): ContextObject[] {
  const contexts: ContextObject[] = [];
  const now = new Date().toISOString();

  // ── Intent Context (from topic + selectedAngle) ──
  const intentCtx = createIntentContext(
    {
      goal: input.topic,
      constraints: null,
      contentType: input.platform,
      audience: input.audience ?? null,
      task: `${input.topic} — ${input.selectedAngle.angle}`,
    },
    {
      id: `shadow_intent_${hashString(input.topic)}`,
      provenance: {
        source: 'shadow:writing_intent',
        sourceType: 'adapter',
        projectId: input.projectId ?? null,
        topicId: input.topicId ?? null,
      },
      lifecycleStage: 'retrieved',
      confidence: 0.9,
      createdAt: now,
      updatedAt: now,
    }
  );
  contexts.push(intentCtx);

  // ── Strategy Context (from strategy data) ──
  const strategyCtx = createStrategyContext(
    {
      coreThesis: input.strategy.title,
      targetEmotion: input.selectedAngle.targetEmotion,
      approvalStatus: 'approved',
    },
    {
      id: `shadow_strategy_${hashString(input.strategy.title)}`,
      provenance: {
        source: 'shadow:writing_strategy',
        sourceType: 'adapter',
        projectId: input.projectId ?? null,
        topicId: input.topicId ?? null,
      },
      lifecycleStage: 'retrieved',
      confidence: 0.9,
      createdAt: now,
      updatedAt: now,
    }
  );
  contexts.push(strategyCtx);

  // ── Identity Context (from persona) ──
  if (input.persona) {
    const identityCtx = createIdentityContext(
      {
        userName: input.persona.name,
        projectName: input.topic,
        projectId: input.projectId,
        userId: null,
      },
      {
        id: `shadow_identity_${hashString(input.persona.name)}`,
        provenance: {
          source: 'shadow:writing_persona',
          sourceType: 'adapter',
          projectId: input.projectId ?? null,
          topicId: input.topicId ?? null,
        },
        lifecycleStage: 'retrieved',
        createdAt: now,
        updatedAt: now,
      }
    );
    contexts.push(identityCtx);
  }

  // ── Knowledge Context (from knowledge retrieval) ──
  if (input.knowledgeContext) {
    const knowledgeCtx = createKnowledgeContext(input.knowledgeContext, {
      id: `shadow_knowledge_${hashString(input.knowledgeContext.query)}`,
      provenance: {
        source: 'shadow:writing_knowledge',
        sourceType: 'knowledge',
        projectId: null,
        // Knowledge contexts are intentionally global — they are not topic-scoped.
        // Even when a real topicId exists, we keep it null here so that
        // resolveContextScope() correctly infers 'global' scope.
        topicId: null,
      },
      lifecycleStage: 'retrieved',
    });
    contexts.push(knowledgeCtx);
  }

  return contexts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shadow Metadata (observability output)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Observable metadata from the shadow assembly.
 * This is what consumers can log or inspect.
 */
export interface ShadowMetadata {
  /** Whether shadow assembly was attempted */
  assemblyEnabled: boolean;
  /** Purpose of the assembly */
  purpose: AssemblyPurpose;
  /** Number of input contexts */
  inputCount: number;
  /** Number of selected contexts */
  selectedCount: number;
  /** Number of excluded contexts */
  excludedCount: number;
  /** Number of deduplicated contexts */
  dedupCount: number;
  /** Estimated total tokens */
  estimatedTokens: number;
  /** Warning codes encountered */
  warnings: string[];
  /** Kinds present in selected contexts */
  selectedKinds: string[];
  /** Serialized output (for debugging) */
  serializedPreview?: string;
  /** Timestamp */
  assembledAt: string;
}

/**
 * Build observable metadata from assembly result.
 */
export function buildShadowMetadata(
  result: ContextAssemblyResult,
  includeSerialized: boolean = false
): ShadowMetadata {
  return {
    assemblyEnabled: true,
    purpose: result.metadata.purpose,
    inputCount: result.metadata.inputCount,
    selectedCount: result.metadata.selectedCount,
    excludedCount: result.metadata.excludedCount,
    dedupCount: result.metadata.dedupCount,
    estimatedTokens: result.tokenEstimate,
    warnings: result.warnings.map((w) => w.code),
    selectedKinds: [...new Set(result.selected.map((s) => s.context.kind))],
    serializedPreview: includeSerialized
      ? (() => {
          try {
            const pkg = buildContextPackage(result);
            const full = serializeContextPackage(pkg);
            return full.length > 200 ? full.slice(0, 200) + '...' : full;
          } catch {
            return undefined;
          }
        })()
      : undefined,
    assembledAt: result.metadata.assembledAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run Shadow Assembly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the Context Assembly Shadow for a Writing request.
 *
 * This is the main entry point for the shadow integration.
 * It returns observable metadata WITHOUT modifying the Writing path.
 *
 * Error handling: ALL errors are caught and returned as metadata.
 * Shadow failure NEVER propagates to the Writing pipeline.
 *
 * @param input - Shadow input derived from Writing request
 * @return Shadow metadata (or error metadata if assembly failed)
 */
export function runWritingShadow(input: ShadowInput): ShadowMetadata {
  try {
    // Check feature flag
    if (!isShadowEnabled()) {
      return {
        assemblyEnabled: false,
        purpose: 'writing',
        inputCount: 0,
        selectedCount: 0,
        excludedCount: 0,
        dedupCount: 0,
        estimatedTokens: 0,
        warnings: [],
        selectedKinds: [],
        assembledAt: new Date().toISOString(),
      };
    }

    // Build ContextObjects from real data
    const contexts = buildShadowContexts(input);

    // Run assembly pipeline
    const result = assembleContexts({
      contexts,
      purpose: 'writing',
      maxTokens: 4000,
      projectId: input.projectId,
      topicId: input.topicId,
      query: input.topic,
    });

    // Build and return metadata
    return buildShadowMetadata(result, true);
  } catch (error) {
    // Shadow failure must NEVER propagate
    return {
      assemblyEnabled: true,
      purpose: 'writing',
      inputCount: 0,
      selectedCount: 0,
      excludedCount: 0,
      dedupCount: 0,
      estimatedTokens: 0,
      warnings: [`SHADOW_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`],
      selectedKinds: [],
      assembledAt: new Date().toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple string hash for deterministic IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
