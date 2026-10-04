import { expect, test } from 'claude-code/testing'

import { blocks } from '../hooks/flow'
import { fit, hexColour, keyOf, segments } from '../hooks/math'
import { inline, unicode } from '../hooks/unicode'

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

const MESSAGE = {
  plugin: 'latex-math',
  surface: 'terminal',
  component: 'AssistantMessage',
  requestId: 'message-1',
  viewport: { columns: 60, rows: 40 },
} as const

const DONE = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

test('a reply draws display math as images, inline math as one-row images, and the rest as text', async ($, on) => {
  const runs: { argv: readonly string[]; stdin: string | undefined }[] = []
  on('env.get', ($, e) => ({ value: { HOME: '/home/a', TERM_PROGRAM: 'ghostty' }[e.name] }))
  on('settings.read', () => ({ value: { theme: 'dark' } }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'ghostty') return { value: { ...DONE, stdout: 'font-size = 9\nforeground = #CDF2E3\n' } }
    const stdin = e.init?.stdin ?? ''
    runs.push({ argv: e.argv, stdin })
    if (stdin.includes('\\frac{')) return { value: { ...DONE, exitCode: 1, stdout: '', stderr: '! Missing } inserted.' } }
    // The long formula is 98 columns wide: wider than the 60-column viewport.
    const size = stdin.includes('long') ? '98 2' : stdin.startsWith('\\(') ? '3 1' : '9 2'
    return { value: { ...DONE, stdout: `${size}\n` } }
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => ({
    type: 'Text',
    props: {},
    children: [`engine: ${e.props.text}`],
  }))

  const text =
    'Euler:\n\n$$e^{i\\pi} + 1 = 0$$\n\nthen $\\beta_0$ holds\n\n$$long$$\n\nand broken\n\n$$\\frac{1$$\n\nDone.'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })

  // The engine still draws the opening text, so the bullet stays its own.
  expect(await ui.find({ type: 'Text', text: 'engine: Euler:' })).toBeDefined()
  const cache = '/home/a/.cache/claude-latex-math'
  const images = await ui.findAll({ type: 'Image' })
  expect(images.map(image => image.props)).toMatchObject([
    {
      source: { file: `${cache}/${keyOf('cdf2e3', '\\[ e^{i\\pi} + 1 = 0 \\]')}.png`, format: 'png' },
      columns: 9,
      rows: 2,
      alt: '$$e^{i\\pi} + 1 = 0$$',
    },
    { source: { file: `${cache}/${keyOf('cdf2e3', '\\(\\beta_0\\)')}.png` }, columns: 3, rows: 1, alt: '$\\beta_0$' },
    // 60 columns less the indent and a margin leave 56, so 98 x 2 becomes 56 x 1.
    { columns: 56, rows: 1 },
  ])
  const display = runs.find(run => run.stdin === '\\[ e^{i\\pi} + 1 = 0 \\]')
  expect(display?.argv.slice(2)).toEqual([cache, keyOf('cdf2e3', '\\[ e^{i\\pi} + 1 = 0 \\]'), 'cdf2e3', 'display'])
  expect(runs.find(run => run.stdin === '\\(\\beta_0\\)')?.argv[5]).toBe('inline')
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
  expect(runs.length).toBe(4)
})

test('the formula takes the text colour of a custom Claude Code theme', async ($, on) => {
  const colours: (string | undefined)[] = []
  on('env.get', ($, e) => ({ value: { HOME: '/home/b', TERM_PROGRAM: 'ghostty' }[e.name] }))
  on('settings.read', () => ({ value: { theme: 'custom:omarchy' } }))
  on('fs.read', ($, e) => {
    expect(e.path).toBe('/home/b/.claude/themes/omarchy.json')
    return { value: JSON.stringify({ base: 'dark', overrides: { text: '#AABBCC' } }) }
  })
  on('process.run', ($, e) => {
    // The terminal's own colour is not asked for: the theme names one.
    expect(e.argv[0]).toBe('bash')
    colours.push(e.argv[4])
    return { value: { exitCode: 0, stdout: '9 2\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '$$x$$', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(colours).toEqual(['aabbcc'])
})

test('a reply that opens with inline math draws its own bullet, and a failed formula shows its source', async ($, on) => {
  on('env.get', ($, e) => ({ value: { HOME: '/home/c' }[e.name] }))
  on('settings.read', () => ({ value: { theme: 'light' } }))
  on('process.run', ($, e) => {
    const isBroken = e.init?.stdin?.includes('\\frac{')
    return { value: { ...DONE, exitCode: isBroken ? 1 : 0, stdout: isBroken ? '' : '2 1\n', stderr: isBroken ? '! Bad.' : '' } }
  })
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
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => ({
    type: 'Text',
    props: {},
    children: [`engine: ${e.props.text}`],
  }))
  on('process.run', () => {
    throw new Error('no renderer should run')
  })
  const text = '| term | $\\alpha^2$ |\n|---|---|'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: 'engine: | term | α² |\n|---|---|' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
})

test('a reply without math, and any reply off the terminal, is left to the engine', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  on('process.run', () => {
    throw new Error('no renderer should run')
  })
  const plain = await $.ui.mount({ ...MESSAGE, props: { text: 'Costs $5, or `$$x$$`.', isFirstOfReply: true } })
  expect(await plain.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(await plain.find({ type: 'Image' })).toBeUndefined()
  const desktop = await $.ui.mount({ ...MESSAGE, surface: 'desktop', props: { text: '$$x$$', isFirstOfReply: true } })
  expect(await desktop.find({ type: 'Text', text: 'engine row' })).toBeDefined()
})

test('the system prompt tells the model that display math renders, on the terminal only', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  const base = { model: 'm', promptModel: 'm', tools: [], outputStyle: null, traits: [] }
  const terminal = await $.prompt.compose({ ...base, surfaces: ['terminal'] })
  expect(terminal.sections.map(section => section.id)).toEqual(['intro', 'latex-math:rendering'])
  const desktop = await $.prompt.compose({ ...base, surfaces: ['desktop'] })
  expect(desktop.sections.map(section => section.id)).toEqual(['intro'])
})
