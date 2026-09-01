import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { writingInputSchema, writingOutputSchema } from './schema'
import { WRITING_SYSTEM_PROMPT, WRITING_PROMPT } from './prompts'
import type { WritingInput, WritingOutput } from './schema'
import type { ExpressionPlan } from '@/lib/expression/types'

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
    ),
  })

  const title = extractTitle(text) || validated.strategy.title
  const sections = parseSections(text)
  const hook = extractHook(text) || validated.strategy.hook
  const wordCount = text.length

  return writingOutputSchema.parse({
    title,
    content: text,
    hook,
    wordCount,
    sections,
  })
}
