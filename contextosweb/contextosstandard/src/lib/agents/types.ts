// ─── Agent State ─────────────────────────────────────────

export interface TopicProfile {
  topic: string
  category?: string
  keywords: string[]
  relatedTopics: string[]
  coreQuestions: string[]
  audience?: string
  potentialAngles: string[]
  researchQueries: string[]
}

export interface ResearchResult {
  source: string
  url?: string
  content: string
  title?: string
  author?: string
  publishedAt?: string
}

export interface Content {
  id: string
  platform: string
  url?: string
  title?: string
  author?: string
  body?: string
  publishedAt?: string
  metrics?: ContentMetrics
}

export interface ContentMetrics {
  likes?: number
  comments?: number
  shares?: number
  favorites?: number
  views?: number
  engagementRate?: number
}

export interface ContentAnalysis {
  contentId: string
  hookScore: number
  emotionScore: number
  relatabilityScore: number
  noveltyScore: number
  structureScore: number
  shareabilityScore: number
  viralScore: number
  reasoning: string
  contentStructure?: Record<string, unknown>
  emotionCurve?: Record<string, unknown>
}

export interface AudienceInsight {
  painPoints: string[]
  emotions: string[]
  questions: string[]
  opinions: string[]
  controversies: string[]
  stories: string[]
  desires: string[]
  fears: string[]
  summary?: string
}

export interface Angle {
  id: string
  title: string
  coreThesis: string
  targetAudience?: string
  emotion?: string
  noveltyScore: number
  relatabilityScore: number
  shareabilityScore: number
  risk?: string
  supportingEvidence?: string
}

export interface ContentStrategy {
  coreThesis: string
  targetEmotion?: string
  targetAudience?: string
  hookStrategy?: string
  contentStructure?: Record<string, unknown>
  storyStrategy?: string
  conflict?: string
  turningPoint?: string
  endingStrategy?: string
  ctaStrategy?: string
}

export interface Draft {
  id: string
  title?: string
  content: string
  outline?: Record<string, unknown>
  wordCount?: number
  status: 'DRAFT' | 'HUMANIZED' | 'FINAL'
}

export interface Evaluation {
  hookScore: number
  emotionScore: number
  relatabilityScore: number
  noveltyScore: number
  structureScore: number
  readabilityScore: number
  shareabilityScore: number
  platformFitScore: number
  aiStyleScore: number
  overallScore: number
  strengths: string[]
  issues: string[]
  suggestions: Array<{
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
}

export type WorkflowStatus =
  | 'IDLE'
  | 'TOPIC_PROFILING'
  | 'RESEARCHING'
  | 'ANALYZING'
  | 'INSIGHT'
  | 'ANGLE_GENERATION'
  | 'WAITING_FOR_ANGLE_APPROVAL'
  | 'STRATEGY'
  | 'WRITING'
  | 'HUMANIZATION'
  | 'EVALUATING'
  | 'OPTIMIZING'
  | 'READY'
  | 'ERROR'

export interface AgentError {
  step: string
  message: string
  timestamp: string
}

export interface ContentState {
  projectId: string
  topicId: string

  topic: TopicProfile
  research: ResearchResult[]
  contents: Content[]
  analyses: ContentAnalysis[]
  insights: AudienceInsight[]
  angles: Angle[]

  selectedAngleId?: string
  strategy?: ContentStrategy
  draft?: Draft
  evaluation?: Evaluation

  status: WorkflowStatus
  errors: AgentError[]
}

// ─── Agent Run Record ────────────────────────────────────

export interface AgentRunRecord {
  id: string
  topicId: string
  skillId?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  input?: unknown
  output?: unknown
  model?: string
  tokens?: number
  latency?: number
  error?: string
  startedAt?: Date
  completedAt?: Date
}
