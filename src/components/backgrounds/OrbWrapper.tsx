'use client'

import dynamic from 'next/dynamic'

type OrbProps = {
  hue?: number
  hoverIntensity?: number
  rotateOnHover?: boolean
  forceHoverState?: boolean
  backgroundColor?: string
}

const Orb = dynamic(() => import('./Orb'), { ssr: false })

export default function OrbWrapper(props: OrbProps) {
  return <Orb {...props} />
}
