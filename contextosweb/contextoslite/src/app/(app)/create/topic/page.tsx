'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider, SliderControl, SliderTrack, SliderRange, SliderThumb } from '@/components/ui/slider'
import { useTopicResearch } from '@/hooks/use-topic-research'
import { useWorkflow, workflowActions } from '@/hooks/use-workflow'
import type { TopicProfile } from '@/hooks/use-workflow'
import { PersonaSelector } from '@/components/create/persona-selector'

export default function TopicPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')
  const topicResearch = useTopicResearch()
  const ws = useWorkflow()

  const [topic, setTopic] = useState(ws.topicProfile?.topic ?? '')
  const [platform, setPlatform] = useState(ws.topicProfile?.platform ?? '')
  const [audienceAge, setAudienceAge] = useState<number[]>(() => {
    const audience = ws.topicProfile?.audience
    if (audience) {
      const match = audience.match(/(\d+)\s*-\s*(\d+)/)
      if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)]
      }
    }
    return [18, 45]
  })

  const researching = topicResearch.loading

  const handleResearch = useCallback(async () => {
    if (!topic.trim()) return

    const profile = await topicResearch.researchTopic({
      topic,
      platform: platform || undefined,
      audience: `${audienceAge[0]}-${audienceAge[1]}岁`,
    })

    if (profile) {
      const audienceStr = `${audienceAge[0]}-${audienceAge[1]}岁`
      const profileData = {
        ...(profile as unknown as TopicProfile),
        platform: platform || undefined,
        audience: audienceStr,
      }
      workflowActions.setTopicProfile(profileData)

      // Clear all downstream state
      workflowActions.clearDownstream()

      // Save topic to database if we have a projectId
      if (projectId) {
        try {
          await fetch(`/api/projects/${projectId}/topic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic,
              platform: platform || null,
              audience: audienceStr,
              category: profile.category || null,
            }),
          })
        } catch (err) {
          // Non-blocking: topic save failure should not interrupt the workflow
          console.error('[TopicPage] Failed to save topic to database:', err)
        }
      }

      // Navigate to research page
      router.push('/create/research')
    }
  }, [topic, platform, audienceAge, topicResearch, router, projectId])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="topic">主题</Label>
          <Textarea
            id="topic"
            placeholder="例如：我们一生都在追求被爱的过程"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <Label>目标平台</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择平台..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="抖音短视频">抖音短视频</SelectItem>
                <SelectItem value="小红书">小红书</SelectItem>
                <SelectItem value="公众号">公众号</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label>目标受众年龄段</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{audienceAge[0]} 岁</span>
                <span>~</span>
                <span>{audienceAge[1]} 岁</span>
              </div>
              <Slider
                value={audienceAge}
                onValueChange={(v) => setAudienceAge(Array.isArray(v) ? [...v] : [v, v])}
                min={10}
                max={70}
                step={1}
              >
                <SliderControl>
                  <SliderTrack>
                    <SliderRange />
                  </SliderTrack>
                  <SliderThumb index={0} />
                  <SliderThumb index={1} />
                </SliderControl>
              </Slider>
            </div>
          </div>
        </div>
        <PersonaSelector
          value={ws.persona}
          onChange={workflowActions.setPersona}
        />
        <div className="flex justify-end">
          <Button onClick={handleResearch} disabled={!topic.trim() || researching}>
            {researching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                分析主题中...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                开始研究
              </>
            )}
          </Button>
        </div>
        {topicResearch.error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {topicResearch.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
