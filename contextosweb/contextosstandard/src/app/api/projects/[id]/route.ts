import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/utils/db-safe'
import { prisma } from '@/lib/prisma'
import type {
  TopicProfile,
  ContentAngle,
  ContentStrategy,
  WritingDraft,
  EvaluationResult,
  StrategyEvaluationResult,
} from '@/hooks/use-workflow'

export const runtime = 'nodejs'

// ── Helpers: DB → WorkflowState mappers ─────────────

function mapTopicToProfile(
  topic: {
    topic: string
    category: string | null
    platform: string | null
    audience: string | null
  },
  savedKeywords?: string[],
  savedCoreQuestions?: string[],
): TopicProfile {
  return {
    topic: topic.topic,
    category: topic.category || '',
    keywords: savedKeywords || [],
    relatedTopics: [],
    coreQuestions: savedCoreQuestions || [],
    audience: topic.audience || undefined,
    potentialAngles: [],
    researchQueries: [],
  }
}

function mapAngleToContentAngle(angle: {
  id: string
  title: string
  coreThesis: string
  emotion: string | null
  keyPoints: unknown
  audienceAppeal: string | null
  estimatedViralScore: number | null
  risk: string | null
  supportingEvidence: string | null
}): ContentAngle {
  return {
    id: angle.id,
    title: angle.title,
    angle: angle.coreThesis,
    reasoning: angle.supportingEvidence || '',
    targetEmotion: angle.emotion || '',
    estimatedViralScore: angle.estimatedViralScore || 0,
    difficulty: (angle.risk as 'low' | 'medium' | 'high') || 'medium',
    keyPoints: (Array.isArray(angle.keyPoints) ? angle.keyPoints as string[] : []),
    audienceAppeal: angle.audienceAppeal || '',
  }
}

function mapStrategyToContentStrategy(strategy: {
  coreThesis: string
  hookStrategy: string | null
  contentStructure: unknown
  keyArguments: unknown
  endingStrategy: string | null
  ctaStrategy: string | null
  tone: string | null
  estimatedWordCount: number | null
}): ContentStrategy {
  // contentStructure is stored as JSON; parse the structure array
  const structure = Array.isArray(strategy.contentStructure)
    ? (strategy.contentStructure as ContentStrategy['structure'])
    : []

  // endingStrategy stored as "start → middle → end"
  const arcParts = (strategy.endingStrategy || '').split('→').map((s) => s.trim())
  const emotionalArc = {
    start: arcParts[0] || '',
    middle: arcParts[1] || '',
    end: arcParts[2] || '',
  }

  return {
    title: strategy.coreThesis,
    hook: strategy.hookStrategy || '',
    structure,
    keyArguments: (Array.isArray(strategy.keyArguments) ? strategy.keyArguments as string[] : []),
    emotionalArc,
    callToAction: strategy.ctaStrategy || '',
    suggestedReferences: [],
    tone: strategy.tone || '',
    estimatedWordCount: strategy.estimatedWordCount || 0,
  }
}

function mapDraftToWritingDraft(draft: {
  title: string | null
  content: string
  wordCount: number | null
}): WritingDraft {
  return {
    title: draft.title || '',
    content: draft.content,
    hook: '',
    wordCount: draft.wordCount || 0,
    sections: [],
  }
}

function mapEvaluationToResult(eval_: {
  overallScore: number | null
  emotionalImpactScore: number | null
  logicalClarityScore: number | null
  noveltyScore: number | null
  readabilityScore: number | null
  utilityScore: number | null
  platformFitScore: number | null
  strengths: unknown
  issues: unknown
  suggestions: unknown
  emotionalArcAnalysis: unknown
  conclusion: string | null
}): EvaluationResult {
  const suggestions = Array.isArray(eval_.suggestions)
    ? (eval_.suggestions as EvaluationResult['suggestions'])
    : []

  const arcAnalysis = (eval_.emotionalArcAnalysis &&
    typeof eval_.emotionalArcAnalysis === 'object' &&
    'achieved' in (eval_.emotionalArcAnalysis as Record<string, unknown>))
    ? (eval_.emotionalArcAnalysis as { achieved: boolean; analysis: string })
    : { achieved: false, analysis: '' }

  return {
    overallScore: eval_.overallScore || 0,
    scores: {
      emotionalImpact: eval_.emotionalImpactScore || 0,
      logicalClarity: eval_.logicalClarityScore || 0,
      novelty: eval_.noveltyScore || 0,
      readability: eval_.readabilityScore || 0,
      utility: eval_.utilityScore || 0,
      platformFit: eval_.platformFitScore || 0,
    },
  strengths: (Array.isArray(eval_.strengths) ? eval_.strengths as string[] : []),
  weaknesses: (Array.isArray(eval_.issues) ? eval_.issues as string[] : []),
    suggestions,
    emotionalArcAnalysis: arcAnalysis,
    conclusion: eval_.conclusion || '',
  }
}

function mapStrategyEvaluationToResult(se: {
  platform: string
  overallScore: number | null
  grade: string | null
  scores: unknown
  platformFit: number | null
  strategyConsistency: number | null
  strengths: unknown
  weaknesses: unknown
  criticalIssues: unknown
  improvementPriorities: unknown
  shareAnalysis: unknown
  aiStyleRisk: number | null
  authenticityScore: number | null
  evidenceQuality: number | null
  confidence: number | null
  verdict: string | null
}): StrategyEvaluationResult {
  const scores = (se.scores && typeof se.scores === 'object')
    ? (se.scores as Record<string, number>)
    : {}

  const improvementPriorities = Array.isArray(se.improvementPriorities)
    ? (se.improvementPriorities as StrategyEvaluationResult['improvementPriorities'])
    : []

  const shareAnalysis = (se.shareAnalysis &&
    typeof se.shareAnalysis === 'object' &&
    'motivation' in (se.shareAnalysis as Record<string, unknown>))
    ? (se.shareAnalysis as StrategyEvaluationResult['shareAnalysis'])
    : { motivation: '', target: '', context: '' }

  return {
    platform: se.platform,
    overallScore: se.overallScore || 0,
    grade: (se.grade as StrategyEvaluationResult['grade']) || 'average',
    scores,
    platformFit: se.platformFit || 0,
    strategyConsistency: se.strategyConsistency || 0,
    strengths: (Array.isArray(se.strengths) ? se.strengths as string[] : []),
    weaknesses: (Array.isArray(se.weaknesses) ? se.weaknesses as string[] : []),
    criticalIssues: (Array.isArray(se.criticalIssues) ? se.criticalIssues as string[] : []),
    improvementPriorities,
    shareAnalysis,
    aiStyleRisk: se.aiStyleRisk || 0,
    authenticityScore: se.authenticityScore || 0,
    evidenceQuality: se.evidenceQuality || 0,
    confidence: se.confidence || 0,
    verdict: se.verdict || '',
  }
}

// ── GET Handler ─────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: '数据库未配置' },
      { status: 503 },
    )
  }

  try {
    const { id: projectId } = await params

    // Load project with all related data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        topics: {
          orderBy: { updatedAt: 'desc' },
          include: {
            angles: true,
            strategy: true,
            drafts: {
              orderBy: { updatedAt: 'desc' },
              include: {
                evaluation: true,
                strategyEvaluation: true,
              },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { success: false, error: '创作不存在' },
        { status: 404 },
      )
    }

    // Take the first (most recently updated) topic
    const topic = project.topics[0]
    if (!topic) {
      return NextResponse.json({
        success: true,
        data: {
          projectId: project.id,
          projectName: project.name,
          topicProfile: null,
          selectedAngle: null,
          strategy: null,
          draft: null,
          evaluation: null,
          strategyEvaluation: null,
          platform: null,
        },
      })
    }

    // Find the approved angle
    const approvedAngle = topic.angles.find((a) => a.status === 'APPROVED') || topic.angles[0]
    const selectedAngle = approvedAngle
      ? mapAngleToContentAngle(approvedAngle)
      : null

    // Build topic profile
    const topicProfile = mapTopicToProfile(topic)

    // Strategy
    const strategy = topic.strategy
      ? mapStrategyToContentStrategy(topic.strategy)
      : null

    // Latest draft with evaluation
    const draft = topic.drafts[0]
    const writingDraft = draft ? mapDraftToWritingDraft(draft) : null
    const evaluation = draft?.evaluation
      ? mapEvaluationToResult(draft.evaluation)
      : null
    const strategyEvaluation = draft?.strategyEvaluation
      ? mapStrategyEvaluationToResult(draft.strategyEvaluation)
      : null

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        topicProfile,
        selectedAngle,
        strategy,
        draft: writingDraft,
        evaluation,
        strategyEvaluation,
        platform: topic.platform || null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载失败'
    console.error('[API] Load project failed:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
