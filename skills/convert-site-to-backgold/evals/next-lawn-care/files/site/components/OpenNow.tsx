'use client'
import { useEffect, useState } from 'react'

export default function OpenNow() {
  const [state, setState] = useState<{ open: boolean; until?: string } | null>(null)
  useEffect(() => { fetch('/api/hours').then((r) => r.json()).then(setState).catch(() => {}) }, [])
  if (!state) return null
  return <p className="open-now">{state.open ? `Open now until ${state.until}` : 'Closed right now. Leave a message and we call back first thing.'}</p>
}
