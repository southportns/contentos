import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import { runTopicResearch } from '@/skills/topic-research'
import { runContentSearch } from '@/skills/content-search'
import { runViralAnalysis } from '@/skills/viral-analysis'
import { runAudienceAnalysis } from '@/skills/audience-analysis'
import { runAngleGeneration } from '@/skills/angle-generation'
import { runContentStrategy } from '@/skills/content-strategy'
import { runWriting } from '@/skills/writing'
import { runHumanization } from '@/skills/humanization'
import { runEvaluation } from '@/skills/evaluation'
import type {
  TopicProfile,
  Angle,
  ContentAnalysis,
  AudienceInsight,
  ContentStrategy,
  Draft,
  Evaluation,
  AgentError,
} from './types'

// ─── Agent State ─────────────────────────────────────────

const StateAnnotation = Annotation.Root({
  projectId: Annotation<string>,
  topicId: Annotation<string>,
  topic: Annotation<TopicProfile>,
  research: Annotation<
    Array<{
      source: string
      url?: string
      content: string
      title?: string
    }>
  >,
  contents: Annotation<
    Array<{
      id: string
      platform: string
      url?: string
      title?: string
      body?: string
      author?: string
      publishedAt?: string
      metrics?: Record<string, number | undefined>
    }>
  >,
  analyses: Annotation<ContentAnalysis[]>,
  insights: Annotation<AudienceInsight>,
  angles: Annotation<Angle[]>,
  selectedAngleId: Annotation<string | undefined>,
  strategy: Annotation<ContentStrategy | undefined>,
  draft: Annotation<Draft | undefined>,
  humanizedDraft: Annotation<Draft | undefined>,
  evaluation: Annotation<Evaluation | undefined>,
  status: Annotation<string>,
  errors: Annotation<Array<{ step: string; message: string; timestamp: string }>>,
})

export type ContentAgentState = typeof StateAnnotation.State

// ─── Agent Nodes ─────────────────────────────────────────

function appendError(
  state: ContentAgentState,
  step: string,
  message: string,
): { errors: ContentAgentState['errors'] } {
  const error: AgentError = {
    step,
    message,
    timestamp: new Date().toISOString(),
  }
  return { errors: [...state.errors, error] }
}

// ── Node: Topic Profiling ─────────────────────────────

async function topicProfilingNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  try {
    const { topic } = state

    const result = await runTopicResearch({
      topic: topic.topic,
    })

    const updatedTopic: TopicProfile = {
      ...topic,
      category: result.category,
      keywords: result.keywords,
      relatedTopics: result.relatedTopics,
      coreQuestions: result.coreQuestions,
      potentialAngles: result.potentialAngles,
      researchQueries: result.researchQueries,
      audience: result.audience,
    }

    return {
      topic: updatedTopic,
      status: 'RESEARCHING',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'topic_profiling',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Content Search (DuckDuckGo + Jina Reader) ─────

async function contentSearchNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  try {
    const queries = state.topic.researchQueries
    if (queries.length === 0) {
      return {
        status: 'ANALYZING',
        contents: [],
      }
    }

    const result = await runContentSearch({
      queries,
      topicId: state.topicId,
      limit: 10,
      publishTime: 'none',
    })

    const contents = result.contents.map((c, i) => ({
      id: `content-${i + 1}`,
      platform: c.platform,
      url: c.url,
      title: c.title || undefined,
      body: c.content || undefined,
      author: c.author || undefined,
      publishedAt: c.publishedAt || undefined,
      metrics: c.metrics
        ? {
            likes: c.metrics.likes ?? undefined,
            comments: c.metrics.comments ?? undefined,
            shares: c.metrics.shares ?? undefined,
            favorites: c.metrics.favorites ?? undefined,
            views: c.metrics.views ?? undefined,
          }
        : undefined,
    }))

    return {
      contents,
      status: 'ANALYZING',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'content_search',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Viral Analysis ──────────────────────────────

async function viralAnalysisNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  if (state.contents.length === 0) {
    return {
      analyses: [],
      status: 'INSIGHT',
    }
  }

  try {
    const result = await runViralAnalysis({
      contents: state.contents.map((c) => ({
        platform: c.platform,
        url: c.url || '',
        title: c.title || null,
        content: c.body || null,
        author: c.author || null,
        publishedAt: c.publishedAt || null,
        metrics: c.metrics
          ? {
              likes: c.metrics.likes ?? null,
              comments: c.metrics.comments ?? null,
              shares: c.metrics.shares ?? null,
              favorites: c.metrics.favorites ?? null,
              views: c.metrics.views ?? null,
            }
          : null,
      })),
      topicCategory: state.topic.category,
    })

    const analyses: ContentAnalysis[] = result.analyses.map((a) => ({
      contentId: a.url,
      hookScore: 0,
      emotionScore: a.emotionScore,
      relatabilityScore: 0,
      noveltyScore: a.noveltyScore,
      structureScore: 0,
      shareabilityScore: a.viralScore,
      viralScore: a.viralScore,
      reasoning: a.summary,
    }))

    return {
      analyses,
      status: 'INSIGHT',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'viral_analysis',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Audience Insight ─────────────────────────────

async function audienceInsightNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  if (state.contents.length === 0) {
    return {
      insights: {
        painPoints: [],
        emotions: [],
        questions: [],
        opinions: [],
        controversies: [],
        stories: [],
        desires: [],
        fears: [],
      },
      status: 'ANGLE_GENERATION',
    }
  }

  try {
    const result = await runAudienceAnalysis({
      contents: state.contents.map((c) => ({
        platform: c.platform,
        title: c.title || null,
        content: c.body || null,
        metrics: c.metrics
          ? {
              comments: c.metrics.comments ?? null,
              likes: c.metrics.likes ?? null,
            }
          : null,
      })),
      topicCategory: state.topic.category,
      topicKeywords: state.topic.keywords,
    })

    const insights: AudienceInsight = {
      painPoints: result.painPoints,
      emotions: result.emotions.map((e) => e.emotion),
      questions: [],
      opinions: [],
      controversies: [],
      stories: [],
      desires: result.needs,
      fears: [],
      summary: undefined,
    }

    return {
      insights,
      status: 'ANGLE_GENERATION',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'audience_insight',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Angle Generation ─────────────────────────────

async function angleGenerationNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  try {
    const result = await runAngleGeneration({
      topic: state.topic.topic,
      topicProfile: {
        category: state.topic.category || '',
        keywords: state.topic.keywords,
        coreQuestions: state.topic.coreQuestions,
        potentialAngles: state.topic.potentialAngles,
      },
      viralPatterns:
        state.analyses.length > 0
          ? {
              commonStrengths: [],
              viralFactors: [],
              avgViralScore:
                state.analyses.reduce((s, a) => s + a.viralScore, 0) /
                state.analyses.length,
            }
          : undefined,
      count: 5,
    })

    const angles: Angle[] = result.angles.map((a) => ({
      id: a.id,
      title: a.title,
      coreThesis: a.angle,
      targetAudience: a.audienceAppeal,
      emotion: a.targetEmotion,
      noveltyScore: a.estimatedViralScore,
      relatabilityScore: 0,
      shareabilityScore: a.estimatedViralScore,
      risk: undefined,
      supportingEvidence: a.reasoning,
    }))

    return {
      angles,
      status: 'WAITING_FOR_ANGLE_APPROVAL',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'angle_generation',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Content Strategy ────────────────────────────

async function contentStrategyNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  const selectedAngle = state.angles.find(
    (a) => a.id === state.selectedAngleId,
  )
  if (!selectedAngle) {
    return {
      status: 'ERROR',
      ...appendError(state, 'content_strategy', 'No angle selected'),
    }
  }

  try {
    const result = await runContentStrategy({
      topic: state.topic.topic,
      selectedAngle: {
        id: selectedAngle.id,
        title: selectedAngle.title,
        angle: selectedAngle.coreThesis,
        targetEmotion: selectedAngle.emotion || '',
        keyPoints: [],
      },
      topicProfile: {
        keywords: state.topic.keywords,
        coreQuestions: state.topic.coreQuestions,
      },
    })

    const strategy: ContentStrategy = {
      coreThesis: result.title,
      targetEmotion: selectedAngle.emotion,
      targetAudience: selectedAngle.targetAudience,
      hookStrategy: result.hook,
      contentStructure: result.structure as unknown as Record<string, unknown>,
      storyStrategy: undefined,
      conflict: undefined,
      turningPoint: undefined,
      endingStrategy: undefined,
      ctaStrategy: result.callToAction,
    }

    return {
      strategy,
      status: 'WRITING',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'content_strategy',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Writing ──────────────────────────────────────

async function writingNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  const selectedAngle = state.angles.find(
    (a) => a.id === state.selectedAngleId,
  )
  if (!selectedAngle || !state.strategy) {
    return {
      status: 'ERROR',
      ...appendError(state, 'writing', 'Missing angle or strategy'),
    }
  }

  try {
    const result = await runWriting({
      topic: state.topic.topic,
      strategy: {
        title: state.strategy.coreThesis,
        hook: state.strategy.hookStrategy || '',
        structure: (state.strategy.contentStructure as unknown as Array<{
          section: string
          purpose: string
          keyArguments: string[]
          estimatedWords: number
        }>) || [],
        keyArguments: [],
        emotionalArc: { start: '', middle: '', end: '' },
        callToAction: state.strategy.ctaStrategy || '',
        tone: '',
        estimatedWordCount: 1000,
      },
      selectedAngle: {
        title: selectedAngle.title,
        angle: selectedAngle.coreThesis,
        targetEmotion: selectedAngle.emotion || '',
        keyPoints: [],
      },
    })

    const draft: Draft = {
      id: `draft-${Date.now()}`,
      title: result.title,
      content: result.content,
      outline: result.sections as unknown as Record<string, unknown>,
      wordCount: result.wordCount,
      status: 'DRAFT',
    }

    return {
      draft,
      status: 'HUMANIZATION',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'writing',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Humanization ─────────────────────────────────

async function humanizationNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  if (!state.draft) {
    return {
      status: 'ERROR',
      ...appendError(state, 'humanization', 'No draft to humanize'),
    }
  }

  try {
    const result = await runHumanization({
      content: state.draft.content,
      title: state.draft.title,
    })

    const humanizedDraft: Draft = {
      ...state.draft,
      content: result.content,
      title: result.title,
      status: 'HUMANIZED',
    }

    return {
      humanizedDraft,
      status: 'EVALUATING',
    }
  } catch (error) {
    // Humanization failure is not fatal — proceed with original draft
    return {
      humanizedDraft: state.draft,
      status: 'EVALUATING',
      ...appendError(
        state,
        'humanization',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ── Node: Evaluation ───────────────────────────────────

async function evaluationNode(
  state: typeof StateAnnotation.State,
): Promise<Partial<ContentAgentState>> {
  const draft = state.humanizedDraft || state.draft
  if (!draft) {
    return {
      status: 'ERROR',
      ...appendError(state, 'evaluation', 'No draft to evaluate'),
    }
  }

  const selectedAngle = state.angles.find(
    (a) => a.id === state.selectedAngleId,
  )

  try {
    const result = await runEvaluation({
      content: draft.content,
      title: draft.title || '',
      selectedAngle: selectedAngle
        ? {
            title: selectedAngle.title,
            targetEmotion: selectedAngle.emotion || '',
            keyPoints: [],
          }
        : undefined,
    })

    const evaluation: Evaluation = {
      hookScore: 0,
      emotionScore: result.scores.emotionalImpact,
      relatabilityScore: 0,
      noveltyScore: result.scores.novelty,
      structureScore: result.scores.logicalClarity,
      readabilityScore: result.scores.readability,
      shareabilityScore: 0,
      platformFitScore: result.scores.platformFit,
      aiStyleScore: 0,
      overallScore: result.overallScore,
      strengths: result.strengths,
      issues: result.weaknesses,
      suggestions: result.suggestions.map((s) => ({
        issue: s.issue,
        suggestion: s.suggestion,
        priority: s.priority,
      })),
    }

    return {
      evaluation,
      status: 'READY',
    }
  } catch (error) {
    return {
      status: 'ERROR',
      ...appendError(
        state,
        'evaluation',
        error instanceof Error ? error.message : 'Unknown error',
      ),
    }
  }
}

// ─── Agent Graph ────────────────────────────────────────

export function createContentAgent() {
  const graph = new StateGraph(StateAnnotation)
    .addNode('topic_profiling', topicProfilingNode)
    .addNode('content_search', contentSearchNode)
    .addNode('viral_analysis', viralAnalysisNode)
    .addNode('audience_insight', audienceInsightNode)
    .addNode('angle_generation', angleGenerationNode)
    .addNode('content_strategy', contentStrategyNode)
    .addNode('writing', writingNode)
    .addNode('humanization', humanizationNode)
    .addNode('evaluation', evaluationNode)

    // Linear flow with error short-circuits
    .addEdge(START, 'topic_profiling')
    .addConditionalEdges('topic_profiling', (state) => {
      if (state.status === 'ERROR') return END
      return 'content_search'
    })
    .addConditionalEdges('content_search', (state) => {
      if (state.status === 'ERROR') return END
      return 'viral_analysis'
    })
    .addConditionalEdges('viral_analysis', (state) => {
      if (state.status === 'ERROR') return END
      return 'audience_insight'
    })
    .addConditionalEdges('audience_insight', (state) => {
      if (state.status === 'ERROR') return END
      return 'angle_generation'
    })
    .addConditionalEdges('angle_generation', (state) => {
      if (state.status === 'ERROR') return END
      // Wait for human to select an angle
      if (state.status === 'WAITING_FOR_ANGLE_APPROVAL') return END
      return 'content_strategy'
    })
    .addConditionalEdges('content_strategy', (state) => {
      if (state.status === 'ERROR') return END
      return 'writing'
    })
    .addConditionalEdges('writing', (state) => {
      if (state.status === 'ERROR') return END
      return 'humanization'
    })
    .addConditionalEdges('humanization', (state) => {
      if (state.status === 'ERROR') return END
      return 'evaluation'
    })
    .addConditionalEdges('evaluation', () => {
      return END
    })

  return graph.compile()
}

// ─── Agent Runner ───────────────────────────────────────

/**
 * Run the agent from topic profiling through angle generation.
 * Stops at WAITING_FOR_ANGLE_APPROVAL for human-in-the-loop.
 */
export async function runContentAgent(
  initialState: ContentAgentState,
): Promise<ContentAgentState> {
  const agent = createContentAgent()
  const result = await agent.invoke(initialState)
  return result as ContentAgentState
}

/**
 * Resume the agent after angle selection.
 * Runs from content_strategy through evaluation.
 */
export async function resumeContentAgent(
  state: ContentAgentState,
): Promise<ContentAgentState> {
  const agent = createContentAgent()
  // Resume from content_strategy node
  const result = await agent.invoke({
    ...state,
    status: 'STRATEGY',
  } as ContentAgentState)
  return result as ContentAgentState
}

/**
 * Stream the agent execution.
 */
export function streamContentAgent(initialState: ContentAgentState) {
  const agent = createContentAgent()
  return agent.stream(initialState)
}
