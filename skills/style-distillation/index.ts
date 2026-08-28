import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { distillationInputSchema, distillationOutputSchema } from './schema'
import { DISTILLATION_SYSTEM_PROMPT, DISTILLATION_PROMPT } from './prompts'
import type { DistillationInput, DistillationOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式严格按照 schema 中的结构输出：
{
  "toneProfile": {
    "formality": 0-100,
    "energy": 0-100,
    "humor": 0-100,
    "directness": 0-100,
    "warmth": 0-100,
    "description": "语调特征描述"
  },
  "personality": ["性格标签1", "性格标签2", ...],
  "languagePatterns": {
    "sentenceRhythm": "句子节奏描述",
    "vocabularyTendency": "词汇偏好描述",
    "catchphrases": ["标志性表达1", ...],
    "openingStyle": "开场方式描述",
    "closingStyle": "收尾方式描述"
  },
  "preferredTopics": ["偏好主题1", ...],
  "preferredStructures": [
    { "structure": "结构描述", "frequency": "高频/中频/低频" }
  ],
  "hookStyles": ["钩子风格1", ...],
  "emotionalTendencies": {
    "primary": "主要情绪",
    "secondary": "次要情绪",
    "intensity": 0-100
  },
  "summary": "200-300字的综合风格描述"
}`)

export async function runStyleDistillation(
  input: DistillationInput,
): Promise<DistillationOutput> {
  const validated = distillationInputSchema.parse(input)
  const model = getModel()

  // Build archives text for analysis
  const archivesText = validated.archives
    .map((archive, i) => {
      const refineText = archive.refineChanges?.length
        ? archive.refineChanges
            .map(
              (c) =>
                `  - ${c.type || '修改'}: "${c.original || ''}" → "${c.revised || ''}"（${c.reason || ''}）`,
            )
            .join('\n')
        : '  （无微调记录）'

      return `--- 终稿 ${i + 1} ---
主题：${archive.topic}
${archive.platform ? `平台：${archive.platform}` : ''}
${archive.selectedAngleTitle ? `角度：${archive.selectedAngleTitle}` : ''}
${archive.strategyTone ? `策略语调：${archive.strategyTone}` : ''}
标题：${archive.finalTitle}
${archive.finalHook ? `钩子：${archive.finalHook}` : ''}
正文（${archive.wordCount || archive.finalContent.length}字）：
${archive.finalContent}

微调记录：
${refineText}`
    })
    .join('\n\n')

  const { text } = await generateText({
    model,
    system: DISTILLATION_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: DISTILLATION_PROMPT(validated.archives.length, archivesText),
  })

  const json = extractJsonFromText(text)
  return distillationOutputSchema.parse(json)
}
