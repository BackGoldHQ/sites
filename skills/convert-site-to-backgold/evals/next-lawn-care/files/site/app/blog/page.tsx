import Link from 'next/link'
import { allPosts } from '../../lib/posts'

export const metadata = { title: 'Notes · Pine Ridge Lawn Care' }

export default function Blog() {
  return (
    <section className="section">
      <div className="wrap">
        <p className="kicker">Notes</p>
        <h1>Notes from the truck</h1>
        <div className="grid">
          {allPosts().map((post) => (
            <Link key={post.slug} className="card" href={`/blog/${post.slug}`}>
              <h3>{post.title}</h3>
              <p>{post.summary}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
