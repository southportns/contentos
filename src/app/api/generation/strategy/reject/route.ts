import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { contentService } from '@/lib/services/content-service'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'

export const runtime = 'nodejs'

// P0.3.8.4.1 — Reject Strategy API
// Transitions strategy from 'pending' → 'rejected' (server-side enforcement)
//
// Security: Client cannot set approvalStatus directly.
// The server controls all state transitions via conditional update.

const inputSchema = z.object({
  strategyId: z.string().min(1),
  reason: z.string().optional(),
})

// Reject any attempt to pass approvalStatus from client
const sanitizeInput = (input: Record<string, unknown>) => {
  // Strip any approvalStatus that client might try to inject
  const { approvalStatus, ...safe } = input
  return safe
}

export async function POST(req: NextRequest) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_NOT_CONFIGURED' },
        { status: 503 },
      )
    }

    const rawBody = await req.json()
    const safeBody = sanitizeInput(rawBody)
    const input = inputSchema.parse(safeBody)

    // Load strategy to verify it exists
    const strategy = await contentService.getStrategyById(input.strategyId)
    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'STRATEGY_NOT_FOUND' },
        { status: 404 },
      )
    }

    // Conditional update: only transitions pending → rejected
    // Returns false if state was already changed (race condition protection)
    const updated = await contentService.rejectStrategy(input.strategyId, input.reason)

    if (!updated) {
      // State was not 'pending' — either already approved/rejected or concurrent modification
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_TRANSITION',
          currentStatus: strategy.approvalStatus,
          message: `Cannot reject strategy in '${strategy.approvalStatus}' state. Only 'pending' strategies can be rejected.`,
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        strategyId: input.strategyId,
        approvalStatus: 'rejected',
        reason: input.reason ?? null,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
