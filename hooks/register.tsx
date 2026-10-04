import type { EngineInterface, Register } from 'claude-code'

import { overflow } from './cache'
import { blocks } from './flow'
import type { Block, Item, Token } from './flow'
import { fit, hexColour, keyOf, segments } from './math'
import type { Cells } from './math'
import { readSettings } from './settings'
import type { Settings } from './settings'
import { decide } from './terminal'
import type { Drawing, Terminal } from './terminal'
import { asText, inline, inlineMath } from './unicode'

type Mode = 'display' | 'inline'
/** One piece of a reply, top to bottom: a block of its text, or a display formula between two. */
type Piece = Block | { kind: 'display'; tex: string; source: string }
/** `png` holds the picture's bytes, base64, when the terminal cannot read this machine's files. */
type Formula = { status: 'ready'; path: string; cells: Cells; png?: string } | { status: 'failed'; reason: string }

// The transcript indents a reply's text by two columns, after its bullet.
const INDENT = 2
// How long a colour read stands, so a theme change reaches the next reply and a redraw stays cheap.
const COLOUR_MS = 5000
// A reply that needs more LaTeX runs than this is drawn as Unicode text, so a long derivation starts no flood of them.
const MAX_FORMULAS = 60
const REQUIREMENTS = 'https://github.com/atomashevic/claude-latex-math#requirements'

function section(inlineMath: Settings['inline']) {
  const inlineText =
    inlineMath === 'image'
      ? 'Inline math (`$...$`) in a paragraph or a list item is drawn inside the line, one text row tall, so keep it to expressions that fit a line and put tall formulas (stacked fractions, matrices, sums with limits above and below) in display math. In a table, a heading or a quote, inline math is written as Unicode text instead.'
      : 'Inline math (`$...$`) is written as Unicode text, so keep it to short expressions (symbols, subscripts, superscripts, simple fractions) and put larger formulas in display math.'
  return {
    id: 'latex-math:rendering',
    scope: 'session',
    text: [
      '# Math rendering',
      `This terminal typesets LaTeX math as images. Display math (\`$$ ... $$\` on its own lines, or an amsmath environment such as \`\\begin{align} ... \\end{align}\`) is drawn in place at full size. ${inlineText}`,
    ].join('\n'),
  } as const
}

let settings: Settings = readSettings({})
let session: Promise<Drawing> | undefined
let cache: Promise<string> | undefined
let colour: { readAt: number; value: Promise<string> } | undefined
const formulas = new Map<string, Promise<Formula>>()

// The glyphs are drawn over a transparent background in the colour Claude Code gives a reply's
// text: a custom theme's `text`, and under a built-in theme the terminal's own foreground.
async function textColour($: EngineInterface): Promise<string> {
  // The theme's row in /config, which is all the mod needs; the whole settings object can hold secrets.
  const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
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

function listed(names: string): string {
  const all = names.split(' ')
  return all.length === 1 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

// Deletes the least recently used pictures until the cache fits its limit.
async function prune($: EngineInterface): Promise<void> {
  const dir = await (cache ??= cacheDir($))
  const doomed = overflow(await $.fs.list(dir), settings.cacheBytes)
  for (let i = 0; i < doomed.length; i += 200) {
    await $.process.run(['rm', '-f', '--', ...doomed.slice(i, i + 200).map(name => `${dir}/${name}`)])
  }
}

async function start($: EngineInterface): Promise<Drawing> {
  const env: Terminal = {
    TERM: await $.env.get('TERM'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    TMUX: await $.env.get('TMUX'),
    STY: await $.env.get('STY'),
    SSH_CONNECTION: await $.env.get('SSH_CONNECTION'),
    SSH_TTY: await $.env.get('SSH_TTY'),
    CLAUDE_CODE_SESSION_KIND: await $.env.get('CLAUDE_CODE_SESSION_KIND'),
    CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
  }
  const chosen = await decide(settings.images, env, async () => {
    const ran = await $.process.run(['bash', `${$.plugin.root}/bin/render.sh`, '--check'])
    return ran.exitCode === 0 ? '' : ran.stdout.trim() || 'a tool'
  })
  if (chosen.kind === 'text' && chosen.reason === 'missing') {
    $.ui.log(`latex-math: ${listed(chosen.missing)} not found, so math is shown as Unicode text. See ${REQUIREMENTS}`)
  }
  await prune($).catch(() => undefined)
  return chosen
}

// Decided once a session: on its start, or on the first draw where a test or a reload skipped the start.
// A start that fails (an abandoned dispatch, a check that could not run) draws text once and is tried again.
function drawing($: EngineInterface): Promise<Drawing> {
  session ??= start($).catch((): Drawing => {
    session = undefined
    return { kind: 'text', reason: 'terminal' }
  })
  return session
}

async function render($: EngineInterface, tex: string, foreground: string, mode: Mode, bytes: boolean): Promise<Formula> {
  const dir = await (cache ??= cacheDir($))
  const scale = mode === 'display' ? settings.scale : 1
  const key = keyOf(scale === 1 ? foreground : `${foreground}@${scale}`, tex)
  const ran = await $.process.run(
    ['bash', `${$.plugin.root}/bin/render.sh`, dir, key, foreground, mode, String(scale)],
    { stdin: tex },
  )
  const [columns, rows] = ran.stdout.trim().split(' ').map(Number)
  if (ran.exitCode !== 0 || !columns || !rows) {
    return { status: 'failed', reason: ran.stderr.trim().slice(0, 200) || 'the renderer printed no size' }
  }
  const path = `${dir}/${key}.png`
  const png = bytes ? (await $.fs.read(path, { as: 'bytes' })).base64 : undefined
  return { status: 'ready', path, cells: { columns, rows }, png }
}

async function formula($: EngineInterface, tex: string, foreground: string, mode: Mode, bytes: boolean): Promise<Formula> {
  const id = `${foreground}\n${tex}`
  const known = formulas.get(id)
  if (known !== undefined) {
    const result = await known
    // Another session's cache trim, or the user, can delete a picture this session still draws.
    if (result.status === 'failed' || result.png !== undefined || (await $.fs.exists(result.path))) return result
    if (formulas.get(id) === known) formulas.delete(id)
  }
  let pending = formulas.get(id)
  if (pending === undefined) {
    // A rejection is an abandoned dispatch or a missing binary, so the next draw tries again.
    pending = render($, tex, foreground, mode, bytes).catch(error => {
      formulas.delete(id)
      return { status: 'failed', reason: String(error).slice(0, 200) }
    })
    formulas.set(id, pending)
  }
  return pending
}

export const register: Register = (on, options) => {
  settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Only a session that draws in the terminal needs the decision; -p and the SDK never draw.
    if (e.surface === 'terminal') await drawing($)
    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.surfaces[0] !== 'terminal' || !settings.promptSection) return composed
    if ((await drawing($)).kind !== 'images') return composed
    return { sections: [...composed.sections, section(settings.inline)] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const parts = segments(e.props.text)
    const inlines = parts.flatMap(part => (part.kind === 'text' ? inlineMath(part.text) : []))
    const displays = parts.flatMap(part => (part.kind === 'math' ? [part.tex] : []))
    if (inlines.length + displays.length === 0) return next(e)
    const runs = new Set([...displays, ...(settings.inline === 'image' ? inlines : [])]).size
    const how = await drawing($)
    if (how.kind === 'text' || runs > MAX_FORMULAS) {
      return next({ ...e, props: { ...e.props, text: asText(e.props.text) } })
    }

    const pieces = parts.flatMap((part): Piece[] => {
      if (part.kind === 'math') return [{ kind: 'display', tex: part.tex, source: part.source }]
      return settings.inline === 'image' ? blocks(part.text) : [{ kind: 'markdown', text: inline(part.text) }]
    })
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
    const bytes = how.source === 'bytes'
    await Promise.all(wanted.map(async ([tex, mode]) => made.set(tex, await formula($, tex, foreground, mode, bytes))))

    const picture = (tex: string, source: string) => {
      const result = made.get(tex)
      if (result?.status !== 'ready') return undefined
      const { columns, rows } = fit(result.cells, room)
      const image = result.png === undefined ? { file: result.path, format: 'png' as const } : { png: result.png }
      return <Image source={image} columns={columns} rows={rows} alt={source} />
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
