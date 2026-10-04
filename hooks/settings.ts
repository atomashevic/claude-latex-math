import type { PluginOptions } from 'claude-code'

/** The plugin's options, as the user set them under /plugin, each one checked and in its unit. */
export type Settings = {
  /** auto: pictures where the terminal draws them; on: pictures everywhere; off: Unicode text. */
  images: 'auto' | 'on' | 'off'
  /** How inline math is drawn when pictures are on. */
  inline: 'image' | 'unicode'
  /** Whether Claude is told that this terminal typesets math. */
  promptSection: boolean
  /** The size of display formulas, as a multiple of the default, from 0.5 to 2. */
  scale: number
  /** The largest size of the picture cache, in bytes. */
  cacheBytes: number
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.find(choice => choice === value) ?? fallback
}

function between(value: unknown, low: number, high: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback
}

export function readSettings(options: PluginOptions): Settings {
  return {
    images: oneOf(options.images, ['auto', 'on', 'off'], 'auto'),
    inline: oneOf(options.inline, ['image', 'unicode'], 'image'),
    promptSection: options.promptSection !== false,
    scale: between(options.scale, 0.5, 2, 1),
    cacheBytes: between(options.cacheSizeMB, 1, 10000, 100) * 1024 * 1024,
  }
}
