/**
 * P0.2.3 — Knowledge Store Types
 *
 * Canonical Knowledge Schema for ContextOS Knowledge Store.
 * Source: docs/p0.2.2.1/VALIDATED_KNOWLEDGE_UNITS.json
 */

// ─── Enums as Types ──────────────────────────────────────────────────────────

export type KnowledgeCategory =
  | 'hook'
  | 'structure'
  | 'emotion'
  | 'perspective'
  | 'language'
  | 'cognition'
  | 'human_expression'
  | 'ending';

export type KnowledgeLevel =
  | 'strategic_pattern'
  | 'structural_pattern'
  | 'expression_principle'
  | 'surface_technique';

export type KUStatus = 'validated' | 'candidate';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type HumanExpressionVerdict = 'confirmed' | 'unconfirmed' | 'suspect';

export type Validation = 'valid' | 'weak' | 'invalid';

export type EvidenceQuality = 'high' | 'medium' | 'low';

export type NoiseRisk = 'low' | 'medium' | 'high';

export type EvidenceTrust = 'trusted' | 'caution' | 'excluded';

// ─── Evidence ────────────────────────────────────────────────────────────────

export interface Evidence {
  evidence_id: string;
  content_id: string;
  quote: string;
  location?: string;
  validation: Validation;
  evidence_quality: EvidenceQuality;
  noise_risk: NoiseRisk;
  evidence_trust: EvidenceTrust;
  note?: string;
}

export interface RetrievalEligibleEvidence extends Evidence {
  retrieval_eligible: boolean;
}

// ─── Evidence Group ──────────────────────────────────────────────────────────

export interface EvidenceGroup {
  items: Evidence[];
  unique_content_count: number;
}

// ─── Knowledge Unit ──────────────────────────────────────────────────────────

export interface CanonicalKnowledgeUnit {
  knowledge_id: string;
  name: string;
  category: KnowledgeCategory;
  knowledge_level: KnowledgeLevel;
  description: string;
  abstract_pattern?: string;
  function?: string;
  confidence: ConfidenceLevel;
  status: KUStatus;
  reclassified: boolean;
  evidence: EvidenceGroup;
  human_expression_verdict?: HumanExpressionVerdict;
  principle?: string;
  surface_forms?: string[];
  note?: string;
}

// ─── Knowledge Query ─────────────────────────────────────────────────────────

export interface KnowledgeQuery {
  topic?: string;
  keywords?: string[];
  category?: KnowledgeCategory[];
  knowledge_level?: KnowledgeLevel[];
  status?: 'validated' | 'candidate' | 'all';
  confidence?: 'high' | 'medium' | 'low';
  include_candidates?: boolean;
  limit?: number;
}

export const DEFAULT_QUERY: Required<Omit<KnowledgeQuery, 'topic' | 'keywords' | 'category' | 'knowledge_level' | 'confidence'>> = {
  status: 'validated',
  include_candidates: false,
  limit: 8,
};

// ─── Retrieval Result ────────────────────────────────────────────────────────

export interface KnowledgeRetrievalResult {
  knowledge_id: string;
  score: number;
  matched_terms: string[];
  knowledge_level: KnowledgeLevel;
  category: KnowledgeCategory;
  confidence: ConfidenceLevel;
  status: KUStatus;
  retrieval_reason: string;
}

// ─── Retrieval Response ──────────────────────────────────────────────────────

export interface KnowledgeRetrievalResponse {
  query: string;
  results: KnowledgeRetrievalResult[];
  total: number;
}

// ─── Index Entry ─────────────────────────────────────────────────────────────

export interface KnowledgeIndexEntry {
  knowledge_id: string;
  name: string;
  category: KnowledgeCategory;
  knowledge_level: KnowledgeLevel;
  status: KUStatus;
  confidence: ConfidenceLevel;
  human_expression_verdict?: HumanExpressionVerdict;
  search_text: string;
  search_name: string;
  search_description: string;
  search_pattern: string;
  trusted_evidence_count: number;
  unique_content_count: number;
  evidence_strength: number;
}

// ─── Dataset Source ──────────────────────────────────────────────────────────

export interface KnowledgeDatasetSource {
  version: string;
  date: string;
  phase: string;
  total_knowledge_units: number;
  statistics: Record<string, unknown>;
  knowledge_units: CanonicalKnowledgeUnit[];
}

// ─── Ranking Weights ─────────────────────────────────────────────────────────

export interface RankingWeights {
  keyword_match: number;
  name_match: number;
  description_match: number;
  category_match: number;
  level_match: number;
  confidence_score: number;
  evidence_strength: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  keyword_match: 0.35,
  name_match: 0.15,
  description_match: 0.15,
  category_match: 0.10,
  level_match: 0.10,
  confidence_score: 0.10,
  evidence_strength: 0.05,
};

// ─── Confidence Score Mapping ────────────────────────────────────────────────

export const CONFIDENCE_SCORES: Record<ConfidenceLevel, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

// ─── Category Synonyms for Keyword Matching ──────────────────────────────────

export const CATEGORY_SYNONYMS: Record<KnowledgeCategory, string[]> = {
  hook: ['开头', '钩子', '引入', '开场', 'hook', '吸引', '注意力'],
  structure: ['结构', '框架', '组织', '布局', 'structure', '层次'],
  emotion: ['情绪', '情感', '共鸣', '感动', 'emotion', '感受'],
  perspective: ['视角', '观点', '立场', '态度', 'perspective', '看法'],
  language: ['语言', '表达', '措辞', '用词', 'language', '说法'],
  cognition: ['认知', '思维', '理解', '认识', 'cognition', '思考'],
  human_expression: ['真人', '自然', '口语', '真实', 'human', '表达'],
  ending: ['结尾', '结束', '收尾', 'ending', '最后'],
};

// ─── Level Synonyms for Keyword Matching ─────────────────────────────────────

export const LEVEL_SYNONYMS: Record<KnowledgeLevel, string[]> = {
  strategic_pattern: ['战略', '策略', '宏观', '认知', '反转', '心理', '底层逻辑', 'strategic', '全局'],
  structural_pattern: ['结构', '模式', '框架', '开头', '钩子', '组织', 'structural'],
  expression_principle: ['表达', '原则', '原理', '真人', '自然', '口语', '真实', '思考', 'expression', '写作'],
  surface_technique: ['技巧', '手法', '表面', '句式', '语言', '数字', '命令', '行动', '文案', 'surface', '技术'],
};
