import type { EngineInterface, Register } from 'claude-code'

import { blocks } from './flow'
import type { Block, Item, Token } from './flow'
import { fit, hexColour, keyOf, segments } from './math'
import type { Cells } from './math'
import { inline } from './unicode'

type Mode = 'display' | 'inline'
/** One piece of a reply, top to bottom: a block of its text, or a display formula between two. */
type Piece = Block | { kind: 'display'; tex: string; source: string }
type Formula = { status: 'ready'; path: string; cells: Cells } | { status: 'failed'; reason: string }

// The transcript indents a reply's text by two columns, after its bullet.
const INDENT = 2
// How long a colour read stands, so a theme change reaches the next reply and a redraw stays cheap.
const COLOUR_MS = 5000

const SECTION = {
  id: 'latex-math:rendering',
  scope: 'session',
  text: [
    '# Math rendering',
    'This terminal typesets LaTeX math as images. Display math (`$$ ... $$` on its own lines, or an amsmath environment such as `\\begin{align} ... \\end{align}`) is drawn in place at full size. Inline math (`$...$`) in a paragraph or a list item is drawn inside the line, one text row tall, so keep it to expressions that fit a line and put tall formulas (stacked fractions, matrices, sums with limits above and below) in display math. In a table, a heading or a quote, inline math is written as Unicode text instead.',
  ].join('\n'),
} as const

let cache: Promise<string> | undefined
let colour: { readAt: number; value: Promise<string> } | undefined
const formulas = new Map<string, Promise<Formula>>()

// The glyphs are drawn over a transparent background in the colour Claude Code gives a reply's
// text: a custom theme's `text`, and under a built-in theme the terminal's own foreground.
async function textColour($: EngineInterface): Promise<string> {
  const { theme } = await $.settings.read()
  let base = String(theme ?? 'auto')
  if (base.startsWith('custom:')) {
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const custom = await $.fs.read(`${config}/themes/${base.slice('custom:'.length)}.json`).then(
      text => JSON.parse(text) as { base?: string; overrides?: { text?: string } },
      () => undefined,
    )
    const text = hexColour(custom?.overrides?.text)
    if (text !== undefined) return text
    base = custom?.base ?? 'dark'
  }
  if ((await $.env.get('TERM_PROGRAM')) === 'ghostty') {
    const config = await $.process.run(['ghostty', '+show-config']).catch(() => undefined)
    const foreground = hexColour(config?.stdout.match(/^foreground = (#[0-9a-fA-F]{6})$/m)?.[1])
    if (foreground !== undefined) return foreground
  }
  return base.includes('light') ? '000000' : 'ffffff'
}

function currentColour($: EngineInterface): Promise<string> {
  const now = Date.now()
  if (colour === undefined || now - colour.readAt > COLOUR_MS) {
    colour = { readAt: now, value: textColour($).catch(() => 'ffffff') }
  }
  return colour.value
}

async function cacheDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('XDG_CACHE_HOME')) ?? `${await $.env.get('HOME')}/.cache`
  return `${home}/claude-latex-math`
}

async function render($: EngineInterface, tex: string, foreground: string, mode: Mode): Promise<Formula> {
  const dir = await (cache ??= cacheDir($))
  const key = keyOf(foreground, tex)
  const ran = await $.process.run(['bash', `${$.plugin.root}/bin/render.sh`, dir, key, foreground, mode], {
    stdin: tex,
  })
  const [columns, rows] = ran.stdout.trim().split(' ').map(Number)
  if (ran.exitCode !== 0 || !columns || !rows) {
    return { status: 'failed', reason: ran.stderr.trim().slice(0, 200) || 'the renderer printed no size' }
  }
  return { status: 'ready', path: `${dir}/${key}.png`, cells: { columns, rows } }
}

function formula($: EngineInterface, tex: string, foreground: string, mode: Mode): Promise<Formula> {
  const id = `${foreground}\n${tex}`
  let pending = formulas.get(id)
  if (pending === undefined) {
    // A rejection is an abandoned dispatch or a missing binary, so the next draw tries again.
    pending = render($, tex, foreground, mode).catch(error => {
      formulas.delete(id)
      return { status: 'failed', reason: String(error).slice(0, 200) }
    })
    formulas.set(id, pending)
  }
  return pending
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.surfaces[0] !== 'terminal') return composed
    return { sections: [...composed.sections, SECTION] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const pieces = segments(e.props.text).flatMap((part): Piece[] =>
      part.kind === 'text' ? blocks(part.text) : [{ kind: 'display', tex: part.tex, source: part.source }],
    )
    if (pieces.every(piece => piece.kind === 'markdown')) {
      const text = inline(e.props.text)
      return next(text === e.props.text ? e : { ...e, props: { ...e.props, text } })
    }

    const { Box, Image, Markdown, Text } = $.ui.resolve(e)
    const room = Math.max(8, (e.viewport?.columns ?? 80) - INDENT - 2)
    const foreground = await currentColour($)

    // Every formula is rendered before the tree is built, so the drawing below is synchronous.
    const made = new Map<string, Formula>()
    const wanted = pieces.flatMap((piece): [string, Mode][] => {
      if (piece.kind === 'display') return [[piece.tex, 'display']]
      if (piece.kind === 'markdown') return []
      return piece.items.flatMap(item => item.tokens.flatMap((token): [string, Mode][] => (token.kind === 'math' ? [[token.tex, 'inline']] : [])))
    })
    await Promise.all(wanted.map(async ([tex, mode]) => made.set(tex, await formula($, tex, foreground, mode))))

    const picture = (tex: string, source: string) => {
      const result = made.get(tex)
      if (result?.status !== 'ready') return undefined
      const { columns, rows } = fit(result.cells, room)
      return <Image source={{ file: result.path, format: 'png' }} columns={columns} rows={rows} alt={source} />
    }
    const token = (one: Token) => (
      <Box marginRight={one.space ? 1 : 0} flexShrink={0}>
        {one.kind === 'word' ? (
          <Text bold={one.bold} italic={one.italic} color={one.code ? 'permission' : undefined}>
            {one.text}
          </Text>
        ) : (
          (picture(one.tex, one.source) ?? <Text>{one.source}</Text>)
        )}
      </Box>
    )
    const item = (one: Item) => (
      <Box flexDirection="row" paddingLeft={one.indent}>
        {one.marker !== '' && (
          <Box marginRight={1} flexShrink={0}>
            <Text>{one.marker}</Text>
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1}>
          {one.tokens.map(token)}
        </Box>
      </Box>
    )
    const draw = (piece: Piece) => {
      if (piece.kind === 'markdown') return <Markdown text={piece.text} />
      if (piece.kind === 'flow') return <Box flexDirection="column">{piece.items.map(item)}</Box>
      const result = made.get(piece.tex)
      return (
        picture(piece.tex, piece.source) ?? (
          <Box flexDirection="column">
            <Text>{piece.source}</Text>
            <Text dimColor>latex: {result?.status === 'failed' ? result.reason : 'not rendered'}</Text>
          </Box>
        )
      )
    }

    // The engine draws the reply's opening text itself, so the bullet and its spacing stay its own.
    const first = pieces[0]
    if (first?.kind === 'markdown') {
      const head = await next({ ...e, props: { ...e.props, text: first.text } })
      return (
        <Box flexDirection="column" rowGap={1}>
          {head}
          <Box flexDirection="column" rowGap={1} paddingLeft={INDENT}>
            {pieces.slice(1).map(draw)}
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box width={INDENT} flexShrink={0}>
          {e.props.isFirstOfReply && <Text>●</Text>}
        </Box>
        <Box flexDirection="column" rowGap={1} flexGrow={1} flexShrink={1}>
          {pieces.map(draw)}
        </Box>
      </Box>
    )
  })
}
