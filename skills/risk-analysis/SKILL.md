# risk-analysis

## Purpose

对生成的内容进行网络风控分析，识别可能违反中国网络安全法律法规和抖音平台规定的内容，逐条列出风险点，帮助创作者（尤其是新手）避免因内容违规导致封号或其他处罚。

## When To Use

在 writing skill 生成初稿后调用。在 evaluation 之后或同时调用。

## Input

```typescript
interface RiskAnalysisInput {
  content: string
  title: string
  platform?: string
}
```

## Output

```typescript
interface RiskAnalysisOutput {
  risks: Array<{
    category: 'political_sensitive' | 'social_sensitive' | 'personal_privacy' | 'misinformation' | 'hate_speech' | 'commercial_compliance' | 'platform_violation' | 'legal_risk'
    severity: 'high' | 'medium' | 'low'
    description: string
    suggestion: string
    quote?: string
  }>
  overallRiskLevel: 'safe' | 'low' | 'medium' | 'high'
  summary: string
}
```

## Workflow

1. 接收初稿内容
2. 调用 LLM 进行风控分析（Structured Output）
3. 依据法律法规和抖音社区规范逐条识别风险
4. 每条风险包含：类别、严重程度、描述、修改建议
5. 返回风险评估结果

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 依据真实法律法规和平台规范分析，不虚构规则
- 不夸大风险，也不遗漏真实风险
- 修改建议必须具体可操作
- 对新手友好的解释风格
- 如果内容确实没有风险，返回空 risks 数组和 safe 级别

## Legal Basis

- 《中华人民共和国网络安全法》
- 《互联网信息服务管理办法》
- 《网络信息内容生态治理规定》
- 《中华人民共和国个人信息保护法》
- 《中华人民共和国民法典》
- 《中华人民共和国治安管理处罚法》
- 《广告法》
- 《互联网用户公众账号信息服务管理规定》
- 抖音社区规范

## Version

1.0.0
