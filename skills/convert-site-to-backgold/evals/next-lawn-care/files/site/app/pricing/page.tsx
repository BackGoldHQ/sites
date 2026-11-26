import { SERVICES } from '../../data/services'

export const metadata = { title: 'Pricing · Pine Ridge Lawn Care' }

export default function Pricing() {
  return (
    <section className="section">
      <div className="wrap">
        <p className="kicker">Pricing</p>
        <h1>What it costs</h1>
        <p>Prices are for a lot up to a quarter acre in Cedar Hollow. Bigger lots are quoted the same day.</p>
        <table className="prices">
          <thead><tr><th>Service</th><th>Price</th><th></th></tr></thead>
          <tbody>
            {SERVICES.map((s) => <tr key={s.slug}><td>{s.name}</td><td className="price">${s.price}</td><td>{s.unit}</td></tr>)}
          </tbody>
        </table>
        <h2>Questions</h2>
        <details><summary>Is there a contract?</summary><p>No. Stop any week with a text.</p></details>
        <details><summary>How do I pay?</summary><p>Card on file, charged the first of the month for the visits before it.</p></details>
        <details><summary>Do you charge for a quote?</summary><p>Never.</p></details>
      </div>
    </section>
  )
}
