/**
 * P0.3.9.4-D — Draft Version Indicator
 *
 * Shows workflow version preview. NOT real DB version.
 * Does NOT modify Prisma schema.
 */
import { FileText, ArrowRight, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface VersionIndicatorProps {
  hasRefineData: boolean
}

export function VersionIndicator({ hasRefineData }: VersionIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <FileText className="size-3.5" />
      <Badge variant="outline" className="text-[10px] h-5 font-normal">Draft v1</Badge>
      {hasRefineData && (
        <>
          <ArrowRight className="size-3" />
          <Badge variant="default" className="text-[10px] h-5 font-normal bg-primary">
            <Sparkles className="mr-0.5 size-2.5" />
            Refined v2
          </Badge>
        </>
      )}
    </div>
  )
}
