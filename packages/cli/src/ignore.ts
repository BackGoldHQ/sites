// The `.assetsignore` rules wrangler applies to an assets directory, in the
// part of gitignore syntax such files use: `#` comments, `!` negation, a
// leading or inner `/` anchoring to the directory, a trailing `/` matching
// directories only, and `*`, `**` and `?`. The last rule that matches wins.

interface Rule {
  negate: boolean
  dirOnly: boolean
  pattern: RegExp
}

function globToRegExp(glob: string, anchored: boolean): RegExp {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` is any number of directories, `**` at the end anything.
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?'
          i += 2
        } else {
          source += '.*'
          i += 1
        }
      } else {
        source += '[^/]*'
      }
    } else if (ch === '?') {
      source += '[^/]'
    } else {
      source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(anchored ? `^${source}$` : `^(?:.*/)?${source}$`)
}

function parseRule(line: string): Rule | null {
  let text = line.replace(/\s+$/, '')
  if (!text || text.startsWith('#')) return null
  const negate = text.startsWith('!')
  if (negate) text = text.slice(1)
  const dirOnly = text.endsWith('/')
  if (dirOnly) text = text.slice(0, -1)
  const anchored = text.includes('/')
  if (text.startsWith('/')) text = text.slice(1)
  if (!text) return null
  return { negate, dirOnly, pattern: globToRegExp(text, anchored) }
}

/** A predicate over `/`-separated paths relative to the assets directory: true when the file is ignored. */
export function ignoreMatcher(lines: readonly string[]): (path: string) => boolean {
  const rules = lines.map(parseRule).filter((r): r is Rule => r !== null)
  return (path) => {
    const parts = path.split('/')
    let ignored = false
    for (const rule of rules) {
      // The file itself, or any directory above it.
      let hit = !rule.dirOnly && rule.pattern.test(path)
      for (let n = 1; !hit && n < parts.length; n++) hit = rule.pattern.test(parts.slice(0, n).join('/'))
      if (hit) ignored = !rule.negate
    }
    return ignored
  }
}
