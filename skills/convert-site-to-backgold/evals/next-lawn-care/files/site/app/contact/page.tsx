import QuoteForm from '../../components/QuoteForm'
import { SITE } from '../../lib/site'

export const metadata = { title: 'Get a quote · Pine Ridge Lawn Care' }

export default function Contact() {
  return (
    <section className="section">
      <div className="wrap">
        <p className="kicker">Get a quote</p>
        <h1>Tell us the address</h1>
        <p>We call back the same day. Or call {SITE.owner} at <a href="tel:+15550142277">{SITE.phone}</a>, or write to <a href="mailto:hello@pineridgelawn.example">{SITE.email}</a>.</p>
        <QuoteForm />
      </div>
    </section>
  )
}
