// Inline math as Unicode text: `$\beta_0 \leq x^2$` becomes `β₀ ≤ x²`.

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
  oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙', wedge: '∧', land: '∧', vee: '∨', lor: '∨',
  cap: '∩', cup: '∪', setminus: '∖', neg: '¬', lnot: '¬', dagger: '†',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', ll: '≪', gg: '≫', approx: '≈', sim: '∼',
  simeq: '≃', cong: '≅', equiv: '≡', propto: '∝', doteq: '≐', prec: '≺', succ: '≻', preceq: '⪯',
  succeq: '⪰', parallel: '∥', perp: '⊥', mid: '∣', nmid: '∤', models: '⊨', vdash: '⊢',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', nexists: '∄',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', iff: '⟺', mapsto: '↦', longrightarrow: '⟶',
  longleftarrow: '⟵', uparrow: '↑', downarrow: '↓', hookrightarrow: '↪', rightharpoonup: '⇀',
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃',
  bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', bigvee: '⋁', bigwedge: '⋀',
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘',
  top: '⊤', bot: '⊥', angle: '∠', triangle: '△', square: '□', Box: '□', degree: '°', prime: '′',
  dots: '…', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  langle: '⟨', rangle: '⟩', lVert: '‖', rVert: '‖', Vert: '‖', lvert: '|', rvert: '|', vert: '|',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', lbrace: '{', rbrace: '}', backslash: '\\',
  therefore: '∴', because: '∵', qed: '∎', surd: '√',
  ',': ' ', ';': ' ', ':': ' ', ' ': ' ', '!': '', quad: ' ', qquad: '  ', '\\': ' ',
  '{': '{', '}': '}', '%': '%', $: '$', '&': '&', _: '_', '#': '#', '|': '‖',
}

const FUNCTIONS = new Set(
  'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp min max sup inf lim liminf limsup arg det dim ker deg gcd hom Pr mod'.split(
    ' ',
  ),
)

// Commands that change size or style, which plain text has no use for.
const DROPPED = new Set(
  'left right big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr middle displaystyle textstyle scriptstyle limits nolimits nonumber'.split(
    ' ',
  ),
)

// Commands whose one argument is drawn as it stands.
const PLAIN = new Set(
  'text textrm textbf textit textsf texttt mathrm mathbf mathit mathsf mathtt mathnormal operatorname boldsymbol bm mbox'.split(
    ' ',
  ),
)

const ACCENTS: Record<string, string> = {
  hat: '̂', widehat: '̂', tilde: '̃', widetilde: '̃', bar: '̄',
  vec: '⃗', dot: '̇', ddot: '̈', check: '̌', breve: '̆',
  overline: '̅', underline: '̲',
}

const SUPERSCRIPTS: Record<string, string> = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ',
  m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ',
  z: 'ᶻ', T: 'ᵀ', '⊤': 'ᵀ', '′': '′', '∘': '°', '°': '°', '∗': '*', '*': '*', '†': '†',
}

const SUBSCRIPTS: Record<string, string> = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', β: 'ᵦ', γ: 'ᵧ', ρ: 'ᵨ', φ: 'ᵩ', χ: 'ᵪ',
}

// The letters Unicode placed outside the run of their alphabet.
const DOUBLE_STRUCK: Record<string, string> = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }
const SCRIPT: Record<string, string> = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ' }
const ALPHABETS: Record<string, { first: number; outside: Record<string, string> }> = {
  mathbb: { first: 0x1d538, outside: DOUBLE_STRUCK },
  mathcal: { first: 0x1d49c, outside: SCRIPT },
  mathscr: { first: 0x1d49c, outside: SCRIPT },
}

// Operators written against their operand, as TeX sets them: `\partial f` is `∂f`.
const PREFIXES = new Set(['partial', 'nabla', 'neg', 'lnot'])

const ROOTS: Record<string, string> = { '': '√', 2: '√', 3: '∛', 4: '∜' }

const TOKEN = /\\[a-zA-Z]+|\\[^a-zA-Z]|[{}^_]|\s+|[^\\{}^_\s]/gu
const SPACE = /^\s+$/

/** Thrown at a construct plain text cannot hold: an environment, an unknown command. */
class Unsupported extends Error {}

function isAtomic(text: string): boolean {
  return !/[\s+\-−=<>≤≥·×/,]/.test(text)
}

function script(mark: '^' | '_', argument: string): string {
  const table = mark === '^' ? SUPERSCRIPTS : SUBSCRIPTS
  const characters = [...argument.replace(/\s+/g, '')]
  if (characters.every(character => table[character] !== undefined)) {
    return characters.map(character => table[character]).join('')
  }
  return characters.length === 1 ? `${mark}${characters[0]}` : `${mark}(${argument.trim()})`
}

function accent(name: string, argument: string): string {
  const characters = [...argument]
  const mark = ACCENTS[name] ?? ''
  if (name === 'overline' || name === 'underline') return characters.map(one => one + mark).join('')
  return characters.length === 1 ? argument + mark : `${name}(${argument})`
}

function alphabet(name: string, argument: string): string {
  const { first, outside } = ALPHABETS[name] ?? { first: 0, outside: {} }
  return [...argument]
    .map(one => {
      if (outside[one] !== undefined) return outside[one]
      if (one >= 'A' && one <= 'Z') return String.fromCodePoint(first + one.charCodeAt(0) - 65)
      return one === '1' && name === 'mathbb' ? '𝟙' : one
    })
    .join('')
}

/** The formula as Unicode text, or undefined when plain text cannot hold it. */
export function unicode(tex: string): string | undefined {
  const tokens = tex.match(TOKEN) ?? []
  let at = 0

  const skipSpace = () => {
    while (SPACE.test(tokens[at] ?? '')) at++
  }
  const sequence = (until: string): string => {
    let out = ''
    while (at < tokens.length && tokens[at] !== until) out += atom()
    at++
    return out
  }
  // What a command or a script takes: a braced group, or the next single token.
  const argument = (): string => {
    skipSpace()
    return at < tokens.length ? atom() : ''
  }
  const root = (): string => {
    skipSpace()
    let degree = ''
    if (tokens[at] === '[') {
      at++
      degree = sequence(']').trim()
    }
    const sign = ROOTS[degree] ?? `${script('^', degree)}√`
    const under = argument()
    return isAtomic(under) ? sign + under : `${sign}(${under})`
  }
  const atom = (): string => {
    const token = tokens[at++] ?? ''
    if (token === '{') return sequence('}')
    if (token === '^' || token === '_') return script(token, argument())
    if (token === "'") return '′'
    if (SPACE.test(token)) return ' '
    if (token[0] !== '\\') return token

    const name = token.slice(1)
    if (name === 'begin' || name === 'end') throw new Unsupported(name)
    if (DROPPED.has(name)) {
      // `\left.` and `\right.` are delimiters that draw nothing.
      if ((name === 'left' || name === 'right') && tokens[at] === '.') at++
      return ''
    }
    if (PLAIN.has(name)) {
      if (tokens[at] === '*') at++
      return argument()
    }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      const [over, under] = [argument(), argument()].map(part => (isAtomic(part) ? part : `(${part})`))
      return `${over}/${under}`
    }
    if (name === 'binom') return `C(${argument()}, ${argument()})`
    if (name === 'sqrt') return root()
    if (ACCENTS[name] !== undefined) return accent(name, argument())
    if (ALPHABETS[name] !== undefined) return alphabet(name, argument())
    if (FUNCTIONS.has(name)) return name
    if (PREFIXES.has(name)) skipSpace()
    const symbol = SYMBOLS[name]
    // An unknown command would be drawn wrong, so the formula keeps its source.
    if (symbol === undefined) throw new Unsupported(name)
    return symbol
  }

  try {
    let out = ''
    while (at < tokens.length) out += atom()
    return out
      .replace(/\s+/g, ' ')
      .replace(/([(⟨⌊⌈]) | (?=[)⟩⌋⌉])/g, '$1')
      .trim()
  } catch (error) {
    if (error instanceof Unsupported) return undefined
    throw error
  }
}

// Code comes first so a dollar sign inside a fence or a code span stays text. A dollar opens
// math only before a non-space and closes it only after one, so "$5 and $10" stays text.
const INLINE =
  /(?:^|\n)[ \t]*(```|~~~)[\s\S]*?(?:\n[ \t]*\1|$)|`[^`\n]*`|\\\((.+?)\\\)|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?![\d$])/g

/** Whether a piece of a reply's markdown holds inline math outside its code. */
export function hasInline(markdown: string): boolean {
  for (const match of markdown.matchAll(INLINE)) if ((match[2] ?? match[3]) !== undefined) return true
  return false
}

/** A piece of a reply's markdown with its inline math, `$…$` and `\(…\)`, written as Unicode. */
export function inline(markdown: string): string {
  return markdown.replace(INLINE, (whole: string, _fence?: string, paren?: string, dollar?: string) => {
    const tex = paren ?? dollar
    if (tex === undefined) return whole
    // The result is markdown again, so the characters markdown reads as markup are escaped.
    return unicode(tex)?.replace(/[\\*_`~[\]<>|]/g, '\\$&') ?? whole
  })
}
