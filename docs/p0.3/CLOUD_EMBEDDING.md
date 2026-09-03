# P0.3.2-1 — Cloud Embedding Provider

> Cloud Embedding Provider Integration  
> Version: 1.0  
> Date: 2026-09-03

---

## 1. 当前 Provider

| 属性 | 值 |
|------|-----|
| Provider ID | `aliyun-text-embedding-v4` |
| 模型 | `text-embedding-v4` (阿里云百炼) |
| 输出维度 | 1024 |
| 最大批量 | 10 texts / 请求 |
| 超时 | 30 秒 |

---

## 2. 架构

```
┌──────────────────────────────────────────────────────────────┐
│                    ContextOS Server                           │
│                                                              │
│  EmbeddingProvider (Interface)                               │
│         │                                                    │
│    ┌────┴────┐                                               │
│    ↓         ↓                                               │
│  Mock      AlibabaEmbeddingProvider                          │
│  Provider       │                                            │
│ (默认/测试)     ↓                                            │
│              DashScope API                                   │
│              text-embedding-v4                               │
│              1024-dim vectors                                │
└──────────────────────────────────────────────────────────────┘
```

### 安全规则

```
ContextOS Server  →  DashScope API  ✅ 允许
Client Browser    →  DashScope API  ❌ 禁止 (API Key 不暴露)
```

---

## 3. 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DASHSCOPE_API_KEY` | 仅 aliyun | - | DashScope API Key |
| `EMBEDDING_PROVIDER` | 否 | `mock` | Provider 选择: `mock` / `aliyun` |
| `EMBEDDING_MODEL` | 否 | `text-embedding-v4` | 模型名称 |
| `EMBEDDING_DIMENSIONS` | 否 | `1024` | 期望维度 |
| `EMBEDDING_BASE_URL` | 否 | `https://dashscope.aliyuncs.com` | API 基础 URL |
| `EMBEDDING_TIMEOUT_MS` | 否 | `30000` | 请求超时 (毫秒) |

---

## 4. 请求流程

```
1. getEmbeddingProvider() 读取 EMBEDDING_PROVIDER
2. 若为 "aliyun" → 创建 AlibabaEmbeddingProvider
3. 若为 "mock"   → 创建 MockEmbeddingProvider (默认)
4. provider.embed(text) / provider.embedBatch(texts)
   ↓
5. 验证输入 (非空检查)
   ↓
6. embedBatch 内部:
   - ≤10 texts → 单次 API 调用
   - >10 texts → 分块批量调用 (每块 10)
   ↓
7. POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding
   Headers: Authorization: Bearer {DASHSCOPE_API_KEY}
   Body: { model: "text-embedding-v4", input: { texts: [...] } }
   ↓
8. 响应验证:
   - output.embeddings 存在
   - text_index 排序
   - 每个 embedding 长度 = 1024
   - 所有值为有限数 (无 NaN/Infinity)
   ↓
9. 返回 number[][]
```

---

## 5. 错误处理

### EmbeddingProviderError

所有错误抛出 `EmbeddingProviderError`，绝不返回空数组隐藏错误。

```typescript
interface EmbeddingProviderErrorDetails {
  provider: string;    // 'aliyun-text-embedding-v4'
  status?: number;     // HTTP 状态码 (如有)
  retryable: boolean;  // 是否可重试
}
```

### HTTP 错误映射

| HTTP | 错误消息 | 可重试 |
|------|----------|--------|
| 400 | Bad request | ❌ |
| 401 | Authentication failed | ❌ |
| 403 | Forbidden | ❌ |
| 429 | Rate limit exceeded | ✅ |
| 500 | Server error | ✅ |
| 502 | Bad gateway | ✅ |
| 503 | Service unavailable | ✅ |

### 验证错误

| 错误类型 | 消息模式 |
|----------|----------|
| API Key 缺失 | `DASHSCOPE_API_KEY is required` |
| 空文本 | `Cannot embed empty text` |
| 维度不匹配 | `has X dimensions, expected 1024` |
| 无效值 | `Invalid value at index [x]: NaN/Infinity/null/undefined` |
| 响应格式错误 | `Missing "output" field` / `Missing "embeddings" array` |
| 超时 | `Request timeout after 30000ms` |
| 网络错误 | `Network error: ...` |

---

## 6. Provider Factory

```typescript
import { getEmbeddingProvider, createProvider } from '@/knowledge/semantic';

// 自动根据 EMBEDDING_PROVIDER 环境变量选择
const provider = getEmbeddingProvider();

// 显式创建
const aliyun = createProvider('aliyun');
const mock = createProvider('mock');
```

### 默认行为

- **开发环境**: `EMBEDDING_PROVIDER` 未设置 → `mock`
- **npm test**: 始终使用 `mock`，无 API 调用
- **生产环境**: 设置 `EMBEDDING_PROVIDER=aliyun` → 调用 DashScope

---

## 7. 测试方式

### 单元测试 (Mocked)

```bash
npm test
```

测试覆盖:
- 正常响应解析
- 批量响应解析
- 维度验证
- 空向量 / 无效向量 (NaN/Infinity/null/undefined)
- HTTP 400/401/403/429/500/502/503
- 网络超时 / 网络错误 / JSON 解析错误

### Cloud Smoke Test

```bash
# 需要真实 API Key
DASHSCOPE_API_KEY=your-key npx tsx scripts/test-cloud-embedding.ts
```

输出示例:
```
=== ContextOS Cloud Embedding Smoke Test ===

Provider: aliyun-text-embedding-v4
Model: text-embedding-v4
Dimensions: 1024

Test text: "一个女人要学会建立自己的价值感"
Calling DashScope API...

✅ Success!
   Dimensions: 1024
   Vector valid: true
   Sample values: [0.012345, -0.023456, 0.034567, -0.045678, 0.056789, ...]
   Time: 1234ms
```

**注意**:
- Smoke Test 不加入 `npm test`
- 没有 API Key 时友好提示并退出
- 不打印完整向量或 API Key

---

## 8. 文件结构

```
src/knowledge/semantic/
├── types.ts                              # EmbeddingProvider 接口
├── embedding-provider.ts                 # MockEmbeddingProvider + Registry
├── similarity.ts                         # 余弦相似度
├── semantic-index.ts                     # 语义索引构建
├── semantic-retriever.ts                 # 语义检索
├── semantic-search.ts                    # 高层编排
├── providers/                            # --- P0.3.2-1 NEW ---
│   ├── index.ts                          # Providers 公开 API
│   ├── aliyun-embedding-provider.ts      # AlibabaEmbeddingProvider
│   ├── provider-factory.ts               # Provider Factory
│   └── __tests__/
│       └── aliyun-embedding-provider.test.ts  # 25+ 单元测试
```

---

## 9. 安全规则

### 禁止事项

| 规则 | 说明 |
|------|------|
| ❌ `NEXT_PUBLIC_DASHSCOPE_API_KEY` | 绝不在客户端暴露 API Key |
| ❌ Client → DashScope | 客户端不直接调用 DashScope |
| ❌ Embedding API in Browser | Embedding 只在服务端执行 |
| ❌ 硬编码 API Key | 通过环境变量或 Server 配置注入 |

### 正确流程

```
React Component
      ↓ (HTTP)
Next.js API Route (Server)
      ↓
AlibabaEmbeddingProvider
      ↓ (HTTPS + API Key)
DashScope API (Alibaba Cloud)
      ↓
1024-dim vector → Server → Client
```

---

## 10. 范围声明

### P0.3.2-1 包含

- [x] AlibabaEmbeddingProvider 实现
- [x] 错误处理 (HTTP / 网络 / 验证)
- [x] 超时控制 (30s)
- [x] Response 验证 (维度 / NaN / Infinity)
- [x] 批量分块 (10 texts/request)
- [x] Provider Factory + Registry
- [x] Mocked 单元测试 (无真实 API 调用)
- [x] Cloud Smoke Test 脚本

### P0.3.2-1 不包含

- [ ] P0.3.2-2: Embedding Persistence (向量缓存到数据库)
- [ ] P0.3.2-3: Semantic Evaluation (语义检索质量评估)
- [ ] P0.3.2-4: Hybrid Retrieval (关键词 + 语义融合)
- [ ] 24 KU Embedding 生成和存储
- [ ] 前端 API 路由 (待后续阶段)

---

## 11. 验收标准

| 项 | 状态 |
|----|------|
| AlibabaEmbeddingProvider 存在 | ✅ |
| implements EmbeddingProvider | ✅ |
| 使用 text-embedding-v4 | ✅ |
| dimensions = 1024 | ✅ |
| API Key 只存在服务端 | ✅ |
| 没有 NEXT_PUBLIC API Key | ✅ |
| embed() 可用 | ✅ |
| embedBatch() 可用 | ✅ |
| Response validation 完成 | ✅ |
| Timeout 完成 | ✅ |
| 401/429/5xx 等错误处理完成 | ✅ |
| Provider Registry 支持 aliyun | ✅ |
| 默认测试仍使用 Mock Provider | ✅ |
| 没有真实 API 调用进入默认测试 | ✅ |
| P0.2.3 没有被修改 | ✅ |
| 新增 Provider 单元测试 | ✅ |
| cloud smoke test 存在 | ✅ |
