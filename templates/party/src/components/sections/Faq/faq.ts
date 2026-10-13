// A Faq's rows as its layouts draw them. A row is drawn when it has both a
// question and an answer (a question with no answer is nothing to open). The
// answer stays the row's own value, drawn through Prose; its plain text goes
// into the FAQPage JSON-LD every layout writes, so search reads the same
// questions and answers the page shows. `topicsOf` groups the rows by their
// `topic` in the order each topic first appears, with the rows that have none
// last under "Other"; it is empty when no row has a topic.

import type { Section } from '@backgold/content'
import { serializeJsonLd } from '@backgold/astro/server'
import { links, rows, type Link } from '../../../lib/section'
import { prose, text } from '../../../lib/format'

export interface Question {
  question: string
  /** The row's answer as BackGold sends it: rich text or plain paragraphs, for Prose. */
  answer: unknown
  /** The answer as plain text, paragraphs a blank line apart. */
  answerText: string
  topic: string | null
}

export interface Topic {
  /** "1", "2", … in nav order: what the topic buttons and their groups are matched by. */
  key: string
  label: string
  questions: Question[]
}

export interface Contact {
  heading: string | null
  link: Link
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Sanitized rich text as plain text: tags dropped, a paragraph or list item ending a line, entities decoded. */
function plainText(html: string): string {
  return html
    .replace(/<(?:br|\/p|\/li|\/h[23]|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec: string, hex: string, name: string) =>
      dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : (ENTITIES[name.toLowerCase()] ?? whole),
    )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function questionsOf(section: Section): Question[] {
  return rows(section).flatMap((row) => {
    const question = text(row.question)?.trim()
    const body = prose(row.answer)
    const answerText = body ? ('html' in body ? plainText(body.html) : body.paragraphs.join('\n\n')) : ''
    if (!question || !answerText) return []
    return [{ question, answer: row.answer, answerText, topic: text(row.topic)?.trim() ?? null }]
  })
}

export function topicsOf(questions: Question[]): Topic[] {
  if (!questions.some((q) => q.topic)) return []
  const topics: Topic[] = []
  const other: Question[] = []
  for (const q of questions) {
    if (!q.topic) {
      other.push(q)
      continue
    }
    let topic = topics.find((t) => t.label === q.topic)
    if (!topic) {
      topic = { key: '', label: q.topic, questions: [] }
      topics.push(topic)
    }
    topic.questions.push(q)
  }
  if (other.length > 0) topics.push({ key: '', label: 'Other', questions: other })
  return topics.map((t, i) => ({ ...t, key: String(i + 1) }))
}

/** The contact line's link, labelled `contactLabel`, with `contactHeading` beside it; null without the link. */
export function contactOf(section: Section): Contact | null {
  const link = links(section)[0]
  return link ? { heading: text(section.copy.contactHeading), link } : null
}

/** The FAQPage JSON-LD for the questions, ready for a `<script type="application/ld+json">`; null with none. */
export function faqSchema(questions: Question[]): string | null {
  if (questions.length === 0) return null
  return serializeJsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: questions.map((q) => ({
        '@type': 'Question',
        name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.answerText },
      })),
    },
  ])
}
