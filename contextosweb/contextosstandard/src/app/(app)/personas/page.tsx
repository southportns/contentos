import { PersonaManager } from '@/components/workspace/persona-manager'

export const dynamic = 'force-dynamic'

export default function PersonasPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">人设管理</h1>
        <p className="text-muted-foreground">
          管理你的创作人设，在创作时选择使用，影响内容策略和写作风格
        </p>
      </div>
      <PersonaManager />
    </div>
  )
}
