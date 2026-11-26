import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export function allPosts() {
  const dir = path.join(process.cwd(), 'content/blog')
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((file) => {
    const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'))
    return { slug: file.replace(/\.md$/, ''), title: String(data.title), summary: String(data.summary), date: String(data.date), body: content }
  }).sort((a, b) => b.date.localeCompare(a.date))
}
