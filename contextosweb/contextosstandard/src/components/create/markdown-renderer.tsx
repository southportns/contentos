'use client'

import React from 'react'

/**
 * 轻量级 Markdown 渲染器
 * 支持：标题（#~###）、粗体、斜体、行内代码、无序列表、有序列表、引用、分隔线、段落
 * 不引入第三方依赖，避免额外 bundle 体积
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text: string): string {
  let result = escapeHtml(text)
  // 行内代码 `code`
  result = result.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs font-mono">$1</code>')
  // 粗体 **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // 斜体 *text*（避免与粗体冲突，只匹配单星号）
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  return result
}

interface Block {
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'hr' | 'blank'
  level?: number
  items?: string[]
  text?: string
  ordered?: boolean
}

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行
    if (!trimmed) {
      i++
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 标题 # ~ ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      i++
      continue
    }

    // 引用 >
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') })
      continue
    }

    // 无序列表 - / *
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', items, ordered: false })
      continue
    }

    // 有序列表 1.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', items, ordered: true })
      continue
    }

    // 段落：连续非空行
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return blocks
}

function blockToJsx(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const text = renderInline(block.text || '')
      if (block.level === 1) {
        return (
          <h1 key={key} className="mb-3 text-lg font-bold leading-snug"
            dangerouslySetInnerHTML={{ __html: text }} />
        )
      }
      if (block.level === 2) {
        return (
          <h2 key={key} className="mb-2 mt-4 text-base font-semibold leading-snug"
            dangerouslySetInnerHTML={{ __html: text }} />
        )
      }
      return (
        <h3 key={key} className="mb-1.5 mt-3 text-sm font-semibold leading-snug"
          dangerouslySetInnerHTML={{ __html: text }} />
      )
    }

    case 'paragraph':
      return (
        <p key={key} className="mb-2 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderInline(block.text || '') }} />
      )

    case 'list': {
      const items = block.items || []
      const content = items.map((item, idx) => (
        <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
      ))
      if (block.ordered) {
        return <ol key={key} className="mb-2 list-decimal space-y-1 pl-5">{content}</ol>
      }
      return <ul key={key} className="mb-2 list-disc space-y-1 pl-5">{content}</ul>
    }

    case 'quote':
      return (
        <blockquote key={key} className="mb-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic"
          dangerouslySetInnerHTML={{ __html: renderInline(block.text || '') }} />
      )

    case 'hr':
      return <hr key={key} className="my-3 border-border" />

    default:
      return null
  }
}

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const blocks = parseBlocks(content)
  return (
    <div className={className}>
      {blocks.map((block, i) => blockToJsx(block, i))}
    </div>
  )
}
