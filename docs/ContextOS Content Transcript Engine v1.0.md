# ContextOS Content Transcript Engine v1.0

> 文档版本：v1.0  
> 产品：ContextOS  
> 模块：Content Transcript Engine  
> 状态：Architecture / Development Specification  
> 目标：构建面向抖音等短视频内容分析的高质量口播稿提取系统

---

# 1. 模块定位

Content Transcript Engine 是 ContextOS 的核心基础能力之一。

它负责将：

```text
短视频 URL
↓
视频媒体
↓
音频
↓
语音识别
↓
字幕 / OCR
↓
评论 / 标题 / 描述上下文
↓
多源融合
↓
语义纠错
↓
高可信口播稿
```

最终输出为：

```text
Raw Transcript
+
Timed Transcript
+
Corrected Transcript
+
Confidence Score
+
Transcript Metadata
```

该模块的目标不是简单完成 Speech-to-Text，而是建立：

> **面向内容分析场景的高可信短视频 Transcript 基础设施。**

---

# 2. 核心设计原则

## 2.1 采集层与识别层解耦

ContextOS 当前通过：

```text
douyin-ingest
```

负责：

```text
Douyin URL
Video
Audio
Metadata
Comments
```

该模块继续保留，不进行整体替换。

只将现有的：

```text
Douyin Ingest
    ↓
faster-whisper
```

升级为：

```text
Douyin Ingest
    ↓
Content Transcript Engine
```

---

# 3. 双执行模式

ContextOS 为用户提供两种 Transcript 处理模式。

```text
                 ContextOS
                     │
          Content Transcript Engine
                     │
              ┌──────┴──────┐
              │             │
        LOCAL MODE       CLOUD MODE
              │             │
      本地模型推理        云端 ASR API
              │             │
       用户本机计算       第三方云服务
```

## 3.1 Local AI Mode

适用于：

```text
拥有 NVIDIA GPU
拥有足够显存
愿意本地部署模型
重视隐私
处理大量视频
```

本地模式采用双 ASR：

```text
Fun-ASR-Nano
+
GLM-ASR-Nano
```

FunASR 当前官方模型库将 Fun-ASR-Nano 定位为 LLM-ASR 路线，支持中文及中文方言，同时支持热词、时间戳、VAD 和说话人相关能力；GLM-ASR-Nano 为 1.5B 参数开源模型，官方强调其复杂声学环境、低音量及方言场景能力。

---

## 3.2 Cloud AI Mode

适用于：

```text
没有 GPU
低配置电脑
Mac 普通设备
旧电脑
不希望安装模型
希望快速获得结果
希望降低本地资源占用
```

云端模式：

```text
视频
↓
ContextOS
↓
Audio preprocessing
↓
Cloud ASR Provider
↓
Transcript
↓
ContextOS Fusion
↓
最终 Transcript
```

第一阶段优先接入：

```text
Alibaba Cloud Model Studio
Volcengine Speech
```

阿里云百炼目前提供 `Fun-ASR`、`Fun-ASR-Flash`、`Qwen3-ASR-Flash` 等非实时语音识别模型，其中文件转写支持较长音频，部分模型支持热词、说话人分离等能力。

火山引擎也提供大模型录音文件极速识别 API，适合短视频音频文件快速提交和返回识别结果。

---

# 4. 用户体验设计

用户进入：

```text
视频分析
```

选择：

```text
口播稿识别
```

系统显示：

```text
┌──────────────────────────────────────┐
│ 口播稿识别模式                       │
│                                      │
│ ◉ 云端高质量                         │
│   无需 GPU，推荐普通用户             │
│                                      │
│ ○ 本地高质量                         │
│   使用本机 GPU，隐私更好             │
│                                      │
│ ○ 自动选择                           │
│   ContextOS 根据本机配置自动判断     │
└──────────────────────────────────────┘
```

默认：

```text
AUTO
```

---

# 5. Auto Mode

系统启动时检测：

```text
OS
CPU
RAM
GPU
GPU Vendor
VRAM
CUDA
Driver
Python
Model Runtime
```

形成：

```typescript
interface HardwareProfile {
  os: string;
  cpu: string;
  ramGB: number;
  gpu?: string;
  vramGB?: number;
  cudaAvailable: boolean;
  cudaVersion?: string;
}
```

系统根据硬件能力选择：

```text
HIGH
MEDIUM
LOW
UNSUPPORTED
```

---

# 6. Local Mode 硬件策略

Local 模式采用：

```text
PRIMARY

Fun-ASR-Nano
+
GLM-ASR-Nano
```

但是：

> **两个模型不是强制同时运行。**

系统必须先进行资源检测。

---

## 6.1 Local Capability Levels

### LEVEL A

```text
高性能 GPU
```

允许：

```text
Fun-ASR
+
GLM-ASR
```

双模型并行或者串行。

---

### LEVEL B

```text
中等 GPU
```

允许：

```text
Fun-ASR
```

主模型。

必要时：

```text
GLM-ASR
```

二次验证。

---

### LEVEL C

```text
低配置设备
```

不启动 LLM-ASR。

可以使用轻量 ASR：

```text
SenseVoice
Paraformer
```

FunASR 当前官方运行时也提供 SenseVoice、Paraformer 等轻量路线，并提供 CPU / Windows 等运行方式。

---

### LEVEL D

```text
没有合适本地推理条件
```

自动建议：

```text
切换到 Cloud Mode
```

---

# 7. Local Mode 模型架构

```text
                  Audio
                    │
                   VAD
                    │
          ┌─────────┴─────────┐
          │                   │
     Fun-ASR-Nano        GLM-ASR-Nano
          │                   │
          └─────────┬─────────┘
                    ↓
             Transcript Fusion
```

Fun-ASR 官方接口支持：

```text
VAD
Hotwords
Character-level timestamps
Speaker diarization
Punctuation
```

这些能力应该统一封装进 ContextOS Provider。

---

# 8. Cloud Mode 架构

```text
                    Video
                      │
                  FFmpeg
                      │
                    Audio
                      │
             Context Builder
                      │
                      ↓
              Cloud ASR Router
                      │
           ┌──────────┴──────────┐
           │                     │
       Alibaba                 Volcengine
       Qwen/Fun-ASR            BigModel ASR
           │                     │
           └──────────┬──────────┘
                      ↓
               Transcript Result
                      ↓
              ContextOS Fusion
```

---

# 9. Cloud Provider 抽象

不得将具体云厂商写死在业务逻辑中。

定义：

```typescript
interface CloudASRProvider {
  id: string;

  transcribe(
    input: AudioInput,
    options: ASROptions
  ): Promise<ASRResult>;

  estimateCost(
    input: AudioInput
  ): Promise<CostEstimate>;

  healthCheck(): Promise<boolean>;
}
```

实现：

```text
AlibabaASRProvider
VolcengineASRProvider
```

未来可以增加：

```text
TencentASRProvider
OpenAIASRProvider
DeepgramASRProvider
```

而不修改核心业务逻辑。

---

# 10. Unified ASR Provider

Local 和 Cloud 必须共用统一接口。

```typescript
interface ASRProvider {

  readonly id: string;

  readonly mode:
    | "local"
    | "cloud";

  transcribe(
    audio: AudioInput,
    options?: ASROptions
  ): Promise<TranscriptResult>;

  healthCheck(): Promise<ProviderHealth>;

  estimateCost(
    audio: AudioInput
  ): Promise<CostEstimate>;
}
```

实现：

```text
LocalFunASRProvider
LocalGLMASRProvider

CloudAlibabaASRProvider
CloudVolcengineASRProvider
```

---

# 11. Audio Processing Pipeline

原始视频：

```text
MP4
```

经过：

```text
FFmpeg
↓
Mono
↓
16kHz
↓
PCM WAV
```

然后：

```text
Noise Analysis
↓
VAD
↓
Speech Segments
```

推荐统一内部音频格式：

```text
PCM
16kHz
mono
16-bit
```

---

# 12. VAD

VAD 的目标：

```text
过滤音乐
过滤长静音
减少 ASR 输入
缩短处理时间
提高识别稳定性
```

输出：

```json
{
  "segments": [
    {
      "start": 1.21,
      "end": 4.83
    },
    {
      "start": 6.11,
      "end": 12.92
    }
  ]
}
```

---

# 13. Source Separation

默认不启用。

只有：

```text
ASR confidence < threshold
```

或者：

```text
background_music_score > threshold
```

才启动。

流程：

```text
Audio
↓
Audio Quality Analyzer
↓
判断背景音乐 / 噪声
↓
必要时
↓
Speech Enhancement / Source Separation
↓
重新 ASR
```

避免每个视频都浪费 GPU / 时间。

---

# 14. OCR Subtitle Engine

很多短视频已经包含：

```text
自动字幕
人工字幕
标题
贴纸
商品名
品牌名
人名
知识点
```

因此 ContextOS 必须建立：

```text
Video OCR Engine
```

流程：

```text
Video
↓
Keyframe Sampling
↓
Subtitle Region Detection
↓
OCR
↓
Text Timeline
```

输出：

```json
{
  "text": "一个女人真正变美的开始",
  "start": 4.21,
  "end": 6.91,
  "confidence": 0.96
}
```

---

# 15. Dynamic Hotword Engine

ContextOS 的一个重要增强能力。

ASR 在识别前自动生成：

```text
Dynamic Hotwords
```

来源：

```text
视频标题
+
视频描述
+
评论
+
OCR
+
用户选择的内容领域
+
ContextOS Knowledge Base
```

例如：

```text
领域：
女性成长

Hotwords:

情绪价值
内耗
安全感
依恋
原生家庭
边界感
亲密关系
```

美妆领域：

```text
A醇
视黄醇
烟酰胺
神经酰胺
玻尿酸
早C晚A
```

这些热词再传给支持 hotwords 的 ASR Provider。

Fun-ASR 官方接口支持热词参数，适合这种动态词表机制。

---

# 16. Comment Context Engine

ContextOS 已经能够获得评论。

评论不能只用于：

```text
评论分析
```

同时可以用于：

```text
ASR Context
```

流程：

```text
Comments
↓
Keyword Extraction
↓
Entity Extraction
↓
Term Ranking
↓
Hotword Candidate
↓
ASR
```

例如：

```text
评论：

“这是A醇吗？”

“视黄醇真的有效吗？”

“这个和烟酰胺能一起用吗？”
```

生成：

```text
A醇
视黄醇
烟酰胺
```

用于 ASR。

---

# 17. Transcript Fusion

多来源：

```text
ASR-A
ASR-B
OCR
Subtitle
Comment Context
Video Metadata
```

进入：

```text
Transcript Fusion Engine
```

---

## 17.1 Example

ASR A：

```text
真正让皮肤变好的不是贵妇产品
```

ASR B：

```text
真正让皮肤变好的不是贵妇品牌
```

OCR：

```text
真正让皮肤变好的
不是贵妇产品
```

最终：

```text
真正让皮肤变好的，不是贵妇产品。
```

---

# 18. LLM Correction Layer

LLM 只允许执行：

```text
断句
标点恢复
同音词纠错
明显 ASR 错误修复
重复词处理
口语结构恢复
```

禁止：

```text
改写
润色
扩写
总结
增加原视频不存在的观点
改变原意
```

---

# 19. Correction Prompt

系统 Prompt：

```text
你是 ContextOS Transcript Correction Engine。

你的任务不是改写文案，而是恢复原始视频中真实说出的内容。

允许：
1. 修正明显的 ASR 同音错误。
2. 修正明显的专有名词识别错误。
3. 根据上下文恢复正确词语。
4. 添加合理标点。
5. 根据语义进行自然断句。
6. 删除明显的 ASR 重复片段。
7. 合并因 VAD 切分导致的同一句话。

禁止：
1. 添加原始音频中不存在的信息。
2. 改变原始表达含义。
3. 将口语改写成营销文案。
4. 主动润色语言。
5. 总结内容。
6. 删除具有语义意义的口语表达。
7. 根据常识猜测不存在的内容。

如果无法确定一个词，
保留原始 ASR 结果，
不要猜测。

最终输出必须忠实于原始视频。
```

---

# 20. Transcript 数据模型

最终统一：

```typescript
interface TranscriptResult {

  id: string;

  source: {
    type: "douyin";
    videoId?: string;
    url: string;
  };

  provider: {
    mode: "local" | "cloud";
    provider: string;
    model: string;
  };

  language: string;

  rawText: string;

  correctedText: string;

  confidence: number;

  durationMs: number;

  segments: TranscriptSegment[];

  sources: TranscriptSource[];

  quality: TranscriptQuality;

  metadata: TranscriptMetadata;
}
```

---

# 21. Segment Schema

```typescript
interface TranscriptSegment {

  id: string;

  startMs: number;

  endMs: number;

  rawText: string;

  correctedText: string;

  confidence: number;

  speaker?: string;

  source:
    | "asr"
    | "ocr"
    | "subtitle"
    | "fusion";

  corrections?: TranscriptCorrection[];
}
```

---

# 22. Transcript Source

```typescript
interface TranscriptSource {

  type:
    | "fun-asr"
    | "glm-asr"
    | "whisper"
    | "sensevoice"
    | "paraformer"
    | "ocr"
    | "subtitle";

  provider?: string;

  model?: string;

  confidence?: number;

  processingTimeMs: number;
}
```

---

# 23. Quality Model

ContextOS 必须产生：

```text
Transcript Confidence Score
```

范围：

```text
0 - 100
```

组成：

```text
ASR Confidence
+
Model Agreement
+
OCR Agreement
+
Subtitle Agreement
+
Language Consistency
+
Hotword Consistency
+
Semantic Consistency
```

建议：

```text
ASR          25%
Model        20%
OCR          15%
Subtitle     10%
Hotword      10%
Semantic     20%
```

---

# 24. Quality Levels

```text
95 - 100
EXCELLENT

90 - 94
HIGH

80 - 89
GOOD

70 - 79
FAIR

< 70
LOW
```

---

# 25. Retry Strategy

不要无条件重新识别。

使用：

```text
Confidence Driven Retry
```

---

## Level 1

```text
一次 ASR
```

如果：

```text
confidence >= 90
```

直接进入校正。

---

## Level 2

```text
Primary ASR
+
OCR
+
Hotwords
```

---

## Level 3

```text
Fun-ASR
+
GLM-ASR
```

---

## Level 4

```text
Audio Enhancement
+
重新 ASR
```

---

## Level 5

```text
Cloud Fallback
```

---

# 26. Local → Cloud Fallback

这是双模式真正重要的地方。

即使用户选择：

```text
Local
```

也不能认为必须 100% 本地完成。

例如：

```text
Local ASR
↓
confidence = 61
↓
本地质量不足
↓
提示：

“本地识别质量不足，是否使用云端高质量识别？”
```

用户选择：

```text
使用云端
```

然后：

```text
Cloud ASR
```

---

# 27. Cloud → Local

反方向也可以。

如果用户选择：

```text
Cloud
```

未来可以增加：

```text
隐私模式
```

或者企业版本：

```text
所有数据本地化
```

则自动切换：

```text
Local Mode
```

---

# 28. Auto Mode Decision Tree

```text
START
  │
  ↓
检测硬件
  │
  ├── GPU 足够？
  │       │
  │      YES
  │       ↓
  │   Local Available
  │
  │      NO
  │       ↓
  │   Cloud Recommended
  │
  ↓
用户是否选择 AUTO？
  │
  ├── YES
  │    ↓
  │  根据能力自动选择
  │
  └── NO
       ↓
     使用用户指定模式
```

---

# 29. 用户界面建议

识别模式：

```text
┌─────────────────────────────────────────┐
│ 口播稿识别                               │
│                                         │
│  ⚡ AI 处理模式                          │
│                                         │
│  ● 云端高质量                            │
│    推荐 · 无需 GPU · 识别质量高          │
│                                         │
│  ○ 本地高质量                            │
│    隐私优先 · 需要较高 GPU               │
│                                         │
│  ○ 自动选择                              │
│    ContextOS 自动选择最佳方案            │
│                                         │
└─────────────────────────────────────────┘
```

---

# 30. Local Mode UI

检测完成：

```text
本机 AI 能力

GPU
RTX XXXX

显存
XX GB

推荐模式
双模型高质量识别

预计速度
约 X.X × Real-time
```

低配置：

```text
本机不适合运行高质量双模型 ASR。

推荐：
☁ 云端高质量识别
```

---

# 31. Cloud Mode UI

显示：

```text
云端识别

服务商：
Alibaba Cloud

模型：
Fun-ASR / Qwen3-ASR

预计耗时：
约 XX 秒

预计成本：
¥X.XX
```

---

# 32. 用户隐私设计

Cloud Mode 必须明确告知：

```text
视频或音频将发送至第三方 AI 服务进行语音识别。
```

用户可以选择：

```text
☑ 识别完成后删除云端临时文件
☑ 不保存原始音频
☑ 不保存第三方识别结果
```

Local Mode：

```text
音频不离开本机
```

---

# 33. Cloud Storage Strategy

不要直接把抖音视频 URL 永久交给第三方。

推荐：

```text
Douyin Video
↓
Local Temporary File
↓
Audio Extraction
↓
Temporary Object Storage
↓
Cloud ASR
↓
Transcript
↓
Delete temporary audio
```

生命周期：

```text
TTL = 30min ~ 2h
```

识别完成自动清理。

---

# 34. Cost Optimization

Cloud 模式不能每个视频调用两个云模型。

默认：

```text
Primary Cloud ASR
↓
Confidence Check
↓
只有低质量时
↓
Secondary Cloud ASR
```

成本结构：

```text
80% 视频
一次识别

15% 视频
二次识别

5% 视频
增强 + 二次识别
```

实际比例通过日志持续调整。

---

# 35. Cloud Provider Routing

设计：

```typescript
class ASRRouter {

  selectProvider(
    task: TranscriptTask
  ): ASRProvider {

    if (task.providerPreference) {
      return providerRegistry.get(
        task.providerPreference
      );
    }

    return providerRegistry.getBest({
      language: task.language,
      duration: task.duration,
      quality: task.quality,
      budget: task.budget
    });
  }
}
```

---

# 36. Provider Selection Factors

```text
Quality
Latency
Price
Availability
Language
Region
Audio Duration
User Plan
```

形成：

```text
Provider Score
```

例如：

```text
Alibaba
Quality 94
Latency 88
Price 91
Availability 99

Overall 93
```

---

# 37. Model Evaluation Framework

ContextOS 不应该凭感觉选择模型。

建立：

```text
ASR Benchmark Dataset
```

第一批：

```text
50 - 100 条真实短视频
```

覆盖：

```text
情感
美妆
知识
财经
职场
宠物
探店
剧情
直播切片
教育
```

---

# 38. Benchmark Metrics

不能只看 WER。

ContextOS 使用：

```text
CER
WER
Named Entity Error Rate
Brand Error Rate
Number Error Rate
Sentence Boundary Accuracy
Timestamp Accuracy
Semantic Preservation
Content Completeness
```

---

# 39. Ground Truth

人工制作：

```text
Ground Truth Transcript
```

然后：

```text
Fun-ASR
GLM-ASR
Whisper
Cloud ASR
```

分别测试。

---

# 40. Benchmark Output

最终生成：

```text
Model Evaluation

Fun-ASR
CER: 2.8%
Brand Error: 1.9%
Semantic: 96
Average Latency: 12s

GLM-ASR
CER: 3.0%
Brand Error: 1.5%
Semantic: 97
Average Latency: 15s

Cloud A
CER: 2.5%
Brand Error: 1.3%
Semantic: 98
Average Latency: 8s
```

注意：

> 这些数字只是输出格式示例，不能作为实际性能结论。

---

# 41. 数据库设计

新增：

```text
transcript_jobs
transcript_results
transcript_segments
transcript_sources
transcript_corrections
transcript_quality_scores
asr_providers
asr_models
asr_usage_logs
```

---

# 42. transcript_jobs

```sql
CREATE TABLE transcript_jobs (
  id UUID PRIMARY KEY,

  user_id UUID,

  video_id UUID,

  mode TEXT NOT NULL,

  provider_id TEXT,

  model_id TEXT,

  status TEXT NOT NULL,

  progress INTEGER DEFAULT 0,

  retry_count INTEGER DEFAULT 0,

  started_at TIMESTAMPTZ,

  completed_at TIMESTAMPTZ,

  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 43. transcript_results

```sql
CREATE TABLE transcript_results (
  id UUID PRIMARY KEY,

  job_id UUID NOT NULL,

  raw_text TEXT,

  corrected_text TEXT,

  confidence NUMERIC(5,2),

  language TEXT,

  duration_ms INTEGER,

  provider TEXT,

  model TEXT,

  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 44. transcript_segments

```sql
CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY,

  transcript_id UUID NOT NULL,

  start_ms INTEGER NOT NULL,

  end_ms INTEGER NOT NULL,

  raw_text TEXT NOT NULL,

  corrected_text TEXT,

  confidence NUMERIC(5,2),

  speaker TEXT,

  source_type TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 45. transcript_sources

```sql
CREATE TABLE transcript_sources (
  id UUID PRIMARY KEY,

  transcript_id UUID NOT NULL,

  source_type TEXT NOT NULL,

  provider TEXT,

  model TEXT,

  confidence NUMERIC(5,2),

  processing_time_ms INTEGER,

  raw_output JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 46. asr_providers

```sql
CREATE TABLE asr_providers (
  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,

  type TEXT NOT NULL,

  enabled BOOLEAN DEFAULT TRUE,

  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 47. asr_models

```sql
CREATE TABLE asr_models (
  id TEXT PRIMARY KEY,

  provider_id TEXT NOT NULL,

  name TEXT NOT NULL,

  mode TEXT NOT NULL,

  languages JSONB,

  capabilities JSONB,

  min_vram_gb NUMERIC,

  enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 48. Provider Registry

推荐代码结构：

```text
src/
└── modules/
    └── transcript/
        ├── domain/
        │   ├── transcript.types.ts
        │   ├── transcript.schema.ts
        │   └── transcript.interfaces.ts
        │
        ├── providers/
        │   ├── local/
        │   │   ├── fun-asr.provider.ts
        │   │   ├── glm-asr.provider.ts
        │   │   ├── sensevoice.provider.ts
        │   │   └── paraformer.provider.ts
        │   │
        │   └── cloud/
        │       ├── aliyun.provider.ts
        │       └── volcengine.provider.ts
        │
        ├── pipeline/
        │   ├── audio-preprocessor.ts
        │   ├── vad-engine.ts
        │   ├── ocr-engine.ts
        │   ├── hotword-engine.ts
        │   ├── fusion-engine.ts
        │   ├── correction-engine.ts
        │   └── quality-engine.ts
        │
        ├── routing/
        │   ├── hardware-detector.ts
        │   ├── provider-router.ts
        │   └── retry-policy.ts
        │
        └── services/
            ├── transcript-service.ts
            └── transcript-job-service.ts
```

---

# 49. 完整 Pipeline

## Standard Pipeline

```text
Douyin URL
↓
douyin-ingest
↓
Video
+
Metadata
+
Comments
↓
Media Processor
↓
Audio Extraction
↓
Audio Quality Analysis
↓
VAD
↓
Primary ASR
↓
OCR
↓
Dynamic Hotwords
↓
Optional Secondary ASR
↓
Transcript Fusion
↓
LLM Correction
↓
Quality Scoring
↓
Retry if needed
↓
Final Transcript
↓
ContextOS Content Analysis
```

---

# 50. Local Pipeline

```text
Video
↓
Audio
↓
VAD
↓
Fun-ASR-Nano
        +
GLM-ASR-Nano
↓
Fusion
↓
OCR
↓
LLM Correction
↓
Confidence
↓
Final
```

---

# 51. Cloud Pipeline

```text
Video
↓
Audio
↓
VAD
↓
Primary Cloud ASR
↓
OCR
↓
Fusion
↓
Confidence
↓
     ┌──────────────┐
     │ Confidence   │
     │ >= threshold │
     └──────┬───────┘
            │
           YES
            ↓
        Final
            │
           NO
            ↓
      Secondary ASR
            ↓
          Fusion
            ↓
          Final
```

---

# 52. 最终 Transcript 示例

```json
{
  "rawText": "其实我们一生都在追求被爱小时候是父母长大了是朋友恋人",

  "correctedText": "其实，我们一生都在追求被爱。小时候，是父母；长大以后，是朋友、恋人。",

  "confidence": 96.4,

  "segments": [
    {
      "startMs": 420,
      "endMs": 3800,
      "rawText": "其实我们一生都在追求被爱",
      "correctedText": "其实，我们一生都在追求被爱。",
      "confidence": 97.8
    }
  ]
}
```

---

# 53. 与 ContextOS 内容分析层的接口

Transcript Engine 只负责：

```text
“他说了什么”
```

不能直接负责：

```text
“他说得好不好”
```

因此输出后进入：

```text
Content Understanding Engine
```

例如：

```text
Transcript
↓
Topic Extraction
↓
Hook Detection
↓
Content Structure
↓
Emotion Analysis
↓
Argument Analysis
↓
CTA Analysis
↓
Viral Pattern Analysis
```

---

# 54. 必须区分三个概念

## Transcript

```text
原视频说了什么
```

## Content Analysis

```text
为什么这样说
```

## Content Generation

```text
我们应该怎么重新写
```

三层严格隔离。

---

# 55. API

## 创建任务

```http
POST /api/transcript/jobs
```

请求：

```json
{
  "videoId": "xxx",
  "mode": "auto",
  "quality": "high"
}
```

---

# 56. 支持的 Mode

```text
auto
local
cloud
```

---

# 57. Quality

```text
standard
high
maximum
```

建议：

```text
standard
一次 ASR

high
ASR + OCR + correction

maximum
双 ASR + OCR + fusion + correction
```

---

# 58. Provider Preference

```json
{
  "mode": "cloud",
  "providerPreference": "aliyun"
}
```

或者：

```json
{
  "mode": "local",
  "providerPreference": "fun-asr"
}
```

---

# 59. 用户套餐设计预留

免费用户：

```text
Cloud Standard
```

Pro：

```text
Cloud High
```

Power User：

```text
Local
+
Cloud
+
Maximum
```

企业：

```text
Local Only
```

---

# 60. 本地模型下载策略

不要首次打开应用就下载：

```text
Fun-ASR
+
GLM-ASR
```

应该：

```text
检测用户选择 Local
↓
检测硬件
↓
显示模型大小
↓
显示推荐
↓
用户确认
↓
后台下载
```

模型管理器：

```text
Model Manager
```

负责：

```text
download
verify
cache
update
delete
load
unload
```

---

# 61. GPU 内存策略

模型运行前必须进行：

```text
VRAM Check
```

如果：

```text
insufficient
```

禁止直接启动模型。

返回：

```json
{
  "code": "INSUFFICIENT_VRAM",
  "recommendedMode": "cloud"
}
```

而不是：

```text
模型启动
↓
CUDA OOM
↓
系统崩溃
```

---

# 62. 模型生命周期

不要长期同时驻留：

```text
Fun-ASR
GLM-ASR
```

可以：

```text
Load Fun
↓
Inference
↓
Unload
↓
Load GLM
↓
Inference
↓
Unload
```

低显存设备优先：

```text
Sequential Inference
```

高性能设备：

```text
Parallel Inference
```

---

# 63. Local Runtime

优先支持：

```text
Python
+
FastAPI
```

ContextOS Web：

```text
Next.js
```

通过：

```text
HTTP
```

调用本地 ASR Service。

架构：

```text
ContextOS Web
      ↓
localhost API
      ↓
Transcript Service
      ↓
Fun-ASR / GLM-ASR
```

---

# 64. Why not put models directly in Next.js

禁止：

```text
Next.js
↓
直接加载模型
```

因为：

```text
模型生命周期
GPU
Python dependency
CUDA
FFmpeg
```

都不应该和 Web Runtime 强绑定。

应该：

```text
Next.js
↓
Transcript API
↓
Python AI Runtime
```

---

# 65. Cloud Runtime

Cloud 模式无需用户安装：

```text
PyTorch
CUDA
FunASR
GLM-ASR
```

只需要：

```text
ContextOS Web
+
Cloud API Key
```

或者：

```text
ContextOS Managed API
```

---

# 66. ContextOS Managed Cloud

未来推荐加入：

```text
ContextOS ASR Gateway
```

架构：

```text
User
↓
ContextOS
↓
ASR Gateway
↓
Provider Router
↓
Alibaba
Volcengine
Other
```

这样用户不需要自己购买多个 API。

ContextOS 可以实现：

```text
自动路由
成本控制
质量控制
供应商故障切换
```

---

# 67. Provider Failover

例如：

```text
Alibaba
↓
timeout
↓
Volcengine
↓
success
```

用户看到的仍然是：

```text
识别完成
```

而不是：

```text
某云服务失败
```

---

# 68. Observability

记录：

```text
job_id
provider
model
mode
duration
audio_duration
latency
confidence
retry
cost
error
```

用于：

```text
成本分析
模型比较
质量优化
供应商选择
```

---

# 69. 核心日志

```json
{
  "jobId": "xxx",
  "mode": "cloud",
  "provider": "aliyun",
  "model": "qwen3-asr-flash-filetrans",
  "audioDuration": 42.7,
  "processingTime": 8.2,
  "confidence": 95.7,
  "retry": false
}
```

---

# 70. V1.0 开发优先级

## P0

必须完成：

```text
douyin-ingest integration
+
ASR Provider abstraction
+
Local/Cloud Mode
+
Fun-ASR integration
+
One Cloud Provider
+
Transcript Schema
+
Transcript API
```

---

# 71. P1

```text
GLM-ASR integration
+
OCR
+
VAD
+
Hotwords
+
LLM Correction
+
Confidence Score
```

---

# 72. P2

```text
Multi-ASR Fusion
+
Retry Engine
+
Source Separation
+
Provider Router
+
Cloud Failover
```

---

# 73. P3

```text
ASR Benchmark
+
Auto Model Selection
+
Cost Optimizer
+
Personalized Domain Vocabulary
+
Enterprise Local Deployment
```

---

# 74. V1.0 最推荐的实际实现

ContextOS 初始版本不要一次做满。

直接：

```text
                     ContextOS
                          │
                    Douyin Ingest
                          │
                         Video
                          │
                    Audio Processor
                          │
                       VAD
                          │
                ┌─────────┴─────────┐
                │                   │
              LOCAL               CLOUD
                │                   │
        Fun-ASR + GLM-ASR      Alibaba / Volcengine
                │                   │
                └─────────┬─────────┘
                          ↓
                         OCR
                          ↓
                  Transcript Fusion
                          ↓
                   LLM Correction
                          ↓
                    Quality Score
                          ↓
                  Final Transcript
```

这就是 ContextOS v1 的核心架构。

---

# 75. 最终产品原则

ContextOS 不应该把自己定义成：

> “一个视频转文字工具”。

而应该定义为：

> **“一个能够理解短视频真实表达内容的 Content Intelligence Infrastructure。”**

Transcript Engine 只是第一层。

最终数据链：

```text
Video
↓
Transcript
↓
Content Structure
↓
Content Strategy
↓
Viral Pattern
↓
Generation
↓
Evaluation
```

这套架构必须保证未来可以无缝替换：

```text
Local Model
Cloud Model
ASR Provider
OCR Provider
LLM
```

而不改变上层 ContextOS 产品逻辑。

---

# 76. 当前技术选型结论

### Local

Primary：

```text
Fun-ASR-Nano
```

Secondary：

```text
GLM-ASR-Nano
```

Fallback：

```text
SenseVoice
Paraformer
```

FunASR 当前官方文档已经把这些模型以及 VAD、标点、说话人等能力纳入同一个工具链，并提供 OpenAI-compatible API 等运行方式。

### Cloud

第一阶段：

```text
Alibaba Cloud Model Studio
```

优先评估：

```text
Fun-ASR
Qwen3-ASR-Flash
```

阿里云当前官方文档提供非实时文件转写，并支持公网文件 URL；部分文件模型支持最长 12 小时音频，适合 ContextOS 这种“提交视频后异步分析”的产品流程。

第二阶段：

```text
Volcengine
```

作为另一条云端路线和故障切换路线。其大模型录音文件极速识别 API 面向一次请求直接返回结果的文件识别场景。

---

# 77. 最终一句话架构

```text
ContextOS Transcript Engine
=
Douyin Ingest
+
Local AI
+
Cloud AI
+
VAD
+
OCR
+
Hotwords
+
Comments Context
+
Multi-Source Fusion
+
LLM Correction
+
Confidence Scoring
+
Automatic Fallback
```

最终目标不是：

```text
“把声音变成文字”
```

而是：

```text
“最大程度恢复创作者真正说过的内容，
并输出一份可以直接用于内容理解、爆款分析和 AI 创作的高可信原始文本。”
```