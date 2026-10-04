import type { FsEntry } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { overflow } from '../hooks/cache'
import { blocks } from '../hooks/flow'
import { fit, hexColour, keyOf, segments } from '../hooks/math'
import { readSettings } from '../hooks/settings'
import { decide, drawsImages } from '../hooks/terminal'
import { asText, inline, unicode } from '../hooks/unicode'

test('display math is split from the text around it', () => {
  expect(segments('Euler:\n\n$$e^{i\\pi} + 1 = 0$$\n\nDone.')).toEqual([
    { kind: 'text', text: 'Euler:' },
    { kind: 'math', tex: '\\[ e^{i\\pi} + 1 = 0 \\]', source: '$$e^{i\\pi} + 1 = 0$$' },
    { kind: 'text', text: 'Done.' },
  ])
  expect(segments('\\[\nx^2\n\\]')).toEqual([{ kind: 'math', tex: '\\[ x^2 \\]', source: '\\[\nx^2\n\\]' }])
})

test('an amsmath environment is handed to LaTeX unwrapped, bare or inside $$', () => {
  const align = '\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}'
  expect(segments(align)).toEqual([{ kind: 'math', tex: align, source: align }])
  expect(segments(`$$\n${align}\n$$`)).toEqual([{ kind: 'math', tex: align, source: `$$\n${align}\n$$` }])
  // `aligned` lives inside math mode, so it keeps its \[ \].
  expect(segments('$$\\begin{aligned}a&=b\\end{aligned}$$')[0]).toMatchObject({
    tex: '\\[ \\begin{aligned}a&=b\\end{aligned} \\]',
  })
})

test('a blank line inside display math is removed, since TeX refuses it', () => {
  expect(segments('$$\na\n\n+ b\n$$')[0]).toMatchObject({ tex: '\\[ a\n+ b \\]' })
})

test('math delimiters inside code, inline math and unclosed math stay text', () => {
  const fenced = 'Run:\n```sh\necho "$$x$$"\n```\nand `$$y$$` here.'
  expect(segments(fenced)).toEqual([{ kind: 'text', text: fenced }])
  expect(segments('cost is $5 and $x$ too')).toEqual([{ kind: 'text', text: 'cost is $5 and $x$ too' }])
  // A reply that still streams: the formula and the fence are not closed yet.
  expect(segments('So:\n$$\\frac{1}{2')).toEqual([{ kind: 'text', text: 'So:\n$$\\frac{1}{2' }])
  expect(segments('```tex\n$$x$$')).toEqual([{ kind: 'text', text: '```tex\n$$x$$' }])
})

test('the cache key changes with the formula and with the text colour', () => {
  expect(keyOf('d8d8d8', '\\[ x \\]')).toBe(keyOf('d8d8d8', '\\[ x \\]'))
  expect(keyOf('d8d8d8', '\\[ x \\]')).toMatch(/^[0-9a-f]{14}$/)
  expect(keyOf('d8d8d8', '\\[ x \\]')).not.toBe(keyOf('d8d8d8', '\\[ y \\]'))
  expect(keyOf('d8d8d8', '\\[ x \\]')).not.toBe(keyOf('1f1f1f', '\\[ x \\]'))
})

test('a picture wider than its room shrinks in proportion', () => {
  expect(fit({ columns: 34, rows: 3 }, 100)).toEqual({ columns: 34, rows: 3 })
  expect(fit({ columns: 98, rows: 2 }, 49)).toEqual({ columns: 49, rows: 1 })
  expect(fit({ columns: 200, rows: 1 }, 20)).toEqual({ columns: 20, rows: 1 })
})

test('inline math becomes Unicode text', () => {
  const cases: [string, string][] = [
    ['\\beta_0 \\leq x^2', 'β₀ ≤ x²'],
    ['\\sum_{i=1}^{n} x_i', '∑ᵢ₌₁ⁿ xᵢ'],
    ['\\hat{\\beta} = (X^\\top X)^{-1} X^\\top y', 'β̂ = (Xᵀ X)⁻¹ Xᵀ y'],
    ['x \\in \\mathbb{R}^n', 'x ∈ ℝⁿ'],
    ['\\frac{a}{b}', 'a/b'],
    ['\\frac{x+1}{2\\pi}', '(x+1)/2π'],
    ['\\frac{\\partial f}{\\partial x}', '∂f/∂x'],
    ['\\left( \\frac{1}{2} \\right)^n', '(1/2)ⁿ'],
    ['\\sqrt[3]{x+1}', '∛(x+1)'],
    ["f'(x)", 'f′(x)'],
    ['\\text{Var}(X) = \\sigma^2', 'Var(X) = σ²'],
    // A script with no Unicode form keeps its mark.
    ['e^{i\\pi}', 'e^(iπ)'],
    ['x^q', 'x^q'],
  ]
  for (const [tex, text] of cases) expect(unicode(tex)).toBe(text)
})

test('a formula plain text cannot hold keeps its source', () => {
  expect(unicode('\\begin{pmatrix} a \\end{pmatrix}')).toBeUndefined()
  expect(unicode('\\unknowncommand{y}')).toBeUndefined()
  expect(inline('so $\\unknowncommand{y}$ holds')).toBe('so $\\unknowncommand{y}$ holds')
})

test('inline math is found in a reply, and prices and code are left alone', () => {
  expect(inline('Let $x_i \\in \\mathbb{R}$ and \\(\\alpha \\to 0\\).')).toBe('Let xᵢ ∈ ℝ and α → 0.')
  expect(inline('Cost is $5 and $10, or $3/$4.')).toBe('Cost is $5 and $10, or $3/$4.')
  expect(inline('Code `$y$` stays.\n```\n$z$\n```')).toBe('Code `$y$` stays.\n```\n$z$\n```')
  // The result is markdown, so the characters markdown reads as markup are escaped.
  expect(inline('$|x| < 1$ and $a * b$')).toBe('\\|x\\| \\< 1 and a \\* b')
})

test('a theme colour is read as six hex digits', () => {
  expect(hexColour('#CDF2E3')).toBe('cdf2e3')
  expect(hexColour('rgb(255, 255,255)')).toBe('ffffff')
  expect(hexColour('ansi:white')).toBeUndefined()
  expect(hexColour(undefined)).toBeUndefined()
})

test('a paragraph with inline math is taken apart into words and formulas', () => {
  const word = { kind: 'word', bold: false, italic: false, code: false }
  expect(blocks('Let $x_i$, with **bold** and `a b`.')).toEqual([
    {
      kind: 'flow',
      items: [
        {
          marker: '',
          indent: 0,
          tokens: [
            { ...word, text: 'Let', space: true },
            // No space before the comma, so the picture and the comma stay together.
            { kind: 'math', tex: '\\(x_i\\)', source: '$x_i$', space: false },
            { ...word, text: ',', space: true },
            { ...word, text: 'with', space: true },
            { ...word, text: 'bold', bold: true, space: true },
            { ...word, text: 'and', space: true },
            { ...word, text: 'a', code: true, space: true },
            { ...word, text: 'b', code: true, space: false },
            { ...word, text: '.', space: false },
          ],
        },
      ],
    },
  ])
})

test('list items keep their markers, and a line without one continues the item above', () => {
  const [block] = blocks('Where:\n- $x$ is the input\n  and more\n  2. nested $y$')
  expect(block?.kind === 'flow' && block.items.map(item => [item.marker, item.indent, item.tokens.length])).toEqual([
    ['', 0, 1],
    ['-', 0, 6],
    ['2.', 2, 2],
  ])
})

test('blocks without inline math, and tables, headings and quotes, stay markdown', () => {
  expect(blocks('Plain text.\n\n```sh\necho "$x$"\n\necho\n```\n\nCost $5.')).toEqual([
    { kind: 'markdown', text: 'Plain text.\n\n```sh\necho "$x$"\n\necho\n```\n\nCost $5.' },
  ])
  // Inline math in a block the renderer keeps is written as Unicode.
  expect(blocks('## The $\\alpha$ term\n\n| a | $\\beta_0$ |\n|---|---|\n\n> so $x^2$')).toEqual([
    { kind: 'markdown', text: '## The α term\n\n| a | β₀ |\n|---|---|\n\n> so x²' },
  ])
})

test('options are read with defaults, and numbers are held to their range', () => {
  expect(readSettings({})).toEqual({
    images: 'auto',
    inline: 'image',
    promptSection: true,
    scale: 1,
    cacheBytes: 100 * 1024 * 1024,
  })
  expect(readSettings({ images: 'off', inline: 'unicode', promptSection: false, scale: 9, cacheSizeMB: 0 })).toEqual({
    images: 'off',
    inline: 'unicode',
    promptSection: false,
    scale: 2,
    cacheBytes: 1024 * 1024,
  })
  expect(readSettings({ images: 'sometimes', scale: 'big' })).toMatchObject({ images: 'auto', scale: 1 })
})

test('pictures are drawn where Claude Code draws kitty graphics', () => {
  expect(drawsImages({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(drawsImages({ TERM: 'xterm-ghostty' })).toBe(true)
  expect(drawsImages({ TERM: 'xterm-kitty' })).toBe(true)
  expect(drawsImages({ KITTY_WINDOW_ID: '1' })).toBe(true)
  expect(drawsImages({ TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' })).toBe(false)
  expect(drawsImages({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-1000/default,1,0' })).toBe(false)
  expect(drawsImages({ TERM: 'xterm-kitty', STY: '1.pts-0' })).toBe(false)
  expect(drawsImages({ TERM_PROGRAM: 'ghostty', CLAUDE_CODE_SESSION_KIND: 'bg' })).toBe(false)
  expect(drawsImages({ TMUX: 'x', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
})

test('the renderer is checked only when pictures are wanted', async () => {
  const checks: string[] = []
  const check = (answer: string) => async () => {
    checks.push(answer)
    return answer
  }
  const ghostty = { TERM_PROGRAM: 'ghostty' }
  expect(await decide('off', ghostty, check('a'))).toEqual({ kind: 'text', reason: 'setting' })
  expect(await decide('auto', { TERM: 'xterm' }, check('b'))).toEqual({ kind: 'text', reason: 'terminal' })
  expect(checks).toEqual([])
  expect(await decide('on', { TERM: 'xterm' }, check(''))).toEqual({ kind: 'images', source: 'file' })
  // Inside tmux Claude Code draws no images at all, so `on` writes text too, unless images are forced.
  expect(await decide('on', { TERM: 'xterm-kitty', TMUX: 'x' }, check(''))).toEqual({ kind: 'text', reason: 'terminal' })
  expect(await decide('on', { TMUX: 'x', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' }, check(''))).toEqual({
    kind: 'images',
    source: 'file',
  })
  expect(await decide('auto', ghostty, check('latex dvipng'))).toEqual({
    kind: 'text',
    reason: 'missing',
    missing: 'latex dvipng',
  })
  // Across ssh the terminal cannot read this machine's files, so the pictures travel as bytes.
  expect(await decide('auto', { TERM: 'xterm-kitty', SSH_CONNECTION: '10.0.0.2 51000 10.0.0.1 22' }, check(''))).toEqual({
    kind: 'images',
    source: 'bytes',
  })
})

function file(name: string, size: number, mtimeMs: number): FsEntry {
  return { name, kind: 'file', size, mtimeMs, isLink: false }
}

test('the cache drops whole pictures, least recently used first, and nothing else', () => {
  const entries = [
    file('aaaa.png', 600, 3000),
    file('aaaa.cells', 4, 3000),
    file('bbbb.png', 600, 1000),
    file('bbbb.cells', 4, 1000),
    file('cccc.png', 600, 2000),
    file('cccc.cells', 4, 2000),
    file('notes.txt', 9000, 0),
    { name: 'dddd.png', kind: 'dir', size: 0, mtimeMs: 0, isLink: false } as const,
  ]
  expect(overflow(entries, 10_000)).toEqual([])
  expect(overflow(entries, 1300).sort()).toEqual(['bbbb.cells', 'bbbb.png'])
  expect(overflow(entries, 700).sort()).toEqual(['bbbb.cells', 'bbbb.png', 'cccc.cells', 'cccc.png'])
})

test('a reply drawn as text has its display math in Unicode, or as a LaTeX block', () => {
  expect(asText('So:\n\n$$\\alpha_{ij} = \\frac{a}{b}$$\n\nwith $x^2$.')).toBe('So:\n\nαᵢⱼ = a/b\n\nwith x².')
  expect(asText('$$\\begin{aligned} a &= b \\end{aligned}$$')).toBe(
    '```latex\n\\begin{aligned} a &= b \\end{aligned}\n```',
  )
  expect(asText('\\begin{align}\na &= b\n\\end{align}')).toBe('```latex\n\\begin{align}\na &= b\n\\end{align}\n```')
})

test('text that starts a line with a list or heading marker is escaped', () => {
  expect(asText('$$- \\frac{1}{2} x$$')).toBe('\\- 1/2 x')
  expect(asText('$$\\# x$$')).toBe('\\# x')
  expect(asText('$$2. x$$')).toBe('2\\. x')
  expect(inline('$-x$ is negative')).toBe('\\-x is negative')
  expect(inline('so\n  $-x$ here')).toBe('so\n  \\-x here')
  expect(inline('so $-x$ here')).toBe('so -x here')
})

const MESSAGE = {
  plugin: 'latex-math',
  surface: 'terminal',
  component: 'AssistantMessage',
  requestId: 'message-1',
  viewport: { columns: 60, rows: 40 },
} as const

const DONE = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const CACHE = '/home/a/.cache/claude-latex-math'

// A whole PNG of one pixel: what every byte read of a picture answers.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

type Machine = {
  env?: Record<string, string>
  theme?: string
  /** Text files the plugin reads, by path; any other text read answers '{}'. */
  files?: Record<string, string>
  /** What `render.sh --check` prints: '' when nothing is missing. */
  missing?: string
  /** How many of the first `render.sh --check` runs reject, as an abandoned dispatch does. */
  checkRejects?: number
  /** Paths that no longer exist, as after a cache trim. */
  gone?: Set<string>
  cache?: FsEntry[]
  /** A render's size for its input, or undefined for LaTeX to refuse it. */
  size?: (stdin: string) => string | undefined
}

/** Answers what the plugin asks of the machine, and records the commands it runs and the lines it logs. */
function machine(on: Parameters<TestBody>[1], setup: Machine = {}) {
  const runs: { argv: readonly string[]; stdin: string | undefined }[] = []
  const logs: string[] = []
  const byteReads: string[] = []
  let checks = 0
  const env: Record<string, string> = { HOME: '/home/a', TERM_PROGRAM: 'ghostty', ...setup.env }
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice',
        value: setup.theme ?? 'dark',
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('fs.list', () => ({ value: setup.cache ?? [] }))
  on('fs.exists', ($, e) => ({ value: !setup.gone?.has(e.path) }))
  on('fs.read', ($, e) => {
    if (e.as !== 'bytes') return { value: setup.files?.[e.path] ?? '{}' }
    byteReads.push(e.path)
    return { value: { base64: PIXEL } }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    if (e.argv[0] === 'ghostty') return { value: { ...DONE, stdout: 'font-size = 9\nforeground = #CDF2E3\n' } }
    if (e.argv[0] === 'rm') return { value: { ...DONE, stdout: '' } }
    if (e.argv[2] === '--check') {
      if (++checks <= (setup.checkRejects ?? 0)) throw new Error('the dispatch was abandoned')
      return { value: { ...DONE, exitCode: setup.missing ? 1 : 0, stdout: `${setup.missing ?? ''}\n` } }
    }
    const stdin = e.init?.stdin ?? ''
    const size = setup.size ? setup.size(stdin) : stdin.startsWith('\\(') ? '3 1' : '9 2'
    if (size === undefined) return { value: { ...DONE, exitCode: 1, stdout: '', stderr: '! Missing } inserted.' } }
    return { value: { ...DONE, stdout: `${size}\n` } }
  })
  const renders = () => runs.filter(run => run.argv[0] === 'bash' && run.argv[2] !== '--check')
  return { runs, logs, renders, byteReads, checks: () => checks }
}

function engineDraws(on: Parameters<TestBody>[1]) {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => ({
    type: 'Text',
    props: {},
    children: [`engine: ${e.props.text}`],
  }))
}

test('a reply draws display math as images, inline math as one-row images, and the rest as text', async ($, on) => {
  const { renders } = machine(on, {
    // The long formula is 98 columns wide: wider than the 60-column viewport.
    size: stdin => (stdin.includes('\\frac{') ? undefined : stdin.includes('long') ? '98 2' : stdin.startsWith('\\(') ? '3 1' : '9 2'),
  })
  engineDraws(on)

  const text =
    'Euler:\n\n$$e^{i\\pi} + 1 = 0$$\n\nthen $\\beta_0$ holds\n\n$$long$$\n\nand broken\n\n$$\\frac{1$$\n\nDone.'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })

  // The engine still draws the opening text, so the bullet stays its own.
  expect(await ui.find({ type: 'Text', text: 'engine: Euler:' })).toBeDefined()
  const images = await ui.findAll({ type: 'Image' })
  expect(images.map(image => image.props)).toMatchObject([
    {
      source: { file: `${CACHE}/${keyOf('cdf2e3', '\\[ e^{i\\pi} + 1 = 0 \\]')}.png`, format: 'png' },
      columns: 9,
      rows: 2,
      alt: '$$e^{i\\pi} + 1 = 0$$',
    },
    { source: { file: `${CACHE}/${keyOf('cdf2e3', '\\(\\beta_0\\)')}.png` }, columns: 3, rows: 1, alt: '$\\beta_0$' },
    // 60 columns less the indent and a margin leave 56, so 98 x 2 becomes 56 x 1.
    { columns: 56, rows: 1 },
  ])
  const display = renders().find(run => run.stdin === '\\[ e^{i\\pi} + 1 = 0 \\]')
  expect(display?.argv.slice(2)).toEqual([CACHE, keyOf('cdf2e3', '\\[ e^{i\\pi} + 1 = 0 \\]'), 'cdf2e3', 'display', '1'])
  expect(renders().find(run => run.stdin === '\\(\\beta_0\\)')?.argv[5]).toBe('inline')
  // The paragraph around the inline formula is drawn word by word.
  expect(await ui.find({ type: 'Text', text: 'then' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'holds' })).toBeDefined()
  // A formula LaTeX refuses shows its source and the reason.
  expect(await ui.find({ type: 'Text', text: '$$\\frac{1$$' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Missing \} inserted/ })).toBeDefined()
  const texts = await ui.findAll({ type: 'Markdown' })
  expect(texts.map(markdown => markdown.props.text)).toEqual(['and broken', 'Done.'])
  await ui.unmount()

  // A second draw of the same reply runs no renderer again.
  const again = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect((await again.findAll({ type: 'Image' })).length).toBe(3)
  expect(renders().length).toBe(4)
})

test('the formula takes the text colour of a custom Claude Code theme', async ($, on) => {
  const { runs, renders } = machine(on, {
    theme: 'custom:omarchy',
    env: { HOME: '/home/b' },
    files: { '/home/b/.claude/themes/omarchy.json': JSON.stringify({ base: 'dark', overrides: { text: '#AABBCC' } }) },
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '$$x$$', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(renders().map(run => run.argv[4])).toEqual(['aabbcc'])
  // The terminal's own colour is not asked for: the theme names one.
  expect(runs.some(run => run.argv[0] === 'ghostty')).toBe(false)
})

test('a reply that opens with inline math draws its own bullet, and a failed formula shows its source', async ($, on) => {
  machine(on, { theme: 'light', size: stdin => (stdin.includes('\\frac{') ? undefined : '2 1') })
  on('ui.render', () => {
    throw new Error('the engine draws no part of this reply')
  })
  const text = 'So $\\alpha^2$ costs $5, not $\\frac{1$.'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
  expect((await ui.findAll({ type: 'Image' })).map(image => image.props.alt)).toEqual(['$\\alpha^2$'])
  expect(await ui.find({ type: 'Text', text: '$5,' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$\\frac{1$' })).toBeDefined()
})

test('inline math in a table is rewritten as Unicode and the reply is drawn by the engine', async ($, on) => {
  const { renders } = machine(on)
  engineDraws(on)
  const text = '| term | $\\alpha^2$ |\n|---|---|'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: 'engine: | term | α² |\n|---|---|' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(renders()).toEqual([])
})

test('a reply without math, and any reply off the terminal, is left to the engine', async ($, on) => {
  const { runs } = machine(on)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const plain = await $.ui.mount({ ...MESSAGE, props: { text: 'Costs $5, or `$$x$$`.', isFirstOfReply: true } })
  expect(await plain.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(await plain.find({ type: 'Image' })).toBeUndefined()
  const desktop = await $.ui.mount({ ...MESSAGE, surface: 'desktop', props: { text: '$$x$$', isFirstOfReply: true } })
  expect(await desktop.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(runs.filter(run => run.argv[2] !== '--check')).toEqual([])
})

test('in a terminal without kitty graphics, math is Unicode text and nothing is rendered', async ($, on) => {
  const { runs, logs } = machine(on, { env: { TERM_PROGRAM: 'iTerm.app' } })
  engineDraws(on)
  const text = 'Here $x^2$ grows:\n\n$$\\alpha = \\frac{a}{b}$$'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: 'engine: Here x² grows:\n\nα = a/b' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(runs).toEqual([])
  expect(logs).toEqual([])
})

test('when the renderer lacks its tools, one notice says so and math is Unicode text', async ($, on) => {
  const { logs, renders } = machine(on, { missing: 'latex dvipng' })
  engineDraws(on)
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (const id of ['message-1', 'message-2']) {
    const ui = await $.ui.mount({ ...MESSAGE, requestId: id, props: { text: '$$x^2$$', isFirstOfReply: true } })
    expect(await ui.find({ type: 'Text', text: 'engine: x²' })).toBeDefined()
  }
  expect(logs).toEqual([
    'latex-math: latex and dvipng not found, so math is shown as Unicode text. See https://github.com/atomashevic/claude-latex-math#requirements',
  ])
  expect(renders()).toEqual([])
})

const COMPOSE = { model: 'm', promptModel: 'm', tools: [], outputStyle: null, traits: [] } as const

function intro(on: Parameters<TestBody>[1]) {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
}

async function sectionIds($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop' = 'terminal') {
  return (await $.prompt.compose({ ...COMPOSE, surfaces: [surface] })).sections.map(section => section.id)
}

test('the system prompt tells Claude that math is typeset, on the terminal only', async ($, on) => {
  machine(on)
  intro(on)
  const composed = await $.prompt.compose({ ...COMPOSE, surfaces: ['terminal'] })
  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'latex-math:rendering'])
  expect(composed.sections[1]?.text).toContain('is drawn inside the line, one text row tall')
  expect(await sectionIds($, 'desktop')).toEqual(['intro'])
})

test('without pictures, the system prompt says nothing about math', async ($, on) => {
  machine(on, { env: { TERM_PROGRAM: 'Apple_Terminal' } })
  intro(on)
  expect(await sectionIds($)).toEqual(['intro'])
})

test('images=off writes math as Unicode text in a terminal that draws pictures', { options: { images: 'off' } }, async ($, on) => {
  const { runs } = machine(on)
  engineDraws(on)
  intro(on)
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '$$x^2$$', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: 'engine: x²' })).toBeDefined()
  expect(await sectionIds($)).toEqual(['intro'])
  expect(runs).toEqual([])
})

test('images=on draws pictures in any terminal', { options: { images: 'on' } }, async ($, on) => {
  machine(on, { env: { TERM_PROGRAM: 'iTerm.app' } })
  engineDraws(on)
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '$$x^2$$', isFirstOfReply: true } })
  expect((await ui.find({ type: 'Image' }))?.props.alt).toBe('$$x^2$$')
})

test('inline=unicode keeps pictures for display math only', { options: { inline: 'unicode' } }, async ($, on) => {
  const { renders } = machine(on)
  engineDraws(on)
  intro(on)
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: 'Let $x^2$ be:\n\n$$y = x^2$$', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: 'engine: Let x² be:' })).toBeDefined()
  expect((await ui.findAll({ type: 'Image' })).map(image => image.props.alt)).toEqual(['$$y = x^2$$'])
  expect(renders().map(run => run.argv[5])).toEqual(['display'])
  const composed = await $.prompt.compose({ ...COMPOSE, surfaces: ['terminal'] })
  expect(composed.sections[1]?.text).toContain('Inline math (`$...$`) is written as Unicode text')
})

test('promptSection=false leaves the system prompt alone', { options: { promptSection: false } }, async ($, on) => {
  machine(on)
  intro(on)
  expect(await sectionIds($)).toEqual(['intro'])
})

test('scale=1.5 renders display math larger, under a key of its own', { options: { scale: 1.5 } }, async ($, on) => {
  const { renders } = machine(on)
  engineDraws(on)
  await $.ui.mount({ ...MESSAGE, props: { text: 'For $x$:\n\n$$y$$', isFirstOfReply: true } })
  expect(renders().find(run => run.argv[5] === 'display')?.argv.slice(3)).toEqual([
    keyOf('cdf2e3@1.5', '\\[ y \\]'),
    'cdf2e3',
    'display',
    '1.5',
  ])
  expect(renders().find(run => run.argv[5] === 'inline')?.argv[6]).toBe('1')
})

test('across ssh, the pictures travel as bytes', async ($, on) => {
  const { byteReads } = machine(on, {
    env: { TERM: 'xterm-kitty', TERM_PROGRAM: '', SSH_CONNECTION: '10.0.0.2 51000 10.0.0.1 22' },
  })
  engineDraws(on)
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '$$y$$', isFirstOfReply: true } })
  expect((await ui.find({ type: 'Image' }))?.props.source).toEqual({ png: PIXEL })
  expect(byteReads).toEqual([`${CACHE}/${keyOf('ffffff', '\\[ y \\]')}.png`])
})

test('a reply that needs more than 60 LaTeX runs is written as Unicode text', async ($, on) => {
  const { renders } = machine(on)
  engineDraws(on)
  const many = Array.from({ length: 61 }, (_, i) => `$x_{${i}}$`).join(' ')
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: many, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: `engine: ${inline(many)}` })).toBeDefined()
  expect(renders()).toEqual([])
  // 61 copies of one formula need one run.
  const copies = Array.from({ length: 61 }, () => '$x$').join(' ')
  const again = await $.ui.mount({ ...MESSAGE, requestId: 'message-2', props: { text: copies, isFirstOfReply: true } })
  expect((await again.findAll({ type: 'Image' })).length).toBe(61)
  expect(renders().length).toBe(1)
})

test('with inline=unicode, inline formulas count for no LaTeX run', { options: { inline: 'unicode' } }, async ($, on) => {
  const { renders } = machine(on)
  engineDraws(on)
  const text = `${Array.from({ length: 61 }, (_, i) => `$x_{${i}}$`).join(' ')}\n\n$$y$$`
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect((await ui.findAll({ type: 'Image' })).map(image => image.props.alt)).toEqual(['$$y$$'])
  expect(renders().length).toBe(1)
})

test('a picture that is gone from the cache is rendered again', async ($, on) => {
  const gone = new Set<string>()
  const { renders } = machine(on, { gone })
  engineDraws(on)
  await $.ui.mount({ ...MESSAGE, props: { text: '$$y$$', isFirstOfReply: true } })
  await $.ui.mount({ ...MESSAGE, requestId: 'message-2', props: { text: '$$y$$', isFirstOfReply: true } })
  expect(renders().length).toBe(1)
  gone.add(`${CACHE}/${keyOf('cdf2e3', '\\[ y \\]')}.png`)
  const ui = await $.ui.mount({ ...MESSAGE, requestId: 'message-3', props: { text: '$$y$$', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(renders().length).toBe(2)
})

test('a terminal session start trims the cache, with images on or off', { options: { cacheSizeMB: 1, images: 'off' } }, async ($, on) => {
  const mb = 1024 * 1024
  const { runs } = machine(on, {
    cache: [file('aaaa.png', 0.6 * mb, 3000), file('aaaa.cells', 4, 3000), file('bbbb.png', 0.6 * mb, 1000), file('bbbb.cells', 4, 1000)],
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(runs.filter(run => run.argv[0] === 'rm').map(run => run.argv)).toEqual([
    ['rm', '-f', '--', `${CACHE}/bbbb.png`, `${CACHE}/bbbb.cells`],
  ])
})

test('a start whose check cannot run draws text once and decides again on the next draw', async ($, on) => {
  const { logs, checks } = machine(on, { checkRejects: 1 })
  engineDraws(on)
  const first = await $.ui.mount({ ...MESSAGE, props: { text: '$$x^2$$', isFirstOfReply: true } })
  expect(await first.find({ type: 'Text', text: 'engine: x²' })).toBeDefined()
  const second = await $.ui.mount({ ...MESSAGE, requestId: 'message-2', props: { text: '$$x^2$$', isFirstOfReply: true } })
  expect((await second.find({ type: 'Image' }))?.props.alt).toBe('$$x^2$$')
  expect(checks()).toBe(2)
  expect(logs).toEqual([])
})

test('a session that never draws, such as claude -p, does no start-up work', async ($, on) => {
  const { runs } = machine(on, { cache: [file('aaaa.png', 9 * 1024 * 1024 * 1024, 1)] })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
  expect(runs).toEqual([])
})
