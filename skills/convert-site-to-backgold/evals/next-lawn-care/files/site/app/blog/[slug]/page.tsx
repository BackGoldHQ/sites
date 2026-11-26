import { notFound } from 'next/navigation'
import { marked } from 'marked'
import { allPosts } from '../../../lib/posts'

export function generateStaticParams() { return allPosts().map((p) => ({ slug: p.slug })) }

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = allPosts().find((p) => p.slug === slug)
  if (!post) notFound()
  return <section className="section"><article className="wrap"><p className="kicker">Notes</p><h1>{post.title}</h1><div dangerouslySetInnerHTML={{ __html: marked.parse(post.body) as string }} /></article></section>
}
