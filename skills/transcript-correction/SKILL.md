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
2. 检查进程内 LRU 缓存，命中则直接返回
3. 根据文本长度决定策略：
   - 短文本（< 2000 字符）：单次 LLM 调用，支持流式输出
   - 长文本（≥ 2000 字符）：分段并行纠错，Promise.all 并发
4. LLM 直接输出纠错后的纯文本（不要求 JSON）
5. 通过本地 diff 算法计算纠错详情
6. 结果写入缓存并返回

## v3 优化（精简 + 并行 + 流式 + 缓存）

- **精简 System Prompt**：从 ~1500 字符压缩至 ~500 字符，减少 token 处理时间
- **分段并行纠错**：长文本（> 2000 字符）自动切分为 ~1500 字符的 chunk，并行调用 LLM，大幅减少长文本耗时
- **流式输出**：支持 `runTranscriptCorrectionStream()`，前端通过 SSE 实时展示纠错进度
- **进程内 LRU 缓存**：相同 rawText + videoDesc 的纠错结果缓存（max 50 条），避免重复 LLM 调用
- **分段策略**：按自然边界（句号/换行/问号）切分，带 100 字符重叠确保上下文连续性

## v2 优化（纯文本输出）

- LLM 直接输出纠错后的纯文本，不再要求 JSON 结构化输出
- 生成时间从 ~14s 降至 ~0.2s（消除 JSON 格式约束带来的生成开销）
- 纠错详情通过本地 diff 算法计算（`diff.ts`），对比原始文本和纠错后文本
- Diff 策略：逐行比较 + LCS 对齐（处理行数不同的情况）

## Tools

- AI Model (generateText / streamText — 纯文本输出)
- 本地 Diff 计算（无 LLM 参与）
- 进程内 LRU 缓存

## Constraints

- 必须保留原始语义，只修正明显的识别错误
- 不添加、不删除内容，不润色文案
- 保守原则：不确定时保留原文
- 保持口播内容的口语化风格

## Version

3.0.0
