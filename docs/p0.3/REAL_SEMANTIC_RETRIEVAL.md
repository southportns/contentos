# P0.3.2-3 — Real Semantic Retrieval

> AI 内容知识库的语义检索实现  
> Phase: P0.3.2-3  
> Date: 2026-09-09  

## 1. 概述

P0.3.2-3 实现了基于阿里云 DashScope `text-embedding-v4` 的真实语义检索系统。该系统将用户查询转换为 1024 维向量，与持久化的知识向量进行余弦相似度匹配，返回 Top-K 最相关的知识单元。

### 核心保证

| 保证 | 说明 |
|------|------|
| **单次 API 调用** | 每次搜索仅调用 1 次 Embedding API（仅对 query） |
| **持久化读取** | 知识向量始终从 `data/knowledge/embeddings.json` 读取 |
| **零冗余** | 搜索时不会重新 Embedding 知识库 |
| **安全过滤** | 复用 P0.2.3 的 safety filters，suspect KU 永不返回 |

---

## 2. 架构

### 2.1 数据流

```
用户查询
    │
    ▼
┌─────────────────────┐
│  RealSemanticSearch  │
│  .search(query)     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  SemanticRetriever   │
│  .retrieve(query)   │
└─────────┬───────────┘
          │
          ├─→ provider.embed(query)  ← 唯一 API 调用
          │
          ▼
┌─────────────────────┐
│  Cosine Similarity   │
│  query vs 15 KUs    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Filter & Rank      │
│  - category         │
│  - knowledge_level  │
│  - confidence       │
│  - min_similarity   │
│  - safety filter    │
└─────────┬───────────┘
          │
          ▼
    Top-K Results
```

### 2.2 文件结构

```
src/knowledge/semantic/
├── real-semantic-search.ts      # 核心编排类
├── semantic-search-instance.ts  # 单例模式（API 路由共享）
├── semantic-retriever.ts        # 检索引擎（embed → similarity → rank）
├── similarity.ts                # 余弦相似度计算
├── types.ts                     # 类型定义
├── embedding-provider.ts        # Mock Provider
├── providers/
│   ├── provider-factory.ts      # Provider 工厂
│   └── aliyun-embedding-provider.ts  # 阿里云 DashScope Provider
├── persistence/
│   ├── embedding-store.ts       # 文件持久化存储
│   ├── embedding-sync.ts        # Embedding 同步 + 索引构建
│   ├── embedding-cache.ts       # 内容哈希变更检测
│   ├── embedding-builder.ts     # Embedding 记录构建
│   ├── content-hash.ts          # 内容哈希计算
│   └── types.ts                 # 持久化类型
├── __tests__/
│   ├── real-semantic-search.test.ts  # 单元测试（16 tests）
│   └── ...
└── index.ts                     # 导出

scripts/
├── sync-knowledge-embeddings.ts     # Embedding 同步 CLI
├── test-semantic-retrieval-cloud.ts # 云端烟雾测试
└── evaluate-semantic-retrieval.ts   # 语义评测

docs/p0.3/
├── SEMANTIC_RETRIEVAL_EVALUATION_RESULTS.json  # 评测结果
└── REAL_SEMANTIC_RETRIEVAL.md                  # 本文档
```

---

## 3. 核心组件

### 3.1 RealSemanticSearch

编排类，负责初始化检索引擎并执行搜索。

```typescript
const search = new RealSemanticSearch({
  provider,        // EmbeddingProvider 实例
  knowledgeUnits,  // KNOWLEDGE_UNITS（24 个 KU）
  store,           // FileEmbeddingStore（默认）
});

// 初始化：优先从持久化加载，失败则云端同步
const initResult = await search.initialize();
// initResult.source: 'persistence' | 'cloud-sync' | 'empty'
// initResult.entriesLoaded: 15（validated KU 数量）
// initResult.apiCalls: 0（从持久化加载时）

// 搜索：仅对 query 调用 1 次 embed()
const response = await search.search({
  query: '女性自我成长',
  limit: 5,
  min_similarity: 0.5,
});
```

### 3.2 SemanticRetriever

检索引擎，执行 embed → similarity → filter → rank 流程。

```typescript
const retriever = new SemanticRetriever(index, provider, knowledgeUnits);
const response = await retriever.retrieve({
  query: '认知反转',
  limit: 5,
  category: ['hook'],        // 可选分类过滤
  confidence: 'high',        // 可选置信度过滤
  include_candidates: false, // 是否包含 candidate KU
});
```

### 3.3 AlibabaEmbeddingProvider

阿里云 DashScope text-embedding-v4 Provider。

```typescript
const provider = new AlibabaEmbeddingProvider();
// provider.id = 'aliyun-text-embedding-v4'
// provider.dimensions = 1024

// 单次嵌入
const vector = await provider.embed('查询文本');
// 返回: number[1024]

// 批量嵌入
const vectors = await provider.embedBatch(['文本1', '文本2']);
// 返回: number[2][1024]
```

### 3.4 FileEmbeddingStore

文件持久化存储，使用原子写入防止损坏。

```typescript
const store = new FileEmbeddingStore();
// 默认路径: data/knowledge/embeddings.json

// 批量写入
await store.batchUpsert(records);

// 读取所有
const allRecords = await store.getAll();
// 返回: EmbeddingRecord[]
```

---

## 4. API 路由

### GET /api/knowledge/search

知识库搜索端点，支持 keyword 和 semantic 两种检索方式。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `q` | string | - | 搜索查询 |
| `method` | 'keyword' \| 'semantic' | 'keyword' | 检索方式 |
| `category` | string[] | - | 分类过滤 |
| `knowledge_level` | string[] | - | 知识等级过滤 |
| `confidence` | 'high' \| 'medium' \| 'low' | - | 最低置信度 |
| `include_candidates` | boolean | false | 包含 candidate KU |
| `limit` | number | 5 (semantic) / 8 (keyword) | 最大结果数 |
| `min_similarity` | number | - | 最低相似度阈值（仅 semantic） |

**示例：**

```bash
# 语义检索
GET /api/knowledge/search?q=女性成长&method=semantic&limit=5

# 带过滤的语义检索
GET /api/knowledge/search?q=认知反转&method=semantic&category=cognition&min_similarity=0.5

# 关键词检索（默认）
GET /api/knowledge/search?q=钩子&method=keyword&category=hook
```

**响应格式（semantic）：**

```json
{
  "query": "女性成长",
  "method": "semantic",
  "results": [
    {
      "knowledge_id": "KU_011",
      "similarity": 0.7250,
      "name": "First-Person Vulnerability Lens",
      "category": "perspective",
      "knowledge_level": "strategic_pattern",
      "retrieval_method": "semantic",
      "retrieval_reason": "语义相似度: 72.5% | 知识等级: 战略模式 | 分类: 视角 | 高可信度"
    }
  ],
  "total": 5
}
```

---

## 5. 使用指南

### 5.1 首次部署

```bash
# 1. 设置环境变量
# .env.local
DASHSCOPE_API_KEY=your-api-key

# 2. 同步知识向量（首次必须）
npx tsx scripts/sync-knowledge-embeddings.ts --provider aliyun

# 3. 验证同步结果
# 输出: Created: 15, API Calls: 2, Records: 15
```

### 5.2 日常使用

```bash
# 运行云端烟雾测试
npx tsx scripts/test-semantic-retrieval-cloud.ts

# 运行语义评测
npx tsx scripts/evaluate-semantic-retrieval.ts
```

### 5.3 增量更新

当知识库内容变更时，重新运行同步脚本：

```bash
npx tsx scripts/sync-knowledge-embeddings.ts --provider aliyun
```

系统会自动检测：
- **未变更的 KU**：复用已有向量（0 API 调用）
- **内容变更的 KU**：重新 Embedding（1 API 调用 per batch）
- **新增的 KU**：创建新向量

---

## 6. 评测结果

### 6.1 云端评测（2026-09-09）

| 指标 | 值 |
|------|-----|
| 测试用例 | 22 |
| Top 匹配率 | 63.6% (14/22) |
| 完全覆盖率 | 22.7% (5/22) |
| 安全过滤 | 100% (22/22) |
| API 效率 | 100% (22/22) |
| 平均 Top 相似度 | 0.6473 |
| 平均结果数 | 8.0 |
| 总 API 调用 | 22（恰好 = 查询数） |
| 平均耗时 | 154ms |

### 6.2 关键验证点

- ✅ **embed() 调用次数**：每次搜索恰好 1 次（验证 API 效率 100%）
- ✅ **embedBatch() 调用次数**：搜索时始终 0 次（知识向量来自持久化）
- ✅ **安全过滤**：所有 22 个测试用例均无 suspect KU
- ✅ **结果排序**：按相似度降序排列
- ✅ **确定性**：相同查询产生相同结果
- ✅ **limit 参数**：正确限制返回数量
- ✅ **min_similarity 参数**：正确过滤低相似度结果

### 6.3 匹配失败分析

8 个未匹配预期的测试用例主要原因：

1. **语义相近但非预期**：如"争议性钩子"查询返回"预期反转"（相似度 0.52），两者在 embedding 空间较近
2. **知识库覆盖不足**：部分概念在现有 15 个 validated KU 中无精确对应
3. **查询表述差异**：中文查询与英文 KU 名称的语义距离

---

## 7. 性能

### 7.1 延迟分解

| 环节 | 耗时 | 说明 |
|------|------|------|
| Query Embedding | ~100-150ms | DashScope API 调用 |
| Similarity 计算 | <1ms | 15 个 1024 维向量 |
| 过滤 & 排序 | <1ms | 内存操作 |
| **总计** | **~154ms** | 端到端 |

### 7.2 扩展性

当前 15 个 KU 的场景下，性能不受影响。扩展到更多 KU 时：

- **100 KU**：similarity 计算 <5ms
- **1000 KU**：similarity 计算 <50ms
- **10000+ KU**：需要引入 ANN（Approximate Nearest Neighbor）索引

---

## 8. 安全

### 8.1 复用 P0.2.3 安全过滤

```typescript
// 1. Status 过滤
filterByStatus(units, includeCandidates);

// 2. Human Expression 安全过滤
filterHumanExpression(units, includeCandidates);
```

### 8.2 Suspect KU 永不返回

即使 `include_candidates=true`，`human_expression_verdict=suspect` 的 KU 也会被过滤。

### 8.3 API Key 保护

- 仅服务端使用 `DASHSCOPE_API_KEY`
- 永不暴露给客户端
- `.env.local` 已加入 `.gitignore`

---

## 9. 故障排查

### 9.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| "No persisted embeddings found" | 未运行同步 | `npx tsx scripts/sync-knowledge-embeddings.ts --provider aliyun` |
| "DASHSCOPE_API_KEY not set" | 环境变量缺失 | 检查 `.env.local` |
| 搜索结果为空 | min_similarity 过高 | 降低阈值或设为 0 |
| 结果不相关 | 查询表述模糊 | 使用更具体的描述 |

### 9.2 验证命令

```bash
# 检查持久化存储
cat data/knowledge/embeddings.json | jq '.records | length'
# 期望: 15

# 检查 Provider
EMBEDDING_PROVIDER=aliyun npx tsx -e "
import { getEmbeddingProvider } from './src/knowledge/semantic/providers';
const p = getEmbeddingProvider();
console.log(p.id, p.dimensions);
"
```

---

## 10. 相关文档

- [P0.3.2-2 Embedding Persistence](../../reports/2026-09-09-p0_3_2_2_embedding_persistence_cloud_verification.md)
- [P0.3.1 Semantic Retrieval Architecture](./SEMANTIC_RETRIEVAL_ARCHITECTURE.md)
- [P0.2.3 Knowledge Store](../p0.2.3/KNOWLEDGE_STORE_REPORT.md)
- [Evaluation Results](./SEMANTIC_RETRIEVAL_EVALUATION_RESULTS.json)
