// Flag parsing: `--name value`, `--name=value` and bare booleans. Every
// command takes the global flags; anything else not in its own list is a
// usage error.

export type FlagKind = 'value' | 'boolean'

export const GLOBAL_FLAGS: Record<string, FlagKind> = {
  '--token': 'value',
  '--api': 'value',
  '--project': 'value',
  '--json': 'boolean',
}

export interface Parsed {
  flags: Record<string, string | true>
  positionals: string[]
}

/** The flags and positionals in `args`; a string is the usage problem. */
export function parseArgs(args: readonly string[], own: Record<string, FlagKind>, maxPositionals: number): Parsed | string {
  const known: Record<string, FlagKind> = { ...GLOBAL_FLAGS, ...own }
  const flags: Record<string, string | true> = {}
  const positionals: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (!arg.startsWith('-') || arg === '-') {
      if (positionals.length >= maxPositionals) return `unexpected argument ${arg}`
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq > 0 ? arg.slice(0, eq) : arg
    const kind = Object.hasOwn(known, name) ? known[name] : undefined
    if (!kind) return `unknown flag ${name}`
    if (name in flags) return `${name} is given twice`
    if (kind === 'boolean') {
      if (eq > 0) return `${name} takes no value`
      flags[name] = true
      continue
    }
    const value = eq > 0 ? arg.slice(eq + 1) : args[++i]
    if (value === undefined || value === '' || (eq < 0 && value.startsWith('--'))) return `${name} needs a value`
    flags[name] = value
  }
  return { flags, positionals }
}
