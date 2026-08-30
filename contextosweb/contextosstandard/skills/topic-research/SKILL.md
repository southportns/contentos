# topic-research

## Purpose

分析用户输入的主题，生成结构化的 Topic Profile，包括分类、关键词、核心问题、相关主题和研究搜索词。

## When To Use

当用户输入一个新主题时，作为 Agent 的第一个 Skill 被调用。

## Input

```typescript
interface TopicResearchInput {
  topic: string
  platform?: string
  audience?: string
  contentType?: string
  goal?: string
  tone?: string
}
```

## Output

```typescript
interface TopicResearchOutput {
  topic: string
  category: string
  keywords: string[]
  relatedTopics: string[]
  coreQuestions: string[]
  audience?: string
  potentialAngles: string[]
  researchQueries: string[]
}
```

## Workflow

1. 接收用户输入的主题
2. 调用 LLM 分析主题（Structured Output）
3. 生成分类、关键词、核心问题
4. 生成研究搜索词
5. 验证输出

## Tools

- AI Model (generateObject)

## Constraints

- 不虚构数据
- 关键词至少 5 个
- 核心问题至少 3 个
- 研究搜索词至少 5 个

## Validation

- topic 非空
- keywords.length >= 5
- coreQuestions.length >= 3
- researchQueries.length >= 5

## Failure Handling

- LLM 超时：返回错误，允许重试
- LLM 输出格式错误：重试一次
- 主题为空：返回 ValidationError

## Examples

输入：`我们一生都在追求被爱的过程`

输出：
```json
{
  "topic": "我们一生都在追求被爱的过程",
  "category": "情感 / 人生 / 成长",
  "keywords": ["被爱", "父母", "童年", "友情", "爱情", "婚姻", "孤独", "衰老", "陪伴", "安全感"],
  "coreQuestions": [
    "为什么人一生都在寻找被爱？",
    "不同年龄阶段的'被爱'分别是什么？",
    "为什么成年以后越来越难感受到被爱？",
    "人最终真正需要的是被爱，还是被理解？"
  ],
  "potentialAngles": [
    "成年后追求的不是爱情，而是被坚定选择",
    "人真正害怕的不是孤独，而是没有人需要自己"
  ],
  "researchQueries": [
    "被爱 人生感悟",
    "成年人的孤独 情感",
    "安全感 亲密关系"
  ]
}
```

## Version

1.0.0
