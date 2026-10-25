// What the CLI needs from the process, behind one interface so the tests
// can run every command in-process.
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export interface Io {
  fetch: typeof fetch
  env: Record<string, string | undefined>
  cwd: string
  stdout(text: string): void
  stderr(text: string): void
  /** True when a person can answer a prompt. */
  interactive: boolean
  /** Ask on the terminal with the answer not echoed. */
  promptSecret(question: string): Promise<string>
  /** Everything piped to stdin. */
  readStdin(): Promise<string>
  /** Run `command` in a shell in `cwd`; its output goes to stderr. Resolves to the exit code. */
  run(command: string, cwd: string, env: Record<string, string | undefined>): Promise<number>
  /** `git <args>` in `cwd`, trimmed; null when git is missing or the directory is not a repository. */
  git(args: string[], cwd: string): Promise<string | null>
  sleep(ms: number): Promise<void>
  now(): number
  randomId(): string
}

function promptSecret(question: string): Promise<string> {
  const stdin = process.stdin
  process.stderr.write(question)
  return new Promise((resolveAnswer, reject) => {
    let value = ''
    const finish = (error?: Error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      process.stderr.write('\n')
      if (error) reject(error)
      else resolveAnswer(value)
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish()
        if (ch === '\u0003' || ch === '\u0004') return finish(new Error('cancelled'))
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else if (ch >= ' ') value += ch
      }
    }
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

async function readStdin(): Promise<string> {
  let text = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) text += chunk
  return text
}

export const nodeIo: Io = {
  fetch: globalThis.fetch,
  env: process.env,
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
  promptSecret,
  readStdin,
  run: (command, cwd, env) =>
    new Promise((done) => {
      const child = spawn(command, { cwd, env, shell: true, stdio: ['inherit', process.stderr, 'inherit'] })
      child.on('error', () => done(127))
      child.on('close', (code) => done(code ?? 1))
    }),
  git: (args, cwd) =>
    new Promise((done) => {
      execFile('git', args, { cwd }, (error, stdout) => done(error ? null : stdout.trim() || null))
    }),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  now: () => Date.now(),
  randomId: () => randomUUID(),
}
