/**
 * Douyin Search Layer Analysis
 *
 * 精确定位搜索被拦截在哪一层。
 * 通过对比不同接口的响应特征，推断风控触发的具体条件。
 *
 * 运行: npx tsx scripts/diagnose-search-layer.ts
 */

const LOCAL_DOUYIN_API_BASE = process.env.DOUYIN_API_BASE || 'http://localhost:8800'

interface LayerResult {
  name: string
  description: string
  durationMs: number
  blocked: boolean
  signal: string // 'clean' | 'empty_fast' | 'timeout' | '403_429' | 'challenge'
}

const layers: LayerResult[] = []

async function probe(
  name: string,
  description: string,
  endpoint: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<LayerResult> {
  const url = `${LOCAL_DOUYIN_API_BASE}${endpoint}`
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timer)
    const durationMs = Date.now() - start

    if (response.status === 403 || response.status === 429) {
      return {
        name,
        description,
        durationMs,
        blocked: true,
        signal: '403_429',
      }
    }

    if (response.ok) {
      const text = await response.text()
      const isJson = text.startsWith('{') || text.startsWith('[')
      const isEmpty = text.length === 0

      if (isEmpty) {
        return {
          name,
          description,
          durationMs,
          blocked: durationMs < 3000,
          signal: 'empty_fast',
        }
      }

      if (!isJson && durationMs < 3000) {
        // HTML challenge page
        return {
          name,
          description,
          durationMs,
          blocked: true,
          signal: 'challenge',
        }
      }

      return {
        name,
        description,
        durationMs,
        blocked: false,
        signal: 'clean',
      }
    }

    return {
      name,
      description,
      durationMs,
      blocked: true,
      signal: `http_${response.status}`,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    const isTimeout = error instanceof Error && (error.message.includes('aborted') || error.message.includes('timeout'))
    return {
      name,
      description,
      durationMs,
      blocked: true,
      signal: isTimeout ? 'timeout' : 'network_error',
    }
  }
}

function iconFor(signal: string): string {
  switch (signal) {
    case 'clean': return '✅'
    case 'empty_fast': return '⚠️'
    case '403_429': return '🔴'
    case 'challenge': return '🔴'
    case 'timeout': return '⏱️'
    default: return '❌'
  }
}

function describeSignal(signal: string): string {
  switch (signal) {
    case 'clean': return '正常返回数据'
    case 'empty_fast': return '快速空响应 (风控信号)'
    case '403_429': return 'WAF 直接拒绝'
    case 'challenge': return '返回验证码页'
    case 'timeout': return '~15s 超时 (后端挂起)'
    default: return signal
  }
}

async function run() {
  console.log('='.repeat(70))
  console.log('Douyin Search Layer Analysis — 精确定位拦截层级')
  console.log('='.repeat(70))
  console.log()

  // Layer 1: 基础连通
  console.log('Layer 1: 基础连通性')
  const l1 = await probe('health', '健康检查', '/api/v1/health', undefined, 5000)
  layers.push(l1)
  console.log(`  ${iconFor(l1.signal)} ${l1.name.padEnd(20)} ${l1.durationMs}ms  ${describeSignal(l1.signal)}`)

  // Layer 2: 简单 API
  console.log('\nLayer 2: 简单 API (热搜)')
  const l2 = await probe('hot-search', '热搜榜', '/api/v1/hot-search', undefined, 15000)
  layers.push(l2)
  console.log(`  ${iconFor(l2.signal)} ${l2.name.padEnd(20)} ${l2.durationMs}ms  ${describeSignal(l2.signal)}`)

  // Layer 3: 中等 API
  console.log('\nLayer 3: 中等 API (视频详情)')
  const l3 = await probe('video-detail', '视频详情', '/api/v1/video/7604129988555574538', undefined, 15000)
  layers.push(l3)
  console.log(`  ${iconFor(l3.signal)} ${l3.name.padEnd(20)} ${l3.durationMs}ms  ${describeSignal(l3.signal)}`)

  // Layer 4: 搜索 - 核心
  console.log('\nLayer 4: 关键词搜索 (风控核心)')
  const l4a = await probe('search-1', '搜索: 美食', '/api/v1/search', { keyword: '美食', count: 3, publish_time: 'none' }, 12000)
  layers.push(l4a)
  console.log(`  ${iconFor(l4a.signal)} ${l4a.name.padEnd(20)} ${l4a.durationMs}ms  ${describeSignal(l4a.signal)}`)

  await new Promise((r) => setTimeout(r, 1500))

  const l4b = await probe('search-2', '搜索: 旅游', '/api/v1/search', { keyword: '旅游', count: 3, publish_time: 'none' }, 12000)
  layers.push(l4b)
  console.log(`  ${iconFor(l4b.signal)} ${l4b.name.padEnd(20)} ${l4b.durationMs}ms  ${describeSignal(l4b.signal)}`)

  await new Promise((r) => setTimeout(r, 1500))

  const l4c = await probe('search-3', '搜索: 科技', '/api/v1/search', { keyword: '科技', count: 3, publish_time: 'none' }, 12000)
  layers.push(l4c)
  console.log(`  ${iconFor(l4c.signal)} ${l4c.name.padEnd(20)} ${l4c.durationMs}ms  ${describeSignal(l4c.signal)}`)

  // Layer 5: 搜索 + 发布时间筛选（额外参数）
  console.log('\nLayer 5: 搜索 + 筛选参数')
  const l5 = await probe('search-filtered', '搜索: 美食+筛选', '/api/v1/search', { keyword: '美食', count: 3, publish_time: '7d' }, 12000)
  layers.push(l5)
  console.log(`  ${iconFor(l5.signal)} ${l5.name.padEnd(20)} ${l5.durationMs}ms  ${describeSignal(l5.signal)}`)

  // Layer 6: 搜索 + 高数量
  console.log('\nLayer 6: 搜索 + 高数量请求')
  await new Promise((r) => setTimeout(r, 1500))
  const l6 = await probe('search-highcount', '搜索: 20条', '/api/v1/search', { keyword: '日常', count: 20, publish_time: 'none' }, 12000)
  layers.push(l6)
  console.log(`  ${iconFor(l6.signal)} ${l6.name.padEnd(20)} ${l6.durationMs}ms  ${describeSignal(l6.signal)}`)

  // ── Analysis ──
  console.log('\n' + '='.repeat(70))
  console.log('风控层级判定')
  console.log('='.repeat(70))

  const searchLayers = layers.filter((l) => l.name.startsWith('search') || l.name === 'hot-search' || l.name === 'video-detail')

  // 判定逻辑
  const basicOk = layers.find((l) => l.name === 'health')?.signal === 'clean'
  const hotOk = layers.find((l) => l.name === 'hot-search')?.signal === 'clean'
  const detailOk = layers.find((l) => l.name === 'video-detail')?.signal === 'clean'
  const allSearchBlocked = searchLayers.filter((l) => l.name.startsWith('search')).every((l) => l.blocked)
  const anySearch403 = searchLayers.some((l) => l.signal === '403_429')
  const anySearchTimeout = searchLayers.some((l) => l.signal === 'timeout')
  const anySearchEmpty = searchLayers.some((l) => l.signal === 'empty_fast')

  console.log()
  if (basicOk && hotOk && detailOk && allSearchBlocked) {
    console.log('┌─────────────────────────────────────────────────────────┐')
    console.log('│  🎯 精确定位: 搜索端点被针对性封锁                        │')
    console.log('├─────────────────────────────────────────────────────────┤')
    console.log('│ 证据链:                                                 │')
    console.log('│   ✅ 健康检查通过 → 微服务在线                           │')
    console.log('│   ✅ 热搜榜通过   → Cookie/签名有效                      │')
    console.log('│   ✅ 视频详情通过 → API 调用能力正常                     │')
    console.log('│   ❌ 搜索全失败   → 仅搜索端点被风控                     │')
    console.log('│                                                         │')
    console.log('│ 结论: 抖音对搜索端点实施了独立的、最严格的风控策略        │')
    console.log('│       与 Cookie 质量、签名算法无关                      │')
    console.log('└─────────────────────────────────────────────────────────┘')
  }

  if (anySearch403) {
    console.log('\n  信号: WAF 直接拒绝 (403/429)')
    console.log('  含义: 请求在边缘层就被拦截，未到达搜索后端')
    console.log('  可能: IP 指纹异常 或 签名被标记')
  }

  if (anySearchTimeout) {
    console.log('\n  信号: 超时 (~12-15s)')
    console.log('  含义: 请求通过了 WAF + 签名，但后端处理缓慢/挂起')
    console.log('  可能: 后端风控引擎正在分析，或等待反爬验证结果')
    console.log('  机制: 微服务内部 3 次重试 (间隔 1s+2s+5s) 导致累积等待')
  }

  if (anySearchEmpty) {
    console.log('\n  信号: 快速空响应 (< 3s)')
    console.log('  含义: 后端立即返回了空结果')
    console.log('  可能: Cookie 缺少 sessionid，或行为评分不足')
  }

  if (anySearchEmpty && anySearchTimeout) {
    console.log('\n  ⚠️ 混合信号: 有时快速空、有时超时')
    console.log('  含义: 风控策略动态调整，不是固定规则')
  }

  console.log('\n  耗时模式对比:')
  for (const l of searchLayers) {
    const bar = '█'.repeat(Math.min(Math.round(l.durationMs / 500), 30))
    console.log(`    ${l.name.padEnd(15)} ${String(l.durationMs).padStart(6)}ms ${bar}`)
  }

  console.log('\n  💡 针对性优化建议:')
  console.log('     1. 8s 快速失败已生效 → 超时场景从 15s → 8s (节省 ~7s)')
  console.log('     2. 相同关键词 5min 缓存 → 减少实际 API 调用')
  console.log('     3. 如全部搜索超时 → 可尝试增加前置请求(如先访问热搜)')
  console.log('     4. 长期方案 → 浏览器模拟搜索(Playwright) 或 商业 API')
}

run().catch(console.error)
