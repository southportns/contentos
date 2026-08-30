# transcript-correction

## Purpose

修正 faster-whisper 语音转写文本中的识别错误，如同音/近音词混淆、专有名词误判、断句错误等。

## When To Use

在 `getVideoTranscript` 完成 Whisper 转写后立即调用。利用视频标题/描述作为上下文，通过 LLM 纠正转写中的近似词错误。

## Input

```typescript
interface TranscriptCorrectionInput {
  rawText: string          // Whisper 原始转写文本
  videoDesc?: string       // 视频标题/描述，作为纠错上下文
  videoAuthor?: string     // 视频作者名
  model?: string           // 使用的 Whisper 模型名称
}
```

## Output

```typescript
interface TranscriptCorrectionOutput {
  correctedText: string    // 纠错后的完整文本
  corrections: Array<{
    original: string       // 原始片段
    corrected: string      // 纠错后的片段
    reason: string         // 纠错原因
  }>
  correctionCount: number // 纠错数量
}
```

## Workflow

1. 接收 Whisper 转写的原始文本 + 视频详情作为上下文
2. LLM 逐句检查，识别同音/近音词混淆、专有名词误判等
3. 利用视频标题/描述中的关键词辅助判断
4. 返回纠错后的完整文本 + 纠错详情列表

## v2 优化（纯文本输出）

- **LLM 直接输出纠错后的纯文本**，不再要求 JSON 结构化输出
- 生成时间从 ~14s 降至 ~0.2s（消除 JSON 格式约束带来的生成开销）
- 纠错详情通过本地 diff 算法计算（`diff.ts`），对比原始文本和纠错后文本
- Diff 策略：逐行比较 + LCS 对齐（处理行数不同的情况）

## Tools

- AI Model (generateText — 纯文本输出)
- 本地 Diff 计算（无 LLM 参与）

## Constraints

- 必须保留原始语义，只修正明显的识别错误
- 不添加、不删除内容，不润色文案
- 保守原则：不确定时保留原文
- 保持口播内容的口语化风格

## Version

2.0.0
