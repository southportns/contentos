'use client'

import { Monitor } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PlatformSelectorProps {
  value: string
  onChange: (platform: string) => void
}

const PLATFORMS = [
  { value: '抖音短视频', label: '抖音短视频' },
  { value: '小红书', label: '小红书' },
  { value: '公众号', label: '公众号' },
]

export function PlatformSelector({ value, onChange }: PlatformSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Monitor className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">目标平台</span>
      </div>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="选择发布平台..." />
        </SelectTrigger>
        <SelectContent>
          {PLATFORMS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
