import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'txt': 'text/plain',
  'md': 'text/markdown',
  'markdown': 'text/markdown',
  'text': 'text/plain',
}

const SOURCE_TYPE_MAP: Record<string, string> = {
  'txt': 'article',
  'md': 'article',
  'markdown': 'article',
  'text': 'article',
}

function getExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

function detectSourceType(fileName: string, content: string): string {
  const ext = getExtension(fileName)
  if (SOURCE_TYPE_MAP[ext]) return SOURCE_TYPE_MAP[ext]

  // Heuristic: detect from content
  if (content.includes('第') && (content.includes('章') || content.includes('节'))) {
    return 'book'
  }
  if (content.includes('报道') || content.includes('记者') || content.includes('新闻')) {
    return 'report'
  }
  return 'other'
}

function extractTitle(content: string, fileName: string): string | null {
  // Try first line as title
  const firstLine = content.split('\n')[0]?.trim()
  if (firstLine && firstLine.length <= 100 && firstLine.length >= 2) {
    // Remove markdown heading markers
    const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^[*-]\s*/, '')
    if (cleaned) return cleaned
  }

  // Use file name (without extension) as fallback
  const ext = getExtension(fileName)
  const nameWithoutExt = ext ? fileName.replace(new RegExp(`\\.${ext}$`, 'i'), '') : fileName
  return nameWithoutExt || null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: '未找到文件' },
        { status: 400 },
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 413 },
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: '文件为空' },
        { status: 400 },
      )
    }

    // Validate extension
    const ext = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS[ext]) {
      return NextResponse.json(
        {
          success: false,
          error: `不支持的文件类型：.${ext}。支持的格式：${Object.keys(ALLOWED_EXTENSIONS).map((e) => `.${e}`).join(', ')}`,
        },
        { status: 415 },
      )
    }

    // Read file content as text
    const content = await file.text()

    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: '文件内容为空' },
        { status: 400 },
      )
    }

    const title = extractTitle(content, file.name)
    const sourceType = detectSourceType(file.name, content)

    return NextResponse.json({
      success: true,
      data: {
        title,
        content,
        sourceType,
        fileName: file.name,
        fileSize: file.size,
      },
    })
  } catch (error) {
    console.error('[API] Upload content failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
