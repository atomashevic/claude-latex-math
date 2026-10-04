import type { Settings } from './settings'

/** The environment variables that say where Claude Code draws. */
export type Terminal = {
  TERM?: string
  TERM_PROGRAM?: string
  KITTY_WINDOW_ID?: string
  TMUX?: string
  STY?: string
  SSH_CONNECTION?: string
  SSH_TTY?: string
  CLAUDE_CODE_SESSION_KIND?: string
  CLAUDE_CODE_FORCE_TERMINAL_IMAGES?: string
}

/** How this session draws math, decided once when it starts. */
export type Drawing =
  /** `bytes` when the terminal is across ssh and cannot read this machine's files. */
  | { kind: 'images'; source: 'file' | 'bytes' }
  | { kind: 'text'; reason: 'setting' | 'terminal' }
  | { kind: 'text'; reason: 'missing'; missing: string }

/** Where Claude Code draws no kitty graphics at all: inside tmux or screen, and in a background session. */
function refuses(env: Terminal): boolean {
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES) return false
  return env.CLAUDE_CODE_SESSION_KIND === 'bg' || Boolean(env.TMUX) || Boolean(env.STY)
}

/**
 * Claude Code's own rule for kitty graphics, read from the environment: pictures in kitty and Ghostty,
 * none where it refuses them, and always when CLAUDE_CODE_FORCE_TERMINAL_IMAGES is set.
 * Claude Code also asks the terminal for its version, which a mod cannot.
 */
export function drawsImages(env: Terminal): boolean {
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES) return true
  if (refuses(env)) return false
  return (
    env.TERM_PROGRAM === 'ghostty' ||
    env.TERM === 'xterm-ghostty' ||
    (env.TERM ?? '').includes('kitty') ||
    env.KITTY_WINDOW_ID !== undefined
  )
}

/** `missing` runs the renderer's check only when pictures are wanted, and answers what it lacks, or ''. */
export async function decide(
  setting: Settings['images'],
  env: Terminal,
  missing: () => Promise<string>,
): Promise<Drawing> {
  if (setting === 'off') return { kind: 'text', reason: 'setting' }
  // Where Claude Code refuses images it draws each picture's alt, the LaTeX source, so `on` cannot help there.
  if (refuses(env) || (setting === 'auto' && !drawsImages(env))) return { kind: 'text', reason: 'terminal' }
  const lacking = await missing()
  if (lacking !== '') return { kind: 'text', reason: 'missing', missing: lacking }
  return { kind: 'images', source: env.SSH_CONNECTION || env.SSH_TTY ? 'bytes' : 'file' }
}
