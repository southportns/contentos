/**
 * GET /api/knowledge/search
 *
 * Knowledge Store search endpoint.
 *
 * Query parameters:
 *   - q: Topic string for keyword-based retrieval
 *   - category: Filter by category (can be repeated)
 *   - knowledge_level: Filter by knowledge level (can be repeated)
 *   - confidence: Minimum confidence (high | medium | low)
 *   - include_candidates: Include candidate KUs (true | false)
 *   - limit: Max results to return (default 8)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  knowledgeStore,
  KnowledgeRetrievalResponse,
} from '@/knowledge';

export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().optional(),
  category: z
    .union([z.string(), z.array(z.string())])
    .optional(),
  knowledge_level: z
    .union([z.string(), z.array(z.string())])
    .optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  include_candidates: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

function normalizeQueryParam(
  param: string | string[] | undefined
): string[] | undefined {
  if (param === undefined) return undefined;
  if (Array.isArray(param)) return param;
  return [param];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const parsed = querySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      category: normalizeQueryParam(searchParams.get('category') ?? undefined),
      knowledge_level: normalizeQueryParam(
        searchParams.get('knowledge_level') ?? undefined
      ),
      confidence: searchParams.get('confidence') ?? undefined,
      include_candidates:
        searchParams.get('include_candidates') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
          results: [],
          total: 0,
        },
        { status: 400 }
      );
    }

    const {
      q: topic,
      category,
      knowledge_level,
      confidence,
      include_candidates,
      limit,
    } = parsed.data;

    const categoryArr = Array.isArray(category) ? category : category ? [category] : [];
    const validCategories = categoryArr.filter((c: string) =>
      ['hook', 'structure', 'emotion', 'perspective', 'language', 'cognition', 'human_expression', 'ending'].includes(c)
    );

    const levelArr = Array.isArray(knowledge_level) ? knowledge_level : knowledge_level ? [knowledge_level] : [];
    const validLevels = levelArr.filter((l: string) =>
      ['strategic_pattern', 'structural_pattern', 'expression_principle', 'surface_technique'].includes(l)
    );

    const response: KnowledgeRetrievalResponse = knowledgeStore.search({
      topic,
      category: validCategories as never,
      knowledge_level: validLevels as never,
      confidence,
      include_candidates,
      limit,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/knowledge/search] Error:', error);
    return NextResponse.json(
      {
        error: 'SystemError',
        message: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
