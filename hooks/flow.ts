// A paragraph that holds inline math is drawn word by word, so a one-row picture can sit in the line.

import { inline, inlineMath } from './unicode'

export type Token =
  | { kind: 'word'; text: string; bold: boolean; italic: boolean; code: boolean; space: boolean }
  /** `tex` is the body handed to LaTeX; `source` is the reply's own text, drawn when no picture can be. */
  | { kind: 'math'; tex: string; source: string; space: boolean }

/** One paragraph or one list item: `marker` is '' for a paragraph, `indent` its leading columns. */
export type Item = { marker: string; indent: number; tokens: Token[] }

export type Block =
  /** Text the surface's own markdown renderer draws. */
  | { kind: 'markdown'; text: string }
  /** Paragraphs and list items with no blank line between them, drawn word by word. */
  | { kind: 'flow'; items: Item[] }

type Style = { bold: boolean; italic: boolean; code: boolean }

// Code, inline math, bold and italic, in the order that decides a tie at one position.
const SPAN =
  /`([^`\n]+)`|\\\((.+?)\\\)|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?![\d$])|\*\*(?!\s)(.+?)(?<!\s)\*\*|(?<![\w*\\])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w\\])_(?!\s)([^_\n]+?)(?<!\s)_(?!\w)/g
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|<>~$])/g
const MARKER = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
// A heading, a quote, a table row, a fence or a rule: blocks whose layout stays the renderer's.
const OTHER_BLOCK = /^\s*(#{1,6}\s|>|\||```|~~~|([-*_])(\s*\2){2,}\s*$)/

function tokens(text: string, style: Style, out: Token[]): void {
  const plain = (piece: string, wordStyle: Style, isEscaped: boolean) => {
    const last = out.at(-1)
    if (last !== undefined && /^\s/.test(piece)) last.space = true
    for (const [, word = '', gap] of piece.matchAll(/(\S+)(\s*)/g)) {
      out.push({ kind: 'word', text: isEscaped ? word.replace(ESCAPED, '$1') : word, ...wordStyle, space: gap !== '' })
    }
  }
  let from = 0
  for (const match of text.matchAll(SPAN)) {
    const [whole, code, paren, dollar, bold, star, underscore] = match
    plain(text.slice(from, match.index), style, true)
    from = match.index + whole.length
    const tex = paren ?? dollar
    if (code !== undefined) plain(code, { ...style, code: true }, false)
    else if (tex !== undefined) out.push({ kind: 'math', tex: `\\(${tex}\\)`, source: whole, space: false })
    else if (bold !== undefined) tokens(bold, { ...style, bold: true }, out)
    else tokens(star ?? underscore ?? '', { ...style, italic: true }, out)
  }
  plain(text.slice(from), style, true)
}

// A reply's text cut at its blank lines, a fenced block kept whole.
function chunks(markdown: string): string[] {
  const list: string[] = []
  let lines: string[] = []
  let fence: string | undefined
  for (const line of markdown.split('\n')) {
    const mark = line.match(/^\s*(```|~~~)/)?.[1]
    if (mark !== undefined && (fence === undefined || fence === mark)) fence = fence === undefined ? mark : undefined
    if (fence === undefined && mark === undefined && line.trim() === '') {
      if (lines.length > 0) list.push(lines.join('\n'))
      lines = []
    } else lines.push(line)
  }
  if (lines.length > 0) list.push(lines.join('\n'))
  return list
}

// The paragraphs and list items of one chunk, or undefined when it holds another kind of block.
function items(chunk: string): Item[] | undefined {
  const list: { marker: string; indent: number; text: string }[] = []
  for (const line of chunk.split('\n')) {
    const [, indent, marker, text] = line.match(MARKER) ?? []
    if (marker !== undefined) {
      list.push({ marker: /\d/.test(marker) ? marker : '-', indent: indent?.length ?? 0, text: text ?? '' })
      continue
    }
    if (OTHER_BLOCK.test(line)) return undefined
    const last = list.at(-1)
    // A line with no marker continues the item above it.
    if (last === undefined) list.push({ marker: '', indent: 0, text: line.trim() })
    else last.text += ` ${line.trim()}`
  }
  return list.map(({ marker, indent, text }) => {
    const out: Token[] = []
    tokens(text, { bold: false, italic: false, code: false }, out)
    return { marker, indent, tokens: out }
  })
}

/**
 * A piece of a reply's markdown as blocks: the paragraphs and lists that hold inline math are
 * taken apart into words and formulas, and everything else stays markdown. Inline math in a
 * block that stays markdown (a table, a heading, a quote) is written as Unicode.
 */
export function blocks(markdown: string): Block[] {
  const list: Block[] = []
  for (const chunk of chunks(markdown)) {
    const flow = inlineMath(chunk).length > 0 ? items(chunk) : undefined
    const last = list.at(-1)
    if (flow !== undefined) list.push({ kind: 'flow', items: flow })
    else if (last?.kind === 'markdown') last.text += `\n\n${inline(chunk)}`
    else list.push({ kind: 'markdown', text: inline(chunk) })
  }
  return list
}
