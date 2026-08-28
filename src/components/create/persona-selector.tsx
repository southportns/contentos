'use client'

import { useEffect, useState } from 'react'
import { UserCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface Persona {
  id: string
  name: string
  description: string | null
}

interface PersonaSelectorProps {
  value: Persona | null
  onChange: (persona: Persona | null) => void
}

const NONE_VALUE = '__none__'

export function PersonaSelector({ value, onChange }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/personas')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setPersonas(json.data || [])
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading && personas.length === 0) {
    return null
  }

  if (personas.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <UserCircle className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">创作人设</span>
      </div>
      <Select
        value={value?.id ?? NONE_VALUE}
        onValueChange={(v) => {
          if (v === NONE_VALUE) {
            onChange(null)
          } else {
            const p = personas.find((p) => p.id === v)
            onChange(p ?? null)
          }
        }}
      >
        <SelectTrigger className="w-full justify-between">
          <SelectValue placeholder="不使用人设（默认风格）">
            {(v: string | null) => {
              if (!v || v === NONE_VALUE) return <span className="text-muted-foreground">不使用人设（默认风格）</span>
              const p = personas.find((p) => p.id === v)
              return <span className="font-medium">{p?.name ?? v}</span>
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>选项</SelectLabel>
            <SelectItem value={NONE_VALUE}>
              <span className="text-muted-foreground">不使用人设（默认风格）</span>
            </SelectItem>
          </SelectGroup>
          {personas.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>创作人设</SelectLabel>
                {personas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {p.description}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      {value?.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {value.description}
        </p>
      )}
    </div>
  )
}
