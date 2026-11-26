import './globals.css'
import Link from 'next/link'
import { NAV, SITE } from '../lib/site'
import Banner from '../components/Banner'
import OpenNow from '../components/OpenNow'

export const metadata = { title: 'Pine Ridge Lawn Care · Cedar Hollow, OR', description: 'Weekly mowing, aeration, cleanups and hedges in Cedar Hollow.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Banner />
        <header className="site-header">
          <div className="wrap">
            <Link className="brand" href="/">{SITE.name}</Link>
            <nav>
              {NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
              <a className="call" href="tel:+15550142277">{SITE.phone}</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p><strong>{SITE.name}</strong> · {SITE.city}, {SITE.state} · <a href="tel:+15550142277">(555) 014-2277</a> · <a href="mailto:hello@pineridgelawn.example">hello@pineridgelawn.example</a></p>
            <p>Monday to Friday {SITE.hours.weekdays} · Saturday {SITE.hours.saturday} · Sunday closed</p>
            <OpenNow />
            <p><Link href="/privacy">Privacy</Link> · Owner-operated by {SITE.owner} since {SITE.since}.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
