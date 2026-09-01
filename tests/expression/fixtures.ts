/**
 * Test fixtures for Expression Engine tests.
 * Sample texts for audit testing: standard AI style, natural style,
 * and overly exaggerated "fake human" style.
 */

// Sample A — Standard AI style
export const SAMPLE_AI_STYLE = `首先，我们需要认识到，在这个快节奏的时代，每个人都在追求更好的生活。其次，值得注意的是，随着年龄的增长，我们对幸福的定义也在不断变化。最后，综上所述，真正重要的不是我们拥有了什么，而是我们是谁。

从某种意义上来说，人生就是一场不断寻找的旅程。本质上，我们追求的不是物质，而是内心的满足。更值得关注的是，很多人忽略了身边最重要的东西。

归根结底，幸福不在远方，就在此刻。真正重要的是学会珍惜当下，珍惜身边的人。`

// Sample B — Natural human style
export const SAMPLE_NATURAL = `有时候晚上回到家，房门一关，突然发现今天一整天都没跟谁真正说过话。

也不是没有社交。白天在办公室，微信群里热闹得很。但那种热闹跟这个没关系。

后来我想了很久才明白，可能不是没人跟我说话，是我自己把那扇门关上了。也不记得是从什么时候开始的了。`

// Sample C — Exaggerated fake human style
export const SAMPLE_FAKE_HUMAN = `其实吧，就是，你知道吗，有时候我会觉得，就是那种感觉，怎么说呢...就是其实吧，人这一辈子，就是，有很多事情，你以为是那样的，其实不是。

然后呢，就是，说实话，我真的觉得，就是，你有没有发现，很多时候，我们其实，就是，不知道自己在干嘛...`

// Valid ExpressionPlan for testing
export const VALID_EXPRESSION_PLAN = {
  version: '1.0' as const,
  speaker: {
    role: '一个经历过的普通人',
    relationshipToAudience: '朋友',
    authority: 'low' as const,
    emotionalDistance: 'close' as const,
  },
  thoughtPath: [
    { step: 1, mode: 'observation' as const, purpose: '建立共同经验' },
    { step: 2, mode: 'contradiction' as const, purpose: '打破第一印象' },
    { step: 3, mode: 'realization' as const, purpose: '形成真正观点' },
    { step: 4, mode: 'reflection' as const, purpose: '留下余味' },
  ],
  emotionCurve: [
    { stage: '开头', emotion: 'calm', intensity: 30 },
    { stage: '中段', emotion: 'reflective', intensity: 50 },
    { stage: '高潮', emotion: 'slightly_sad', intensity: 70 },
    { stage: '结尾', emotion: 'restrained', intensity: 40 },
  ],
  rhythm: {
    sentenceVariance: 'high' as const,
    paragraphVariance: 'high' as const,
    shortSentencePreference: 'medium' as const,
    pauseFrequency: 'medium' as const,
  },
  expression: {
    oralness: 'high' as const,
    specificity: 'high' as const,
    reflection: 'high' as const,
    imperfectionTolerance: 'medium' as const,
  },
  opening: {
    mode: 'observation' as const,
    instruction: '从一个具体场景开始',
  },
  conclusion: {
    mode: 'open_ended' as const,
    instruction: '留下余味，不强行总结',
  },
  constraints: {
    mustPreserve: ['核心观点：不是没人爱，是自己关上了门'],
    avoidPatterns: ['首先/其次/最后', '在这个...时代', '综上所述'],
    truthConstraints: ['禁止伪造作者真实经历', '禁止虚构引用和数据'],
  },
}

// Valid ExpressionAudit for testing
export const VALID_EXPRESSION_AUDIT = {
  version: '1.0' as const,
  overallScore: 82,
  dimensions: {
    naturalness: 85,
    voiceConsistency: 80,
    specificity: 78,
    rhythm: 82,
    thoughtAuthenticity: 84,
    emotionalAuthenticity: 81,
    structuralNaturalness: 80,
  },
  issues: [
    {
      id: 'issue-1',
      type: 'formulaic' as const,
      severity: 'medium' as const,
      location: { paragraphIndex: 1, sentenceIndex: 0, quote: '从某种意义上来说' },
      diagnosis: '使用了模板化表达',
      rewriteInstruction: '替换为更自然的过渡',
    },
  ],
  pass: true,
}

// ExpressionAudit that should trigger rewrite
export const FAILING_EXPRESSION_AUDIT = {
  version: '1.0' as const,
  overallScore: 55,
  dimensions: {
    naturalness: 50,
    voiceConsistency: 60,
    specificity: 45,
    rhythm: 55,
    thoughtAuthenticity: 58,
    emotionalAuthenticity: 52,
    structuralNaturalness: 48,
  },
  issues: [
    {
      id: 'issue-1',
      type: 'formulaic' as const,
      severity: 'high' as const,
      location: { paragraphIndex: 0, sentenceIndex: 0, quote: '首先' },
      diagnosis: '高频模板化开头',
      rewriteInstruction: '替换为具体场景开头',
    },
    {
      id: 'issue-2',
      type: 'generic' as const,
      severity: 'medium' as const,
      location: { paragraphIndex: 1, sentenceIndex: 0, quote: '从某种意义上来说' },
      diagnosis: '抽象空洞表达',
      rewriteInstruction: '增加具体观察',
    },
  ],
  pass: false,
}
