// A formula comes from the model, and LaTeX can read any file that the user can read. So a formula
// is rendered only when every command in it is on the list of math commands in commands.ts.
//
// The check holds for the preamble in bin/render.sh, where a backslash is the only way to name a
// command and ^ is the only superscript character.

import { COMMANDS, ENVIRONMENTS } from './commands'

// One command as TeX reads it under LaTeX's category codes: a backslash and a run of letters, or a
// backslash and one other character. Reading them in order keeps `\\frac` apart from `\frac`.
const COMMAND = /\\(?:([A-Za-z]+)|[\s\S])?/g

/** Why a formula is not rendered, or undefined when it has only commands from the list. */
export function refusal(tex: string): string | undefined {
  // TeX turns ^^ and what follows into another character before it reads commands.
  if (tex.includes('^^')) return 'the ^^ notation is not allowed'
  for (const match of tex.matchAll(COMMAND)) {
    const name = match[1]
    if (name === undefined) continue
    if (!COMMANDS.has(name)) return `\\${name} is not on the list of math commands`
    if (name === 'begin' || name === 'end') {
      // \begin and \end run the command that their argument names, so the name is checked too.
      const environment = tex.slice(match.index + match[0].length).match(/^\s*\{([A-Za-z]+\*?)\}/)?.[1]
      if (environment === undefined) return `\\${name} has no plain environment name`
      if (!ENVIRONMENTS.has(environment)) return `the environment ${environment} is not on the list`
    }
  }
  return undefined
}
