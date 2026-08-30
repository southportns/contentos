import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import { runAdaptation, runAdaptationStream } from '@/skills/content-adaptation'
import { safeDb, isDatabaseConfigured } from '@/lib/utils/db-safe'
import { contentService } from '@/lib/services/content-service'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 90

const inputSchema = z.object({
  referenceContent: z.object({
    title: z.string().nullable(),
    content: z.string().nullable(),
    transcript: z.string().nullable(),
    platform: z.string(),
    author: z.string().nullable(),
    url: z.string().nullable(),
    metrics: z
      .object({
        likes: z.number().nullable(),
        comments: z.number().nullable(),
        shares: z.number().nullable(),
        favorites: z.number().nullable(),
        views: z.number().nullable(),
      })
      .nullable(),
  }),
  userIdea: z.string().min(1, '用户想法不能为空'),
  persona: z
    .object({
      name: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  platform: z.string().optional(),
  topicId: z.string().optional(),
  // When true, returns SSE stream with incremental results
  stream: z.boolean().optional(),
})

// ─── Helper: persist to database ─────────────────────────

async function persistAdaptation(
  input: z.infer<typeof inputSchema>,
  result: Awaited<ReturnType<typeof runAdaptation>>,
) {
  if (isDatabaseConfigured() && input.topicId) {
    await safeDb(async () => {
      await prisma.contentAdaptation.create({
        data: {
          topicId: input.topicId!,
          referencePlatform: input.referenceContent.platform,
          referenceUrl: input.referenceContent.url,
          referenceTitle: input.referenceContent.title,
          referenceAuthor: input.referenceContent.author,
          referenceContent:
            input.referenceContent.transcript ||
            input.referenceContent.content,
          referenceMetrics: input.referenceContent.metrics
            ? (input.referenceContent.metrics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          userIdea: input.userIdea,
          personaId: input.persona?.name,
          referenceAnalysis: result.referenceAnalysis as unknown as Prisma.InputJsonValue,
          adaptedAngles: { angles: result.adaptedAngles } as unknown as Prisma.InputJsonValue,
          strategySuggestion: result.strategySuggestion as unknown as Prisma.InputJsonValue,
          status: 'ANALYZED',
        },
      })
      await contentService.updateTopicStatus(input.topicId!, 'ANALYZING')
    }, 'adaptation-save')
  }
}

// ─── POST: stream or non-stream ────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = inputSchema.parse(body)

    // ─── Stream mode: SSE ──────────────────────────────
    if (input.stream) {
      const encoder = new TextEncoder()

      const stream = new ReadableStream({
        async start(controller) {
          let fullResult: Awaited<ReturnType<typeof runAdaptation>> | null = null

          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            )
          }

          try {
            await runAdaptationStream(input, {
              onAnalysis: (data) => send('analysis', data),
              onAngles: (data) => send('angles', data),
              onDone: (data) => {
                fullResult = data
                send('done', data)
              },
              onError: (error) => {
                send('error', { error: error.message })
                controller.close()
              },
            })

            // Persist after both phases complete
            if (fullResult) {
              await persistAdaptation(input, fullResult)
            }

            controller.close()
          } catch (error) {
            send('error', {
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // ─── Non-stream mode (original behavior) ───────────
    const result = await runAdaptation(input)
    await persistAdaptation(input, result)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
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
