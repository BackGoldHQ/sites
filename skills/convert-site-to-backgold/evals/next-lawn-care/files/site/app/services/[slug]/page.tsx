import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SERVICES } from '../../../data/services'
import { SITE } from '../../../lib/site'

export function generateStaticParams() { return SERVICES.map((s) => ({ slug: s.slug })) }

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = SERVICES.find((s) => s.slug === slug)
  if (!service) notFound()
  return (
    <section className="section">
      <div className="wrap">
        <p className="kicker"><Link href="/services">Services</Link></p>
        <h1>{service.name}</h1>
        <p className="price">${service.price} {service.unit}</p>
        <p>{service.summary}</p>
        {service.body.map((p) => <p key={p}>{p}</p>)}
        <h2>What is included</h2>
        <ul>{service.includes.map((i) => <li key={i}>{i}</li>)}</ul>
        {service.faqs.length > 0 && <h2>Questions</h2>}
        {service.faqs.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        <p><Link className="btn" href={`/contact?service=${service.slug}`}>Get a quote</Link> <a className="btn alt" href="tel:+15550142277">Call {SITE.phone}</a></p>
      </div>
    </section>
  )
}
