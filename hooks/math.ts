export type Cells = { columns: number; rows: number }

export type Segment =
  | { kind: 'text'; text: string }
  /** `tex` is the body handed to LaTeX; `source` is the reply's own text, drawn when no picture can be. */
  | { kind: 'math'; tex: string; source: string }

// Environments that open display math themselves, so they are not wrapped in \[ \].
const ENVIRONMENTS = 'equation|align|gather|multline|alignat|flalign|eqnarray'

// Code comes first so math delimiters inside a fence or a code span stay text.
// An unclosed fence runs to the end, which is the state of a reply that still streams.
const TOKEN = new RegExp(
  [
    '(?:^|\\n)[ \\t]*(```|~~~)[\\s\\S]*?(?:\\n[ \\t]*\\1|$)',
    '`[^`\\n]*`',
    '\\$\\$([\\s\\S]+?)\\$\\$',
    '\\\\\\[([\\s\\S]+?)\\\\\\]',
    `(\\\\begin\\{(${ENVIRONMENTS})(\\*?)\\}[\\s\\S]+?\\\\end\\{\\5\\6\\})`,
  ].join('|'),
  'g',
)
const OPENS_ENVIRONMENT = new RegExp(`^\\\\begin\\{(?:${ENVIRONMENTS})\\*?\\}`)

function body(inner: string): string {
  // A blank line ends a paragraph, which TeX refuses inside display math.
  const tex = inner.trim().replace(/\n\s*\n/g, '\n')
  return OPENS_ENVIRONMENT.test(tex) ? tex : `\\[ ${tex} \\]`
}

/** A reply's markdown split at its display math: `$$…$$`, `\[…\]` and amsmath environments. */
export function segments(markdown: string): Segment[] {
  const list: Segment[] = []
  let from = 0
  const text = (to: number) => {
    const piece = markdown.slice(from, to).replace(/^\s*\n|\n\s*$/g, '')
    if (piece.trim() !== '') list.push({ kind: 'text', text: piece })
  }
  for (const match of markdown.matchAll(TOKEN)) {
    const inner = match[2] ?? match[3] ?? match[4]
    if (inner === undefined || inner.trim() === '') continue
    text(match.index)
    list.push({ kind: 'math', tex: body(inner), source: match[0] })
    from = match.index + match[0].length
  }
  text(markdown.length)
  return list
}

/** The cache key of one picture: a 53-bit hash (cyrb53) of everything that changes its pixels. */
export function keyOf(foreground: string, tex: string): string {
  const input = `1\n${foreground}\n${tex}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** The picture's box, shrunk in proportion when it is wider than the room it has. */
export function fit(cells: Cells, room: number): Cells {
  if (cells.columns <= room) return cells
  return { columns: room, rows: Math.max(1, Math.round((cells.rows * room) / cells.columns)) }
}

/** A theme's colour as six hex digits, or undefined for one that names no RGB value (`ansi:white`). */
export function hexColour(colour: unknown): string | undefined {
  if (typeof colour !== 'string') return undefined
  const hex = colour.match(/^#([0-9a-fA-F]{6})$/)?.[1]
  if (hex !== undefined) return hex.toLowerCase()
  const rgb = colour.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  return rgb?.slice(1).map(part => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')
}
