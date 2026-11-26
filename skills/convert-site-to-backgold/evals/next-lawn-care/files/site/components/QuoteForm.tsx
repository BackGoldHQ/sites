'use client'
import { useState } from 'react'
import { SERVICES } from '../data/services'

export default function QuoteForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const res = await fetch('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    setStatus(res.ok ? 'sent' : 'error')
  }
  if (status === 'sent') return <p className="card">Got it. We call you back today.</p>
  return (
    <form className="quote" onSubmit={submit}>
      <input name="company" tabIndex={-1} autoComplete="off" style={{ display: 'none' }} />
      <label>Name <input name="name" required /></label>
      <label>Phone <input name="phone" type="tel" required /></label>
      <label>Email <input name="email" type="email" /></label>
      <label>Address of the lawn <input name="address" required /></label>
      <label>Service <select name="service"><option value="">Not sure</option>{SERVICES.map((s) => <option key={s.slug}>{s.name}</option>)}</select></label>
      <label>Anything we should know <textarea name="notes" placeholder="Gate code, dog, slope out back." /></label>
      <button className="btn" disabled={status === 'sending'}>Request a quote</button>
      {status === 'error' && <p>That did not send. Call (555) 014-2277 instead.</p>}
    </form>
  )
}
