import Link from 'next/link'
import { cookies } from 'next/headers'
import { SERVICES } from '../data/services'
import { SITE } from '../lib/site'

export default async function Home() {
  const returning = (await cookies()).get('banner_dismissed')?.value === '1'
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="kicker">{SITE.city}, {SITE.state} · since {SITE.since}</p>
          <h1>A lawn you do not have to think about.</h1>
          <p>{SITE.tagline}</p>
          <p>
            <Link className="btn" href="/contact">Get a quote</Link>{' '}
            <a className="btn alt" href="tel:+15550142277">Call {SITE.phone}</a>
          </p>
          {returning && <p className="kicker">Welcome back.</p>}
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <p className="kicker">What we do</p>
          <h2>Four things, done properly</h2>
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
      <section className="section">
        <div className="wrap">
          <p className="kicker">How it works</p>
          <h2>Three steps</h2>
          <div className="grid">
            <div className="card"><h3>1. Tell us the address</h3><p>We look at the lot from the street and from the county map before we call you back.</p></div>
            <div className="card"><h3>2. Get one number</h3><p>A price for the season, in writing, the same day. No contracts.</p></div>
            <div className="card"><h3>3. Pick a day</h3><p>You get the same crew on the same weekday, and a text the night before.</p></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap card">
          <h2>{SITE.owner} answers the phone</h2>
          <p>Pine Ridge is two crews and one truck that started with a borrowed mower in {SITE.since}. If something is not right, you call the owner, not a call center.</p>
          <Link className="btn" href="/contact">Get a quote</Link>
        </div>
      </section>
    </>
  )
}
