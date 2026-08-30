import { redirect } from 'next/navigation'

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const projectId = params.projectId
  if (projectId && typeof projectId === 'string') {
    redirect(`/create/topic?projectId=${projectId}`)
  }
  redirect('/create/topic')
}
