import Link from 'next/link'
import { SERVICES } from '../../data/services'

export const metadata = { title: 'Services · Pine Ridge Lawn Care' }

export default function Services() {
  return (
    <section className="section">
      <div className="wrap">
        <p className="kicker">Services</p>
        <h1>What we do</h1>
        <div className="grid">
          {SERVICES.map((s) => (
            <Link key={s.slug} className="card" href={`/services/${s.slug}`}>
              <h3>{s.name}</h3>
              <p className="price">${s.price} {s.unit}</p>
              <p>{s.summary}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
