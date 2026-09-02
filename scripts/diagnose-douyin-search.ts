/**
 * Douyin Search Pipeline Diagnostic
 *
 * 逐一测试搜索链路的每个环节，定位最容易被风控拦截的步骤。
 *
 * 测试顺序：
 *   1. 健康检查（基础连通性）
 *   2. 热搜榜（简单接口基线）
 *   3. 视频详情（中等难度基线）
 *   4. 搜索接口（核心目标）
 *   5. 搜索 + Cookie 检查（诊断登录态）
 *
 * 运行: npx tsx scripts/diagnose-douyin-search.ts
 */

const DOUYIN_API_BASE = process.env.DOUYIN_API_BASE || 'http://localhost:8800'

interface DiagnosticResult {
  step: string
  endpoint: string
  status: 'pass' | 'fail' | 'degraded'
  httpStatus?: number
  durationMs: number
  details: string
  data?: unknown
}

const results: DiagnosticResult[] = []

// ─── Helpers ────────────────────────────────────────────

async function timedFetch(
  label: string,
  endpoint: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<DiagnosticResult> {
  const url = `${DOUYIN_API_BASE}${endpoint}`
  const timeout = options?.timeoutMs ?? 15_000
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timer)
    const durationMs = Date.now() - start

    if (!response.ok) {
      return {
        step: label,
        endpoint,
        status: 'fail',
        httpStatus: response.status,
        durationMs,
        details: `HTTP ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    return {
      step: label,
      endpoint,
      status: 'pass',
      httpStatus: 200,
      durationMs,
      details: 'OK',
      data,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    const msg = error instanceof Error ? error.message : String(error)
    const isTimeout = msg.includes('aborted') || msg.includes('timeout')
    return {
      step: label,
      endpoint,
      status: 'fail',
      httpStatus: undefined,
      durationMs,
      details: isTimeout ? `TIMEOUT after ${durationMs}ms` : msg,
    }
  }
}

function printResult(r: DiagnosticResult) {
  const icon = r.status === 'pass' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌'
  const ms = `${r.durationMs}ms`.padStart(8)
  console.log(`${icon} ${r.step.padEnd(25)} ${ms}  ${r.details}`)
  if (r.status !== 'pass' && r.details.length > 60) {
    console.log(`   └─ ${r.details.slice(0, 100)}`)
  }
}

// ─── Tests ──────────────────────────────────────────────

async function runDiagnostics() {
  console.log('='.repeat(70))
  console.log('Douyin Search Pipeline Diagnostic')
  console.log(`Target: ${DOUYIN_API_BASE}`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log('='.repeat(70))
  console.log()

  // ── Step 1: Health Check ──
  console.log('── Step 1: Health Check (基础连通性) ──')
  const health = await timedFetch('health', '/api/v1/health', { timeoutMs: 5_000 })
  results.push(health)
  printResult(health)

  if (health.status === 'fail') {
    console.log('\n❌ 微服务不可达，终止后续测试。请确认微服务已启动：')
    console.log('   python run.py --serve --serve-port 8800')
    printSummary()
    return
  }

  // ── Step 2: Hot Search Board (基线 - 简单接口) ──
  console.log('\n── Step 2: Hot Search Board (接口基线 - 简单) ──')
  const hotStart = Date.now()
  const hot = await timedFetch('hot-search', '/api/v1/hot-search', { timeoutMs: 30_000 })
  results.push(hot)
  const hotItems = (hot.data as { count?: number; items?: unknown[] })?.items
  hot.details = hot.status === 'pass'
    ? `OK — ${(hot.data as { count?: number })?.count ?? 0} items`
    : hot.details
  printResult(hot)

  // ── Step 3: Video Detail (基线 - 中等难度) ──
  console.log('\n── Step 3: Video Detail (接口基线 - 中等) ──')
  // 用一个热门 awemeId 测试，先获取一个有效的
  let testAwemeId: string | null = null
  if (hotItems && hotItems.length > 0) {
    // 从热搜里找一个相关的，或者用一个固定测试 ID
    // 这里我们用一个已知的长效视频 ID
    testAwemeId = '7604129988555574538'
  }

  if (testAwemeId) {
    const detail = await timedFetch(
      'video-detail',
      `/api/v1/video/${testAwemeId}`,
      { timeoutMs: 60_000 },
    )
    results.push(detail)
    const detailData = detail.data as { aweme_id?: string; desc?: string } | undefined
    detail.details = detail.status === 'pass'
      ? `OK — "${detailData?.desc?.slice(0, 40)}..."`
      : detail.details
    printResult(detail)
  } else {
    console.log('   ⏭️ 跳过 (无可用测试 ID)')
  }

  // ── Step 4: Search - The Real Test (核心测试) ──
  console.log('\n── Step 4: Search 关键词搜索 (核心风控点) ──')

  // 4a. 简单关键词
  const search1 = await timedFetch(
    'search: 简单关键词',
    '/api/v1/search',
    {
      method: 'POST',
      body: { keyword: '美食', count: 5, publish_time: 'none' },
      timeoutMs: 15_000, // 15s 超时观察实际耗时
    },
  )
  results.push(search1)
  if (search1.status === 'pass') {
    const sData = search1.data as { count?: number; items?: unknown[]; source?: string }
    search1.details = `OK — ${sData?.count ?? 0} items, source=${sData?.source}`
    // 检查是否为空结果（风控信号）
    if ((sData?.count === 0 || (sData?.items?.length ?? 0) === 0) && search1.durationMs < 5000) {
      search1.status = 'degraded'
      search1.details += ' ⚠️ 快速返回空结果 = 可能被风控!'
    }
  }
  printResult(search1)

  // 4b. 短暂停顿后再次搜索（测试频率限制）
  await new Promise((r) => setTimeout(r, 2000))

  const search2 = await timedFetch(
    'search: 二次搜索',
    '/api/v1/search',
    {
      method: 'POST',
      body: { keyword: '旅行', count: 5, publish_time: 'none' },
      timeoutMs: 15_000,
    },
  )
  results.push(search2)
  if (search2.status === 'pass') {
    const sData = search2.data as { count?: number; items?: unknown[]; source?: string }
    search2.details = `OK — ${sData?.count ?? 0} items, source=${sData?.source}`
    if ((sData?.count === 0 || (sData?.items?.length ?? 0) === 0) && search2.durationMs < 5000) {
      search2.status = 'degraded'
      search2.details += ' ⚠️ 快速返回空结果 = 可能被风控!'
    }
  }
  printResult(search2)

  // 4c. 高价值/敏感关键词（测试内容风控）
  await new Promise((r) => setTimeout(r, 2000))

  const search3 = await timedFetch(
    'search: 高竞争词',
    '/api/v1/search',
    {
      method: 'POST',
      body: { keyword: '抖音', count: 5, publish_time: 'none' },
      timeoutMs: 15_000,
    },
  )
  results.push(search3)
  if (search3.status === 'pass') {
    const sData = search3.data as { count?: number; items?: unknown[]; source?: string }
    search3.details = `OK — ${sData?.count ?? 0} items, source=${sData?.source}`
    if ((sData?.count === 0 || (sData?.items?.length ?? 0) === 0) && search3.durationMs < 5000) {
      search3.status = 'degraded'
      search3.details += ' ⚠️ 快速返回空结果 = 可能被风控!'
    }
  }
  printResult(search3)

  // ── Step 5: 诊断 Cookie/Token 状态 ──
  console.log('\n── Step 5: Cookie/Token 状态诊断 ──')
  await diagnoseAuthState()

  // ── Summary ──
  printSummary()
}

async function diagnoseAuthState() {
  // 检查微服务是否有 msToken
  const healthData = results[0].data as { status?: string; has_ms_token?: boolean } | undefined
  if (healthData) {
    const hasMsToken = healthData.has_ms_token
    const icon = hasMsToken === true ? '✅' : hasMsToken === false ? '⚠️' : '❓'
    console.log(
      `${icon} msToken: ${hasMsToken === true ? '存在' : hasMsToken === false ? '缺失 (搜索高危!)' : '未知'}`,
    )
  }

  // 分析搜索结果中的风控信号
  const searchResults = results.filter((r) => r.step.startsWith('search:'))
  const blockedCount = searchResults.filter((r) => r.status === 'degraded' || r.status === 'fail').length
  const totalSearch = searchResults.length

  if (blockedCount > 0) {
    console.log(`\n🔴 搜索拦截率: ${blockedCount}/${totalSearch} (${Math.round((blockedCount / totalSearch) * 100)}%)`)
    console.log('   判定依据: 返回空结果且耗时 < 5s = 风控快速拒绝')
  } else if (totalSearch > 0 && searchResults.every((r) => r.status === 'pass')) {
    console.log(`\n🟢 搜索全部通过: ${totalSearch}/${totalSearch}`)
    console.log('   当前 Cookie/签名状态良好')
  }

  // 详细分析每次搜索的耗时（耗时模式揭示风控类型）
  console.log('\n📊 耗时分析 (耗时模式 → 风控类型):')
  for (const r of searchResults) {
    if (r.durationMs < 3000) {
      console.log(`   • ${r.step}: ${r.durationMs}ms → WAF 瞬时拒绝 (IP/频率/签名问题)`)
    } else if (r.durationMs < 8000) {
      console.log(`   • ${r.step}: ${r.durationMs}ms → 签名或 token 校验失败`)
    } else if (r.durationMs > 30000) {
      console.log(`   • ${r.step}: ${r.durationMs}ms → 微服务内部重试耗尽 (确认风控)`)
    } else {
      console.log(`   • ${r.step}: ${r.durationMs}ms → 可能到达后端但被拦截`)
    }
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(70))
  console.log('诊断摘要')
  console.log('='.repeat(70))

  const pass = results.filter((r) => r.status === 'pass').length
  const degraded = results.filter((r) => r.status === 'degraded').length
  const fail = results.filter((r) => r.status === 'fail').length

  console.log(`总测试: ${results.length} | 通过: ${pass} | 降级: ${degraded} | 失败: ${fail}`)

  console.log('\n结论推导:')

  if (fail > 0 && results[0].status === 'fail') {
    console.log('  🔴 微服务不可达 — 先解决连通性问题')
    return
  }

  // 分析最脆弱的环节
  const hotOk = results.some((r) => r.step === 'hot-search' && r.status === 'pass')
  const detailOk = results.some((r) => r.step === 'video-detail' && r.status === 'pass')
  const searchBlocked = results.filter((r) => r.step.startsWith('search:') && (r.status === 'degraded' || r.status === 'fail'))

  if (hotOk && detailOk && searchBlocked.length > 0) {
    console.log('  🔴 最脆弱环节: 关键词搜索 (simple + detail 正常，仅搜索被拦截)')
    console.log('  ├─ 原因: 搜索是抖音最高风控等级接口')
    console.log('  ├─ 微服务重试导致 50s 等待 (~8s × 3 + 间隔)')
    console.log('  └─ 优化: 8s 快速失败 + 缓存 (已实现) ✅')
  } else if (!hotOk && !detailOk) {
    console.log('  🔴 最脆弱环节: 全部接口失效 — Cookie/签名 整体过期')
    console.log('  └─ 优化: 通过 Tabit 浏览器刷新 Cookie')
  } else if (hotOk && !detailOk) {
    console.log('  🟡 最脆弱环节: 视频详情异常 — 可能是翻页/详情独立限流')
    console.log('  └─ 优化: 降低请求频率，增加请求间隔')
  } else {
    console.log('  🟢 当前全部正常 — Cookie/签名状态良好')
  }

  console.log('\n建议行动:')
  console.log('  1. 保持 8s 快速失败 (避免 ~50s 无谓等待)')
  console.log('  2. 开启搜索缓存 (5min TTL, 减少 API 调用)')
  console.log('  3. 如全部失败 → 刷新 Cookie')
  console.log('  4. 如仅搜索失败 → 属正常风控，引导用户使用视频链接')
}

// ─── Run ────────────────────────────────────────────────

runDiagnostics().catch((err) => {
  console.error('诊断脚本异常:', err)
  process.exit(1)
})
