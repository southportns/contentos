/**
 * P0.6.2 — Context Serializer
 *
 * Serializes a ContextPackage into a structured, human-readable text format.
 *
 * Architecture Position:
 *   Serializer converts the structured ContextPackage into text suitable
 *   for injection into a Prompt. It does NOT create the full Prompt —
 *   it only produces the CONTEXT section that the Prompt template integrates.
 *
 * CRITICAL BOUNDARY:
 *   Serializer ≠ Prompt Template.
 *   Serializer produces structured text blocks for each context kind.
 *   The existing Prompt system decides how to use this text.
 *
 * Design Principles:
 *   1. Deterministic — same input always produces same output
 *   2. Structured — each kind gets a labeled section
 *   3. Readable — humans can understand the serialized output
 *   4. Safe — no undefined/null leakage in output
 *
 * Non-goals:
 *   - Not creating system prompts or user prompts
 *   - Not adding instructions or formatting rules
 *   - Not calling LLM tokenizers
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type { ContextPackage } from './types';
import { CONTEXT_KIND_LABELS } from '../context-kind';
import { getPackageArrayByKind } from './context-package';

// ═══════════════════════════════════════════════════════════════════════════════
// Serialization Options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for serialization.
 */
export interface SerializationOptions {
  /** Include metadata header */
  includeHeader?: boolean;
  /** Include empty kind sections */
  includeEmpty?: boolean;
  /** Maximum characters per context (truncates if exceeded) */
  maxCharsPerContext?: number;
}

const DEFAULT_OPTIONS: SerializationOptions = {
  includeHeader: false,
  includeEmpty: false,
  maxCharsPerContext: undefined,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Serializer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serialize a ContextPackage to structured text.
 *
 * Output format:
 * ```
 * [Identity]
 * user: ...
 * project: ...
 *
 * [Intent]
 * Goal: ...
 * Constraints:
 * - ...
 *
 * [Strategy]
 * Core Thesis: ...
 *
 * [Knowledge]
 * - knowledge item 1
 * - knowledge item 2
 * ```
 *
 * @param pkg - The context package to serialize
 * @param options - Serialization options
 * @return Structured text representation
 */
export function serializeContextPackage(
  pkg: ContextPackage,
  options?: SerializationOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = [];

  if (opts.includeHeader) {
    sections.push(
      `[Context Package | purpose: ${pkg.metadata.purpose} | contexts: ${pkg.metadata.contextCount} | tokens: ~${pkg.metadata.tokenEstimate}]`
    );
  }

  // Serialize each kind in priority order
  const kindOrder: ContextKind[] = [
    'identity',
    'intent',
    'strategy',
    'knowledge',
    'content',
    'evaluation',
    'decision',
    'outcome',
    'memory',
  ];

  for (const kind of kindOrder) {
    const contexts = getPackageArrayByKind(pkg, kind);
    if (contexts.length === 0 && !opts.includeEmpty) continue;

    const section = serializeKindSection(kind, contexts, opts);
    if (section) {
      sections.push(section);
    }
  }

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section Serializers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serialize a single kind section.
 */
function serializeKindSection(
  kind: ContextKind,
  contexts: ContextObject[],
  options: SerializationOptions
): string {
  const label = CONTEXT_KIND_LABELS[kind] ?? kind;
  const header = `[${label}]`;

  if (contexts.length === 0) {
    return options.includeEmpty ? header : '';
  }

  const lines: string[] = [header];

  for (const ctx of contexts) {
    const serialized = serializeContext(ctx, options);
    if (serialized) {
      lines.push(serialized);
    }
  }

  return lines.join('\n');
}

/**
 * Serialize a single ContextObject to text.
 *
 * Delegates to kind-specific logic based on context type.
 * Falls back to payload serialization for unknown types.
 */
function serializeContext(
  context: ContextObject,
  options: SerializationOptions
): string {
  let text = '';

  // Type-specific serialization
  switch (context.kind) {
    case 'identity':
      text = serializeIdentityContext(context);
      break;
    case 'intent':
      text = serializeIntentContext(context);
      break;
    case 'strategy':
      text = serializeStrategyContext(context);
      break;
    case 'knowledge':
      text = serializeKnowledgeContext(context);
      break;
    case 'content':
      text = serializeContentContext(context);
      break;
    case 'evaluation':
      text = serializeEvaluationContext(context);
      break;
    default:
      text = serializeGenericContext(context);
      break;
  }

  // Apply truncation if needed
  if (options.maxCharsPerContext && text.length > options.maxCharsPerContext) {
    text = text.slice(0, options.maxCharsPerContext) + ' [truncated]';
  }

  return text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Kind-Specific Serializers
// ═══════════════════════════════════════════════════════════════════════════════

function serializeIdentityContext(ctx: ContextObject): string {
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];

  if (typeof payload['userName'] === 'string') {
    parts.push(`User: ${payload['userName']}`);
  }
  if (typeof payload['projectName'] === 'string') {
    parts.push(`Project: ${payload['projectName']}`);
  }
  if (typeof payload['userId'] === 'string') {
    parts.push(`UserId: ${payload['userId']}`);
  }

  return parts.join('\n');
}

function serializeIntentContext(ctx: ContextObject): string {
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];

  if (typeof payload['goal'] === 'string') {
    parts.push(`Goal: ${payload['goal']}`);
  }
  if (typeof payload['task'] === 'string') {
    parts.push(`Task: ${payload['task']}`);
  }
  if (typeof payload['audience'] === 'string') {
    parts.push(`Audience: ${payload['audience']}`);
  }
  if (typeof payload['contentType'] === 'string') {
    parts.push(`ContentType: ${payload['contentType']}`);
  }
  if (Array.isArray(payload['constraints'])) {
    parts.push('Constraints:');
    for (const c of payload['constraints']) {
      if (typeof c === 'string') {
        parts.push(`- ${c}`);
      }
    }
  }

  return parts.join('\n');
}

function serializeStrategyContext(ctx: ContextObject): string {
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];

  if (typeof payload['coreThesis'] === 'string') {
    parts.push(`Core Thesis: ${payload['coreThesis']}`);
  }
  if (typeof payload['targetEmotion'] === 'string') {
    parts.push(`Target Emotion: ${payload['targetEmotion']}`);
  }
  if (typeof payload['platform'] === 'string') {
    parts.push(`Platform: ${payload['platform']}`);
  }
  if (typeof payload['approvalStatus'] === 'string') {
    parts.push(`Status: ${payload['approvalStatus']}`);
  }

  return parts.join('\n');
}

function serializeKnowledgeContext(ctx: ContextObject): string {
  // For knowledge contexts, the payload is already a KnowledgeContext
  // We use a simple representation here
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  // If it has KnowledgeContext structure, extract key info
  if (Array.isArray(payload['primaryKnowledge'])) {
    const parts: string[] = [];
    for (const ku of payload['primaryKnowledge'] as Array<Record<string, unknown>>) {
      if (typeof ku['name'] === 'string') {
        const similarity = typeof ku['similarity'] === 'number'
          ? ` (${(ku['similarity'] as number).toFixed(2)})`
          : '';
        parts.push(`- ${ku['name']}${similarity}`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : '';
  }

  // Fallback: show type
  return `Knowledge: ${ctx.type}`;
}

function serializeContentContext(ctx: ContextObject): string {
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];

  if (typeof payload['title'] === 'string') {
    parts.push(`Title: ${payload['title']}`);
  }
  if (typeof payload['version'] === 'number') {
    parts.push(`Version: ${payload['version']}`);
  }
  if (typeof payload['status'] === 'string') {
    parts.push(`Status: ${payload['status']}`);
  }
  if (typeof payload['changeType'] === 'string') {
    parts.push(`Change: ${payload['changeType']}`);
  }

  return parts.join('\n');
}

function serializeEvaluationContext(ctx: ContextObject): string {
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];

  if (typeof payload['overallScore'] === 'number') {
    parts.push(`Score: ${payload['overallScore']}/100`);
  }
  if (typeof payload['platformFit'] === 'number') {
    parts.push(`Platform Fit: ${payload['platformFit']}`);
  }
  if (Array.isArray(payload['weaknesses'])) {
    parts.push('Issues:');
    for (const w of payload['weaknesses']) {
      if (typeof w === 'string') {
        parts.push(`- ${w}`);
      }
    }
  }

  return parts.join('\n');
}

function serializeGenericContext(ctx: ContextObject): string {
  // Generic fallback: serialize payload as key-value pairs
  const payload = ctx.payload as Record<string, unknown> | null;
  if (!payload) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${value}`);
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      parts.push(`${key}: ${value.join(', ')}`);
    }
  }

  return parts.join('\n');
}
