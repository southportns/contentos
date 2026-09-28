import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { writingInputSchema, writingOutputSchema } from './schema'
import { WRITING_SYSTEM_PROMPT, WRITING_PROMPT } from './prompts'
import type { WritingInput, WritingOutput } from './schema'
import type { ExpressionPlan } from '@/lib/expression/types'
import { runWritingShadow } from '@/lib/services/context-assembly-shadow'

/**
 * LLM 常见的前缀确认语句，需要从初稿内容中移除
 * 注意：顺序很重要，更具体的模式应该放在前面
 */
const LLM_PREFIX_PATTERNS = [
  // 长的、具体的模式优先
  /^好的[\s\S]{0,80}(遵循|按照|根据|为您|为你|完成|执行)/,
  /^没问题[\s\S]{0,80}(遵循|按照|根据|为您|为你|完成|执行)/,
  /^我(已经?|会)(仔细阅读|认真阅读|仔细阅读了?|理解了?)\S{0,50}(策略|内容|要求|大纲)/,
  /^我将?\S{0,30}(遵循|按照|严格?执行|为你|为您|完成)/,
  // 短的通用模式放后面
  /^好的[，,。.]?\s*/,
  /^没问题[，,。.]?\s*/,
  /^收到[，,。.]?\s*/,
  /^当然[，,。.]?\s*/,
  /^明白了[，,。.]?\s*/,
  /^了解[，,。.]?\s*/,
  /^好的，没问题[，,。.]?\s*/,
]

/**
 * 清理 LLM 输出中的前缀确认语句
 */
function cleanLlmPrefix(text: string): string {
  let result = text
  for (const pattern of LLM_PREFIX_PATTERNS) {
    result = result.replace(pattern, '')
  }
  // 清理开头的空白字符
  return result.trimStart()
}

function parseSections(content: string): Array<{ section: string; content: string }> {
  const sections: Array<{ section: string; content: string }> = []
  const parts = content.split(/^##\s+/m)
  
  for (const part of parts) {
    if (!part.trim()) continue
    const lines = part.split('\n')
    const sectionName = lines[0].trim()
    const sectionContent = lines.slice(1).join('\n').trim()
    if (sectionName) {
      sections.push({ section: sectionName, content: sectionContent })
    }
  }
  
  return sections
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

function extractHook(content: string): string {
  // Remove the title line, get the first paragraph
  const withoutTitle = content.replace(/^#\s+.+\n/m, '')
  const firstParagraph = withoutTitle.split('\n\n')[0] || ''
  return firstParagraph.replace(/^##\s+.+\n/, '').trim()
}

export async function runWriting(
  input: WritingInput,
): Promise<WritingOutput> {
  const validated = writingInputSchema.parse(input)
  const model = getModel()

  // ── P0.6.2-R1: Context Assembly Shadow (non-breaking) ──
  // Runs the Assembly Engine in parallel as a shadow.
  // Result is for observability only — does NOT modify the Writing path.
  // All errors are caught to ensure Writing never fails due to shadow.
  try {
    const shadowMetadata = runWritingShadow({
      topic: validated.topic,
      strategy: {
        title: validated.strategy.title,
        hook: validated.strategy.hook,
        callToAction: validated.strategy.callToAction,
        tone: validated.strategy.tone,
      },
      selectedAngle: {
        title: validated.selectedAngle.title,
        angle: validated.selectedAngle.angle,
        targetEmotion: validated.selectedAngle.targetEmotion,
        keyPoints: validated.selectedAngle.keyPoints,
      },
      platform: validated.platform,
      persona: validated.persona,
      audience: validated.audience,
      knowledgeContext: validated.knowledgeContext ?? null,
    });
    // Log shadow metadata for observability (no-op in production unless enabled)
    if (shadowMetadata.assemblyEnabled) {
      console.debug('[ContextAssembly Shadow]', JSON.stringify(shadowMetadata));
    }
  } catch {
    // Shadow failure must NEVER block Writing — silently continue
  }

  const { text } = await generateText({
    model,
    system: WRITING_SYSTEM_PROMPT,
    prompt: WRITING_PROMPT(
      validated.topic,
      validated.strategy,
      validated.selectedAngle,
      validated.platform,
      validated.tone,
      validated.wordCount,
      validated.persona,
      validated.expressionPlan as ExpressionPlan | undefined,
      validated.audience,
      validated.originalContent,
      validated.knowledgeContext,
    ),
  })

  // 清理 LLM 前缀确认语句
  const cleanedText = cleanLlmPrefix(text)

  const title = extractTitle(cleanedText) || validated.strategy.title
  const sections = parseSections(cleanedText)
  const hook = extractHook(cleanedText) || validated.strategy.hook
  const wordCount = cleanedText.length

  return writingOutputSchema.parse({
    title,
    content: cleanedText,
    hook,
    wordCount,
    sections,
  })
}
