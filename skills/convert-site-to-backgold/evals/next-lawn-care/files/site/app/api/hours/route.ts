import { NextResponse } from 'next/server'

// Whether the office is open right now, in Pacific time.
export async function GET() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const day = now.getDay(), hour = now.getHours()
  const open = (day >= 1 && day <= 5 && hour >= 7 && hour < 17) || (day === 6 && hour >= 8 && hour < 12)
  return NextResponse.json({ open, until: day === 6 ? 'noon' : '5 p.m.' }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
