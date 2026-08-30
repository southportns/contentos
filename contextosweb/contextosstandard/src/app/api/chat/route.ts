import { streamText } from 'ai'
import { NextRequest } from 'next/server'
import { getModel } from '@/lib/ai/models'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const model = getModel()

    const result = streamText({
      model,
      messages,
      system:
        '你是 Content OS 的 AI 助手。你帮助用户进行账号研究、爆款分析和写作。请用中文回复。',
    })

    return result.toTextStreamResponse()
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}
