'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLLMSettings } from '@/hooks/use-llm-settings'
import { useASRSettings, type ASRMode, type ASRCloudProvider } from '@/hooks/use-asr-settings'
import type { ModelProvider } from '@/lib/ai/models'
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  AlertCircleIcon,
  SparklesIcon,
  SearchIcon,
  AudioWaveformIcon,
  CloudIcon,
  HardDriveIcon,
} from 'lucide-react'

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  glm: '智谱 GLM',
  qwen: '通义千问',
  hunyuan: '腾讯混元',
  moonshot: 'Kimi (月之暗面)',
  minimax: 'MiniMax',
  doubao: '字节豆包',
  mimo: '小米 MiMo',
}

const PROVIDER_KEY_ENV: Record<ModelProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  glm: 'GLM_API_KEY',
  qwen: 'QWEN_API_KEY',
  hunyuan: 'HUNYUAN_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  doubao: 'DOUBAO_API_KEY',
  mimo: 'MIMO_API_KEY',
}

const PROVIDER_KEY_PLACEHOLDER: Record<ModelProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  google: 'AIza...',
  deepseek: 'sk-...',
  glm: 'xxx.xxx',
  qwen: 'sk-...',
  hunyuan: 'sk-...',
  moonshot: 'sk-...',
  minimax: 'eyJ...',
  doubao: 'sk-...',
  mimo: 'sk-...',
}

export default function SettingsPage() {
  const {
    config,
    loading,
    error,
    saving,
    saveError,
    saveSuccess,
    models,
    modelsLoading,
    modelsError,
    modelsSource,
    saveConfig,
    fetchModels,
    refresh,
  } = useLLMSettings()

  // ASR settings
  const {
    config: asrConfig,
    loading: asrLoading,
    saving: asrSaving,
    saveError: asrSaveError,
    saveSuccess: asrSaveSuccess,
    saveConfig: saveASRConfig,
    refresh: refreshASR,
    asrModels,
    asrModelsLoading,
    asrModelsError,
    asrModelsSource,
    fetchAsrModels,
  } = useASRSettings()

  // ASR local form state
  const [asrMode, setAsrMode] = useState<ASRMode>('cloud')
  const [asrModel, setAsrModel] = useState('medium')
  const [asrDevice, setAsrDevice] = useState('cpu')
  const [asrBeamSize, setAsrBeamSize] = useState('5')
  const [asrComputeType, setAsrComputeType] = useState('')
  // Cloud — single provider
  const [cloudProvider, setCloudProvider] = useState<ASRCloudProvider>('alibaba')
  const [cloudApiKey, setCloudApiKey] = useState('')
  const [cloudModel, setCloudModel] = useState('fun-asr')
  const [showCloudKey, setShowCloudKey] = useState(false)

  // Sync ASR config from server
  useEffect(() => {
    if (asrConfig) {
      // 强制使用 cloud 模式（当前版本仅支持云端 ASR）
      setAsrMode('cloud')
      setAsrModel(asrConfig.local.whisperModel)
      setAsrDevice(asrConfig.local.whisperDevice)
      setAsrBeamSize(asrConfig.local.whisperBeamSize)
      setAsrComputeType(asrConfig.local.whisperComputeType)
      setCloudProvider(asrConfig.cloud.provider)
      setCloudModel(asrConfig.cloud.model)
    }
  }, [asrConfig])

  // Update cloud model default when provider changes
  const handleCloudProviderChange = (v: string | null) => {
    if (!v) return
    const newProvider = v as ASRCloudProvider
    setCloudProvider(newProvider)
    setCloudApiKey('')
    setShowCloudKey(false)
    // Set default model for the new provider
    if (newProvider === 'xiaomi') {
      setCloudModel('mimo-v2.5-asr')
    } else {
      setCloudModel('fun-asr')
    }
  }

  const handleASRSave = async () => {
    await saveASRConfig({
      mode: asrMode,
      whisperModel: asrModel,
      whisperDevice: asrDevice,
      whisperBeamSize: asrBeamSize,
      whisperComputeType: asrComputeType || undefined,
      cloudProvider,
      cloudApiKey: cloudApiKey.trim() || undefined,
      cloudModel,
    })
    setCloudApiKey('')
  }

  // Local form state — single provider only
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('openai')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')
  const [showKey, setShowKey] = useState<boolean>(false)

  // Sync from server config
  useEffect(() => {
    if (config) {
      setSelectedProvider(config.provider)
      setSelectedModel(config.model || '')
    }
  }, [config])

  // Auto-fetch models when provider changes (if key is already configured server-side)
  useEffect(() => {
    if (config && config.providers) {
      const providerInfo = config.providers.find((p) => p.id === selectedProvider)
      if (providerInfo?.configured) {
        fetchModels(selectedProvider)
      }
    }
  }, [selectedProvider, config, fetchModels])

  // Clear API key input when switching provider
  const handleProviderChange = (v: string | null) => {
    if (v) {
      setSelectedProvider(v as ModelProvider)
      setApiKey('')
      setShowKey(false)
    }
  }

  const handleFetchModels = () => {
    fetchModels(selectedProvider, apiKey || undefined)
  }

  const handleSave = async () => {
    await saveConfig({
      provider: selectedProvider,
      model: selectedModel,
      apiKeys: apiKey.trim() ? { [selectedProvider]: apiKey.trim() } : undefined,
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <AlertCircleIcon className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refresh}>
          <RefreshCwIcon className="size-4" />
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">设置</h1>
          <p className="text-muted-foreground">管理你的 Content OS 配置</p>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} title="刷新">
          <RefreshCwIcon className="size-4" />
        </Button>
      </div>

      {/* LLM Config Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" />
            AI 模型配置
          </CardTitle>
          <CardDescription>
            选择一个服务商并配置 API Key，保存后写入 .env.local 文件。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Provider Selection */}
          <div className="flex flex-col gap-2">
            <Label>服务商</Label>
            <Select
              value={selectedProvider}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择服务商..." />
              </SelectTrigger>
              <SelectContent>
                {config?.providers?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.label}
                      {p.configured && (
                        <Badge variant="secondary" className="text-xs">
                          已配置
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* API Key Input for selected provider only */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{PROVIDER_LABELS[selectedProvider]} API Key</Label>
              {config?.apiKeys?.[selectedProvider]?.configured && !apiKey && (
                <Badge variant="secondary" className="text-xs">
                  已配置: {config.apiKeys[selectedProvider].masked || '****'}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    config?.apiKeys?.[selectedProvider]?.configured
                      ? '已配置，输入新值可覆盖'
                      : PROVIDER_KEY_PLACEHOLDER[selectedProvider]
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={handleFetchModels}
                disabled={modelsLoading}
              >
                {modelsLoading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SearchIcon className="size-4" />
                )}
                拉取模型
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              环境变量名: {PROVIDER_KEY_ENV[selectedProvider]}
            </p>
          </div>

          <Separator />

          {/* Model Selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>模型</Label>
              {modelsSource && (
                <Badge variant="outline" className="text-xs">
                  {modelsSource === 'api' ? 'API 拉取' : '静态列表'}
                </Badge>
              )}
            </div>
            {models.length > 0 ? (
              <Select
                value={selectedModel}
                onValueChange={(v) => v && setSelectedModel(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择模型..." />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : modelsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                正在拉取模型列表...
              </div>
            ) : modelsError ? (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircleIcon className="size-4" />
                {modelsError}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SearchIcon className="size-4" />
                点击「拉取模型」获取可用模型列表
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              当前模型: {selectedModel || config?.model || '未设置（使用默认）'}
            </p>
            </div>

            {/* Save Button */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckIcon className="size-4" />
                  配置已保存
                </div>
              )}
              {saveError && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircleIcon className="size-4" />
                  {saveError}
                </div>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              保存配置
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            配置保存到 .env.local 文件。AI_PROVIDER、AI_MODEL 和 API Key 环境变量会在下次请求时生效。
          </p>
        </CardContent>
      </Card>

      {/* Research Tools Card */}
      <Card>
        <CardHeader>
          <CardTitle>研究工具配置</CardTitle>
          <CardDescription>
            网页搜索与内容抓取（内置 DuckDuckGo + Jina Reader，无需配置 API Key）
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="web-search">网页搜索</Label>
            <Input
              id="web-search"
              type="text"
              placeholder="内置 DuckDuckGo 搜索（无需配置）"
              disabled
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="web-scrape">网页抓取</Label>
            <Input
              id="web-scrape"
              type="text"
              placeholder="内置 Jina Reader 抓取（无需配置）"
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            网页研究与内容抓取使用免费的 DuckDuckGo 搜索和 Jina Reader，无需配置任何 API Key。
          </p>
        </CardContent>
      </Card>

      {/* ASR Config Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AudioWaveformIcon className="size-5 text-primary" />
            口播稿识别配置
          </CardTitle>
          <CardDescription>
            配置语音识别（ASR）服务商。当前版本仅支持云端模式，可选阿里云百炼或小米 MiMo ASR。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* ASR Mode — fixed to cloud, no selection needed */}
          <div className="flex flex-col gap-2">
            <Label>识别模式</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <CloudIcon className="size-4 text-primary" />
              <span className="text-sm font-medium">云端模式</span>
              <span className="text-xs text-muted-foreground">— 当前版本仅支持云端 ASR</span>
            </div>
            <p className="text-xs text-muted-foreground">
              音频将发送至第三方云服务进行识别，需要配置 API Key。
            </p>
          </div>

          <Separator />

          {/* Local ASR Config — hidden, will be re-enabled when local GPU support is developed */}
          {false && (asrMode === 'auto' || asrMode === 'local') && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDriveIcon className="size-4 text-muted-foreground" />
                本地模型配置 (faster-whisper)
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Whisper 模型</Label>
                  <Select
                    value={asrModel}
                    onValueChange={(v) => v && setAsrModel(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiny">tiny (39M) — 最快</SelectItem>
                      <SelectItem value="small">small (244M) — 均衡</SelectItem>
                      <SelectItem value="base">base (74M)</SelectItem>
                      <SelectItem value="medium">medium (769M) — 推荐</SelectItem>
                      <SelectItem value="large-v3">large-v3 (1.5B) — 最高质量</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>计算设备</Label>
                  <Select
                    value={asrDevice}
                    onValueChange={(v) => v && setAsrDevice(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpu">CPU</SelectItem>
                      <SelectItem value="cuda">CUDA (NVIDIA GPU)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Beam Size</Label>
                  <Select
                    value={asrBeamSize}
                    onValueChange={(v) => v && setAsrBeamSize(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — 贪心解码（最快）</SelectItem>
                      <SelectItem value="3">3 — 中等质量</SelectItem>
                      <SelectItem value="5">5 — 推荐质量</SelectItem>
                      <SelectItem value="10">10 — 最高质量（较慢）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>量化类型 (可选)</Label>
                  <Input
                    type="text"
                    placeholder="auto (留空)"
                    value={asrComputeType}
                    onChange={(e) => setAsrComputeType(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {false && (asrMode === 'auto' || asrMode === 'local') && (
            <Separator />
          )}

          {/* Cloud ASR Config — single provider selection */}
          {(asrMode === 'cloud') && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CloudIcon className="size-4 text-muted-foreground" />
                云端 ASR 服务商
              </div>

              {/* Provider selection */}
              <div className="flex flex-col gap-2">
                <Label>服务商</Label>
                <Select
                  value={cloudProvider}
                  onValueChange={handleCloudProviderChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择云端 ASR 服务商..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alibaba">
                      <span className="flex items-center gap-2">
                        阿里云百炼
                        {asrConfig?.cloud.provider === 'alibaba' && asrConfig?.cloud.configured && (
                          <Badge variant="secondary" className="text-xs">已配置</Badge>
                        )}
                      </span>
                    </SelectItem>
                    <SelectItem value="xiaomi">
                      <span className="flex items-center gap-2">
                        小米 MiMo
                        {asrConfig?.cloud.provider === 'xiaomi' && asrConfig?.cloud.configured && (
                          <Badge variant="secondary" className="text-xs">已配置</Badge>
                        )}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  只能选择一个云端 ASR 服务商，切换后需重新配置 API Key 和模型。
                </p>
              </div>

              <Separator />

              {/* API Key for selected provider */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {cloudProvider === 'xiaomi' ? '小米 MiMo' : '阿里云百炼'} API Key
                  </Label>
                  {asrConfig?.cloud.configured && !cloudApiKey && asrConfig?.cloud.provider === cloudProvider && (
                    <Badge variant="secondary" className="text-xs">
                      已配置: {asrConfig.cloud.masked}
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showCloudKey ? 'text' : 'password'}
                    placeholder={
                      asrConfig?.cloud.provider === cloudProvider && asrConfig?.cloud.configured
                        ? '已配置，输入新值可覆盖'
                        : 'sk-...'
                    }
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCloudKey(!showCloudKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCloudKey ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  环境变量名: {cloudProvider === 'xiaomi' ? 'XIAOMI_ASR_API_KEY' : 'ALIBABA_ASR_API_KEY'} ·{' '}␣
                  获取: {cloudProvider === 'xiaomi' ? 'https://platform.xiaomimimo.com/' : 'https://bailian.console.aliyun.com/'}
                </p>
              </div>

              {/* Model selection */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>ASR 模型</Label>
                  {asrModelsSource && cloudProvider === 'alibaba' && (
                    <Badge variant="outline" className="text-xs">
                      {asrModelsSource === 'api' ? 'API 拉取' : '静态列表'}
                    </Badge>
                  )}
                </div>
                {cloudProvider === 'alibaba' ? (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {asrModels.length > 0 ? (
                        <Select
                          value={cloudModel}
                          onValueChange={(v) => v && setCloudModel(v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择 ASR 模型..." />
                          </SelectTrigger>
                          <SelectContent>
                            {asrModels.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : asrModelsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
                          <Loader2Icon className="size-4 animate-spin" />
                          正在拉取 ASR 模型列表...
                        </div>
                      ) : asrModelsError ? (
                        <div className="flex items-center gap-2 text-sm text-destructive h-9">
                          <AlertCircleIcon className="size-4" />
                          {asrModelsError}
                        </div>
                      ) : (
                        <Select
                          value={cloudModel}
                          onValueChange={(v) => v && setCloudModel(v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fun-asr">Fun-ASR — 中英文，噪声鲁棒</SelectItem>
                            <SelectItem value="qwen3-asr-flash">Qwen3-ASR-Flash — 高质量</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => fetchAsrModels(cloudApiKey.trim() || undefined)}
                      disabled={asrModelsLoading}
                    >
                      {asrModelsLoading ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <SearchIcon className="size-4" />
                      )}
                      拉取模型
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={cloudModel}
                    onValueChange={(v) => v && setCloudModel(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mimo-v2.5-asr">MiMo-V2.5-ASR — 中英+方言，噪声鲁棒</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  {cloudProvider === 'xiaomi'
                    ? '支持: 中英双语、粤/吴/闽南/四川方言、远场/噪声/多人重叠/带伴奏歌词'
                    : '填写百炼 API Key 后点击「拉取模型」可获取可用 ASR 模型列表。未拉取时显示默认模型。'}
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {asrSaveSuccess && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckIcon className="size-4" />
                  ASR 配置已保存
                </div>
              )}
              {asrSaveError && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircleIcon className="size-4" />
                  {asrSaveError}
                </div>
              )}
            </div>
            <Button onClick={handleASRSave} disabled={asrSaving}>
              {asrSaving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              保存 ASR 配置
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            配置保存到 .env.local 文件。ASR_MODE 和 API Key 会在下次请求时生效。识别结果将显示使用的 Provider 和置信度。
          </p>
        </CardContent>
      </Card>

      {/* Database Card */}
      <Card>
        <CardHeader>
          <CardTitle>数据库配置</CardTitle>
          <CardDescription>SQLite 数据库配置</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="db-url">Database URL</Label>
            <Input
              id="db-url"
              type="password"
              placeholder="file:./dev.db"
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            通过 .env.local 文件配置。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
