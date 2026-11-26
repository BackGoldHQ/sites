import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  const body = await request.json()
  if (body.company) return NextResponse.json({ ok: true }) // honeypot
  if (!body.name || !body.phone || !body.address) return NextResponse.json({ ok: false, error: 'Name, phone and address, please.' }, { status: 400 })
  await resend.emails.send({
    from: 'quotes@pineridgelawn.example',
    to: process.env.QUOTE_TO ?? 'hello@pineridgelawn.example',
    subject: `Quote request: ${body.service ?? 'not sure'} for ${body.name}`,
    text: `${body.name}\n${body.phone}\n${body.email ?? ''}\n${body.address}\n${body.service ?? ''}\n\n${body.notes ?? ''}`,
  })
  return NextResponse.json({ ok: true })
}
