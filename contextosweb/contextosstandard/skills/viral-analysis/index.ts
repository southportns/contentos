import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  viralAnalysisInputSchema,
  viralAnalysisOutputSchema,
} from './schema'
import {
  VIRAL_ANALYSIS_SYSTEM_PROMPT,
  VIRAL_ANALYSIS_PROMPT,
} from './prompts'
import type { ViralAnalysisInput, ViralAnalysisOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "url": "内容URL",
  "platform": "平台",
  "viralScore": 0-100的数字,
  "emotionScore": 0-100的数字,
  "controversyScore": 0-100的数字,
  "noveltyScore": 0-100的数字,
  "utilityScore": 0-100的数字,
  "summary": "一句话概括",
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["缺点1"],
  "keyFactors": ["关键因素1", "关键因素2"]
}`)

export async function runViralAnalysis(
  input: ViralAnalysisInput,
): Promise<ViralAnalysisOutput> {
  const validated = viralAnalysisInputSchema.parse(input)
  const model = getModel()

  const analyses: ViralAnalysisOutput['analyses'] = []

  for (const content of validated.contents) {
    try {
      const { text } = await generateText({
        model,
        system: VIRAL_ANALYSIS_SYSTEM_PROMPT + JSON_INSTRUCTION,
        prompt: VIRAL_ANALYSIS_PROMPT(
          content.platform,
          content.title,
          content.content,
          content.author,
          content.metrics,
          validated.topicCategory,
        ),
      })

      const json = extractJsonFromText(text)
      const analysis = viralAnalysisOutputSchema.shape.analyses.element.parse(
        json,
      )
      analyses.push(analysis)
    } catch (error) {
      console.error(`Failed to analyze ${content.url}:`, error)
    }
  }

  // Generate patterns
  const allStrengths = analyses.flatMap((a) => a.strengths)
  const allWeaknesses = analyses.flatMap((a) => a.weaknesses)
  const allFactors = analyses.flatMap((a) => a.keyFactors)

  const strengthsCount = new Map<string, number>()
  allStrengths.forEach((s) => {
    strengthsCount.set(s, (strengthsCount.get(s) || 0) + 1)
  })
  const weaknessesCount = new Map<string, number>()
  allWeaknesses.forEach((w) => {
    weaknessesCount.set(w, (weaknessesCount.get(w) || 0) + 1)
  })
  const factorsCount = new Map<string, number>()
  allFactors.forEach((f) => {
    factorsCount.set(f, (factorsCount.get(f) || 0) + 1)
  })

  const sorted = <T>(count: Map<T, number>, min: number): T[] =>
    Array.from(count.entries())
      .filter(([, c]) => c >= min)
      .sort((a, b) => b[1] - a[1])
      .map(([v]) => v)

  const avgViralScore =
    analyses.length > 0
      ? Math.round(
          analyses.reduce((sum, a) => sum + a.viralScore, 0) /
            analyses.length,
        )
      : 0

  const topContents = [...analyses]
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, 5)
    .map((a) => ({ url: a.url, viralScore: a.viralScore }))

  return viralAnalysisOutputSchema.parse({
    analyses,
    patterns: {
      commonStrengths: sorted(strengthsCount, 2),
      commonWeaknesses: sorted(weaknessesCount, 2),
      viralFactors: sorted(factorsCount, 2),
      avgViralScore,
      topContents,
    },
  })
}
