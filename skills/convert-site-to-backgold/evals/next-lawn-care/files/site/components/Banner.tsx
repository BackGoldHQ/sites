'use client'
import { useEffect, useState } from 'react'

// The spring announcement. Dismissing it sets a cookie the server also reads (app/page.tsx).
export default function Banner() {
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(!document.cookie.includes('banner_dismissed=1')) }, [])
  if (!show) return null
  return (
    <div className="banner">
      <div className="wrap">
        Booking aeration for September now. Ten spots left.
        <button onClick={() => { document.cookie = 'banner_dismissed=1; max-age=2592000; path=/'; setShow(false) }}>Dismiss</button>
      </div>
    </div>
  )
}
